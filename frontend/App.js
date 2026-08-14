/*
HeartGuard App.js

Prototype v1 goals:
- Take an ECG photo with Expo Camera.
- Select an existing ECG image with Expo Image Picker.
- Preview the image before upload.
- Send it to FastAPI and reject failed analyses cleanly.
- Show conservative "Finding" language instead of "Diagnosis".
- Display signal quality and save results locally.
*/

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

import { styles } from './styles';
import { analyzeECGImage } from './api';

const STORAGE_KEY = 'heartguard_images';

function qualityLabel(value) {
  if (value >= 0.75) return 'Good';
  if (value >= 0.5) return 'Fair';
  if (value > 0) return 'Low';
  return 'Unknown';
}

export default function App() {
  const [images, setImages] = useState([]);
  const [latestResult, setLatestResult] = useState(null);
  const [currentTab, setCurrentTab] = useState('Home');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadImages = async () => {
      try {
        const savedImages = await AsyncStorage.getItem(STORAGE_KEY);

        if (savedImages) {
          const parsedImages = JSON.parse(savedImages);
          const normalizedImages = Array.isArray(parsedImages)
            ? parsedImages
            : [];

          setImages(normalizedImages);

          if (normalizedImages.length > 0) {
            setLatestResult(normalizedImages[0]);
          }
        }
      } catch (error) {
        console.error('Failed to load scan history:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadImages();
  }, []);

  useEffect(() => {
    const saveImages = async () => {
      if (!isLoaded) return;

      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(images));
      } catch (error) {
        console.error('Failed to save scan history:', error);
      }
    };

    saveImages();
  }, [images, isLoaded]);

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading HeartGuard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.appShell}>
      <View style={styles.screenArea}>
        {currentTab === 'Home' && (
          <HomeScreen
            images={images}
            latestResult={latestResult}
            setTab={setCurrentTab}
          />
        )}

        {currentTab === 'Camera' && (
          <ScanScreen
            images={images}
            setImages={setImages}
            setLatestResult={setLatestResult}
            setTab={setCurrentTab}
          />
        )}

        {currentTab === 'Analysis' && (
          <AnalysisScreen
            latestResult={latestResult}
            setTab={setCurrentTab}
          />
        )}

        {currentTab === 'Gallery' && <GalleryScreen images={images} />}
      </View>

      <TabBar currentTab={currentTab} setTab={setCurrentTab} />
    </View>
  );
}

function HomeScreen({ images, latestResult, setTab }) {
  const latestAnalysis = latestResult?.analysis;
  const latestFinding =
    latestAnalysis?.finding || latestAnalysis?.diagnosis || 'Unknown';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>HeartGuard</Text>
      <Text style={styles.subtitle}>
        Prototype ECG image scanner for clear, cropped single-lead strips and screenshots.
      </Text>

      <View style={styles.dashboardCard}>
        <Text style={styles.cardLabel}>Total Scans</Text>
        <Text style={styles.cardNumber}>{images.length}</Text>
      </View>

      <View style={styles.dashboardCard}>
        <Text style={styles.cardLabel}>Latest Result</Text>

        {latestResult ? (
          <>
            <Text style={styles.bpmLarge}>{latestAnalysis.bpm} BPM</Text>
            <Text style={styles.resultText}>{latestFinding}</Text>
            <Text style={styles.mutedText}>{latestAnalysis.timestamp}</Text>
          </>
        ) : (
          <Text style={styles.mutedText}>No ECG scans yet.</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => setTab('Camera')}
      >
        <Text style={styles.primaryButtonText}>Scan or Import ECG</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => setTab('Gallery')}
      >
        <Text style={styles.secondaryButtonText}>View Scan History</Text>
      </TouchableOpacity>

      <Text style={styles.disclaimerText}>
        Prototype only. HeartGuard does not diagnose medical conditions and should not be used for emergency decisions.
      </Text>
    </SafeAreaView>
  );
}

function ScanScreen({ images, setImages, setLatestResult, setTab }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const takePicture = async () => {
    try {
      if (!cameraRef.current) {
        Alert.alert('Camera Error', 'Camera is not ready yet.');
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        skipProcessing: false,
      });

      setSelectedImage({
        uri: photo.uri,
        mimeType: 'image/jpeg',
        fileName: 'heartguard-camera.jpg',
        source: 'Camera',
      });
    } catch (error) {
      console.error('Capture failed:', error);
      Alert.alert('Capture Failed', 'Could not take a photo.');
    }
  };

  const chooseFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      setSelectedImage({
        uri: asset.uri,
        mimeType: asset.mimeType || null,
        fileName: asset.fileName || null,
        source: 'Gallery',
      });
    } catch (error) {
      console.error('Image picker failed:', error);
      Alert.alert('Import Failed', 'Could not open the image library.');
    }
  };

  const analyzeSelectedImage = async () => {
    if (!selectedImage || loading) return;

    setLoading(true);

    try {
      const analysis = await analyzeECGImage(
        selectedImage.uri,
        selectedImage.mimeType,
        selectedImage.fileName,
      );

      if (analysis.error) {
        Alert.alert('Analysis Not Completed', analysis.error);
        return;
      }

      const finding =
        analysis.conditions?.length > 0
          ? analysis.conditions.join(', ')
          : 'Unknown';

      const newItem = {
        id: Date.now().toString(),
        uri: selectedImage.uri,
        source: selectedImage.source,
        analysis: {
          bpm: analysis.heart_rate,
          finding,
          rhythm: analysis.rhythm,
          confidence: analysis.confidence,
          signalQuality: analysis.signal_quality,
          interpretation: analysis.summary,
          recommendation: analysis.recommendation,
          disclaimer: analysis.disclaimer,
          timestamp: new Date().toLocaleString(),
        },
      };

      setImages([newItem, ...images]);
      setLatestResult(newItem);
      setSelectedImage(null);
      setTab('Analysis');
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('Analysis Failed', 'Unable to analyze this ECG image.');
    } finally {
      setLoading(false);
    }
  };

  if (selectedImage) {
    return (
      <SafeAreaView style={styles.previewContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Preview ECG</Text>
          <Text style={styles.subtitle}>
            Use a clear, tightly cropped single-lead ECG strip or screenshot. Avoid pages with multiple leads, large text blocks, shadows, or severe perspective distortion.
          </Text>

          <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} />

          <View style={styles.infoCard}>
            <Text style={styles.cardLabel}>Image Source</Text>
            <Text style={styles.reportValue}>{selectedImage.source}</Text>
          </View>

          {loading && (
            <View style={styles.loadingPanel}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>Analyzing ECG...</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={analyzeSelectedImage}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>Analyze ECG</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setSelectedImage(null)}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Choose Another Image</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.scanContainer}>
      <View style={styles.scanHeader}>
        <Text style={styles.title}>ECG Input</Text>
        <Text style={styles.scanSubtitle}>
          Photograph a clean ECG strip or import an existing ECG screenshot.
        </Text>
      </View>

      {Platform.OS !== 'web' && (
        <View style={styles.cameraPanel}>
          {!permission ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>Checking camera permission...</Text>
            </View>
          ) : !permission.granted ? (
            <View style={styles.permissionPanel}>
              <Text style={styles.reportValue}>Camera permission is required.</Text>
              <Text style={styles.mutedText}>
                You can still import an ECG image from your gallery below.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={requestPermission}
              >
                <Text style={styles.primaryButtonText}>Allow Camera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />
              <View style={styles.cameraOverlay} pointerEvents="none">
                <Text style={styles.cameraOverlayText}>Align one ECG strip inside frame</Text>
              </View>
              <View style={styles.cameraControls}>
                <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                  <Text style={styles.captureButtonText}>Capture ECG</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      <View style={styles.importPanel}>
        <Text style={styles.reportLabel}>Already have an ECG image?</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={chooseFromGallery}>
          <Text style={styles.secondaryButtonText}>Choose ECG from Gallery</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function AnalysisScreen({ latestResult, setTab }) {
  if (!latestResult) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.title}>No Analysis Yet</Text>
          <Text style={styles.subtitle}>Scan or import an ECG image first.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setTab('Camera')}
          >
            <Text style={styles.primaryButtonText}>Scan or Import ECG</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const analysis = latestResult.analysis;
  const finding = analysis.finding || analysis.diagnosis || 'Unknown';
  const signalQuality = analysis.signalQuality ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>ECG Analysis</Text>
        <Text style={styles.subtitle}>
          Experimental result from the most recent ECG image.
        </Text>

        <View style={styles.analysisHero}>
          <Text style={styles.cardLabel}>Estimated Heart Rate</Text>
          <Text style={styles.bpmHero}>{analysis.bpm} BPM</Text>
        </View>

        <ReportCard label="Finding" value={finding} />
        <ReportCard label="Rhythm" value={analysis.rhythm} />
        <ReportCard
          label="Signal Quality"
          value={`${qualityLabel(signalQuality)} (${Math.round(signalQuality * 100)}%)`}
        />
        <ReportCard
          label="Analysis Confidence"
          value={`${Math.round((analysis.confidence || 0) * 100)}%`}
        />
        <ReportCard label="Interpretation" value={analysis.interpretation} body />
        <ReportCard label="Recommendation" value={analysis.recommendation} body />

        <Text style={styles.mutedText}>{analysis.timestamp}</Text>
        <Text style={styles.disclaimerText}>{analysis.disclaimer}</Text>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setTab('Gallery')}
        >
          <Text style={styles.secondaryButtonText}>View History</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportCard({ label, value, body = false }) {
  return (
    <View style={styles.reportCard}>
      <Text style={styles.reportLabel}>{label}</Text>
      <Text style={body ? styles.reportBody : styles.reportValue}>{value}</Text>
    </View>
  );
}

function GalleryScreen({ images }) {
  const [selected, setSelected] = useState(null);

  if (images.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.title}>No Scan History</Text>
          <Text style={styles.subtitle}>Saved ECG analyses will appear here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Scan History</Text>
      <Text style={styles.subtitle}>Review previous prototype analyses.</Text>

      <FlatList
        data={images}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const finding = item.analysis.finding || item.analysis.diagnosis || 'Unknown';

          return (
            <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
              <Image source={{ uri: item.uri }} style={styles.image} />
              <Text style={styles.bpm}>{item.analysis.bpm} BPM</Text>
              <View style={styles.resultBadge}>
                <Text style={styles.resultBadgeText}>{finding}</Text>
              </View>
              <Text style={styles.mutedText}>Rhythm: {item.analysis.rhythm}</Text>
              <Text style={styles.mutedText}>{item.analysis.timestamp}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <ResultModal selected={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

function ResultModal({ selected, onClose }) {
  const analysis = selected?.analysis;
  const finding = analysis?.finding || analysis?.diagnosis || 'Unknown';

  return (
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        {selected && (
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Image source={{ uri: selected.uri }} style={styles.modalImage} />
              <Text style={styles.modalTitle}>ECG Result</Text>
              <Text style={styles.reportLabel}>Heart Rate</Text>
              <Text style={styles.reportValue}>{analysis.bpm} BPM</Text>
              <Text style={styles.reportLabel}>Finding</Text>
              <Text style={styles.reportBody}>{finding}</Text>
              <Text style={styles.reportLabel}>Rhythm</Text>
              <Text style={styles.reportBody}>{analysis.rhythm}</Text>
              <Text style={styles.reportLabel}>Signal Quality</Text>
              <Text style={styles.reportBody}>
                {qualityLabel(analysis.signalQuality ?? 0)}
              </Text>
              <Text style={styles.reportLabel}>Interpretation</Text>
              <Text style={styles.reportBody}>{analysis.interpretation}</Text>
              <Text style={styles.disclaimerText}>{analysis.disclaimer}</Text>
              <Button title="Close" onPress={onClose} />
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

function TabBar({ currentTab, setTab }) {
  const tabs = ['Home', 'Camera', 'Analysis', 'Gallery'];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = currentTab === tab;

        return (
          <TouchableOpacity key={tab} style={styles.tab} onPress={() => setTab(tab)}>
            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
              {tab === 'Camera' ? 'Scan' : tab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
