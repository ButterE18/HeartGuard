/*
API Layer

Handles communication between:
React Native App → FastAPI Backend
*/

export const analyzeECGImage = async (uri) => {
  const formData = new FormData();

  formData.append("file", {
    uri,
    name: "ecg.jpg",
    type: "image/jpeg",
  });

  try {
    const response = await fetch("http://98.168.51.140/analyze-ecg-image", {
      method: "POST",
      body: formData,
    }); //Replace with ACTUAL IP ADDRESS

    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    return { error: "Failed to connect to server" };
  }
};
