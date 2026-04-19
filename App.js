
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

// Camera import (wrapped for debug safety)
let CameraComponent = null;
try {
  const cameraModule = require('expo-camera');
  CameraComponent = cameraModule.Camera || cameraModule.CameraView;
  console.log("Camera module loaded:", CameraComponent);
} catch (err) {
  console.error("Camera module failed to load:", err);
}

// API import safety
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

export default function App() {
  const [images, setImages] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);


  // ================= LOAD IMAGES =================
  useEffect(() => {
    const loadImages = async () => {
      try {
        console.log("Loading images...");
        const savedImages = await AsyncStorage.getItem('heartguard_images');


        if (savedImages) {
          setImages(JSON.parse(savedImages));
          console.log("Images loaded");
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
          console.log("Saving images...");
          await AsyncStorage.setItem('heartguard_images', JSON.stringify(images));
        } catch (error) {
          console.error('Failed to save images:', error);
        }
      };
      saveImages();
    }
  }, [images, isLoaded]);


  // ================= LOADING STATE =================
  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
        <Text>
          App loaded - navigate to Home
        </Text>
        <HomeScreen navigation={{ navigate: () => console.log("Navigate called") }} images={images} />

      </View>
      
  );
// ================= MAIN NAV =================
  return (
    <View style={{ flex: 1 }}>
      {/* Screen Content /}
      <View style={{ flex: 1 }}>
        {currentTab === 'Home' && (
          <HomeScreen
            navigation={{ navigate: setCurrentTab }}
            images={images}
          />
        )}

        {currentTab === 'Camera' && (
          <CameraScreen
            navigation={{ navigate: setCurrentTab }}
            images={images}
            setImages={setImages}
          />
        )}

        {currentTab === 'Gallery' && (
          <GalleryScreen
            navigation={{ navigate: setCurrentTab }}
            images={images}
          />
        )}
      </View>

      {/ Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity onPress={() => setCurrentTab('Home')} style={styles.tab}>
          <Text style={styles.tabText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCurrentTab('Camera')} style={styles.tab}>
          <Text style={styles.tabText}>Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCurrentTab('Gallery')} style={styles.tab}>
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


      <Button title="Open Camera" onPress={() => navigation.navigate('Camera')} />
      <Button title="View Gallery" onPress={() => navigation.navigate('Gallery')} />
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


  // WEB BLOCK (prevents crash)
  if (Platform.OS === 'web') {
    console.warn("Camera not supported on web");
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Camera not supported on web. Use mobile device.</Text>
      </View>
    );
  }


  // ================= PERMISSIONS =================
  useEffect(() => {
    (async () => {
      try {
        if (!CameraComponent) {
          console.error("CameraComponent is null");
          return;
        }


        const { status } = await CameraComponent.requestCameraPermissionsAsync();
        console.log("Camera permission:", status);
        setHasPermission(status === 'granted');
      } catch (err) {
        console.error("Permission error:", err);
      }
    })();
  }, []);


  // ================= TAKE PHOTO =================
  const takePicture = async () => {
    try {
      if (!cameraRef.current) {
        console.error("Camera ref is null");
        return;
      }


      const photo = await cameraRef.current.takePictureAsync();
      console.log("Photo captured:", photo);


      setCapturedPhoto(photo);
      setIsPreview(true);
    } catch (err) {
      console.error("Capture failed:", err);
    }
  };


  // ================= SAVE PHOTO =================
  const savePhoto = async () => {
    if (!capturedPhoto) return;


    setLoading(true);


    try {
      console.log("Sending to API...");
      const analysis = await analyzeECGImage(capturedPhoto.uri);
      console.log("Analysis result:", analysis);


      const newItem = {
        uri: capturedPhoto.uri,
        analysis: {
          bpm: analysis.heart_rate || 0,
          diagnosis: analysis.conditions
            ? analysis.conditions.join(", ")
            : "Unknown",
          rhythm:
            analysis.conditions &&
            analysis.conditions.includes("Irregular Rhythm")
              ? "Irregular"
              : "Regular",
          interpretation: analysis.summary || "Analysis completed",
          timestamp: new Date().toLocaleString(),
        },
      };


      setImages([newItem, ...images]);


      setCapturedPhoto(null);
      setIsPreview(false);


      navigation.navigate('Gallery');
    } catch (error) {
      console.error("Save photo error:", error);
      alert("Failed to analyze photo.");
    } finally {
      setLoading(false);
    }
  };


  // ================= PERMISSION STATES =================
  if (hasPermission === null)
    return <Text style={{ textAlign: 'center' }}>Requesting permission...</Text>;


  if (hasPermission === false)
    return <Text style={{ textAlign: 'center' }}>No camera access</Text>;


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


          {loading && (
            <Text style={{ textAlign: 'center' }}>Analyzing...</Text>
          )}


          <Button title="Retake" onPress={() => setIsPreview(false)} />
          <Button title="Save & Analyze" onPress={savePhoto} />
        </View>
      )}
    </View>
  );
}


// ================= GALLERY =================


function GalleryScreen({ images }) {
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
              <Image source={{ uri: selected.uri }} style={styles.modalImage} />


              <Text style={styles.modalTitle}>ECG Result</Text>


              <Text>Heart Rate: {selected.analysis.bpm} BPM</Text>
              <Text>Diagnosis: {selected.analysis.diagnosis}</Text>
              <Text>Rhythm: {selected.analysis.rhythm}</Text>
              <Text>{selected.analysis.interpretation}</Text>


              <Text style={{ marginTop: 10, fontStyle: 'italic' }}>
                Not medical advice
              </Text>


              <Button title="Close" onPress={() => setSelected(null)} />
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

