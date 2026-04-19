import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  Image,
  FlatList,
  Platform,
  TouchableOpacity,
  SafeAreaView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from './styles';


// ================= CAMERA IMPORT =================
let CameraComponent = null;
try {
  const cameraModule = require('expo-camera');
  CameraComponent = cameraModule.Camera || cameraModule.CameraView;
  console.log("Camera module loaded:", CameraComponent);
} catch (err) {
  console.error("Camera module failed to load:", err);
}


// ================= API IMPORT =================
let analyzeECGImage = async () => {
  console.warn("Using fallback analysis");
  return { heart_rate: 70, conditions: ["Fallback"], summary: "No API connected" };
};

try {
  const api = require('./api');
  analyzeECGImage = api.analyzeECGImage;
  console.log("API loaded");
} catch (err) {
  console.error("API failed to load:", err);
}


// ================= APP =================
export default function App() {
  const [images, setImages] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTab, setCurrentTab] = useState('Home'); // ✅ FIXED


  // ================= LOAD IMAGES =================
  useEffect(() => {
    const loadImages = async () => {
      try {
        const savedImages = await AsyncStorage.getItem('heartguard_images');

        if (savedImages) {
          setImages(JSON.parse(savedImages));
        }
      } catch (error) {
        console.error('Failed to load images:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadImages();
  }, []);


  // ================= SAVE IMAGES =================
  useEffect(() => {
    if (isLoaded) {
      const saveImages = async () => {
        try {
          await AsyncStorage.setItem(
            'heartguard_images',
            JSON.stringify(images)
          );
        } catch (error) {
          console.error('Failed to save images:', error);
        }
      };

      saveImages();
    }
  }, [images, isLoaded]);


  // ================= LOADING =================
  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }


  // ================= MAIN NAV =================
  return (
    <View style={{ flex: 1 }}>

      {/* Screen Content */}
      <View style={{ flex: 1 }}>
        {currentTab === 'Home' && (
          <HomeScreen navigation={{ setTab: setCurrentTab }} images={images} />
        )}

        {currentTab === 'Camera' && (
          <CameraScreen
            navigation={{ setTab: setCurrentTab }}
            images={images}
            setImages={setImages}
          />
        )}

        {currentTab === 'Gallery' && (
          <GalleryScreen
            navigation={{ setTab: setCurrentTab }}
            images={images}
          />
        )}
      </View>


      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          onPress={() => setCurrentTab('Home')}
          style={styles.tab}
        >
          <Text style={styles.tabText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCurrentTab('Camera')}
          style={styles.tab}
        >
          <Text style={styles.tabText}>Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCurrentTab('Gallery')}
          style={styles.tab}
        >
          <Text style={styles.tabText}>Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


// ================= HOME =================
function HomeScreen({ navigation, images }) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>HeartGuard</Text>
      <Text style={styles.subtitle}>
        Scan ECG images and get instant analysis
      </Text>

      <Text style={styles.stat}>Scans: {images.length}</Text>

      <Button
        title="Open Camera"
        onPress={() => navigation.setTab('Camera')}
      />

      <Button
        title="View Gallery"
        onPress={() => navigation.setTab('Gallery')}
      />
    </SafeAreaView>
  );
}


// ================= CAMERA =================
function CameraScreen({ navigation, images, setImages }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  const cameraRef = useRef(null);


  // ================= WEB BLOCK =================
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Camera not supported on web.</Text>
      </View>
    );
  }


  // ================= PERMISSIONS =================
  useEffect(() => {
    (async () => {
      try {
        if (!CameraComponent) return;

        const { status } =
          await CameraComponent.requestCameraPermissionsAsync();

        setHasPermission(status === 'granted');
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);


  // ================= TAKE PHOTO =================
  const takePicture = async () => {
    try {
      const photo = await cameraRef.current.takePictureAsync();
      setCapturedPhoto(photo);
      setIsPreview(true);
    } catch (err) {
      console.error(err);
    }
  };


  // ================= SAVE PHOTO =================
  const savePhoto = async () => {
    setLoading(true);

    try {
      const analysis = await analyzeECGImage(capturedPhoto.uri);

      const newItem = {
        uri: capturedPhoto.uri,
        analysis: {
          bpm: analysis.heart_rate || 0,
          diagnosis: analysis.conditions
            ? analysis.conditions.join(', ')
            : 'Unknown',
          rhythm:
            analysis.conditions &&
            analysis.conditions.includes('Irregular Rhythm')
              ? 'Irregular'
              : 'Regular',
          interpretation: analysis.summary || 'Analysis completed',
          timestamp: new Date().toLocaleString(),
        },
      };

      setImages([newItem, ...images]);

      setCapturedPhoto(null);
      setIsPreview(false);

      navigation.setTab('Gallery');
    } catch (err) {
      console.error(err);
      alert('Analysis failed');
    } finally {
      setLoading(false);
    }
  };


  // ================= STATES =================
  if (hasPermission === null)
    return <Text>Requesting permission...</Text>;

  if (hasPermission === false)
    return <Text>No camera access</Text>;


  // ================= UI =================
  return (
    <View style={{ flex: 1 }}>
      {!isPreview ? (
        <>
          {CameraComponent ? (
            <CameraComponent ref={cameraRef} style={{ flex: 1 }} />
          ) : (
            <Text>Camera failed to load</Text>
          )}

          <Button title="Capture" onPress={takePicture} />
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <Image source={{ uri: capturedPhoto.uri }} style={{ height: 300 }} />

          {loading && <Text>Analyzing...</Text>}

          <Button title="Retake" onPress={() => setIsPreview(false)} />
          <Button title="Save & Analyze" onPress={savePhoto} />
        </View>
      )}
    </View>
  );
}


// ================= GALLERY =================
function GalleryScreen({ navigation, images }) {
  const [selected, setSelected] = useState(null);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={images}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelected(item)}
          >
            <Image source={{ uri: item.uri }} style={styles.image} />
            <Text style={styles.bpm}>{item.analysis.bpm} BPM</Text>
            <Text>{item.analysis.diagnosis}</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!selected} transparent>
        <View style={styles.modal}>
          {selected && (
            <View style={styles.modalContent}>
              <Image
                source={{ uri: selected.uri }}
                style={styles.modalImage}
              />

              <Text style={styles.modalTitle}>ECG Result</Text>

              <Text>Heart Rate: {selected.analysis.bpm}</Text>
              <Text>Diagnosis: {selected.analysis.diagnosis}</Text>
              <Text>Rhythm: {selected.analysis.rhythm}</Text>
              <Text>{selected.analysis.interpretation}</Text>

              <Button title="Close" onPress={() => setSelected(null)} />
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
