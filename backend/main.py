"""
HeartGuard Backend - Main API Server

This file defines the FastAPI server that:
1. Receives ECG images from the mobile app
2. Converts the image into a signal
3. Runs ECG analysis
4. Returns human-readable results
"""

from fastapi import FastAPI, UploadFile, File
from ecg_processing import process_ecg_signal
from image_processing import extract_signal_from_image

# Initialize FastAPI app
app = FastAPI()


# ============================================
# ROUTE: Analyze ECG Image
# ============================================
@app.post("/analyze-ecg-image")
async def analyze_ecg_image(file: UploadFile = File(...)):
    """
    Accepts an uploaded ECG image from the frontend.

    Steps:
    1. Read image bytes
    2. Convert image → signal
    3. Analyze signal
    4. Return results
    """
    try:
        # Input validation
        if not file.content_type or not file.content_type.startswith('image/'):
            return {"error": "Invalid file type. Please upload an image."}

        # Read image file as bytes
        contents = await file.read()

        # Check file size (limit to 10MB)
        if len(contents) > 10 * 1024 * 1024:
            return {"error": "File too large. Maximum size is 10MB."}

        # Validate it's a valid image
        try:
            from PIL import Image
            import io
            Image.open(io.BytesIO(contents)).verify()
        except Exception:
            return {"error": "Invalid image file."}

        # Convert ECG image into numerical signal
        signal = extract_signal_from_image(contents)

        # Run ECG analysis pipeline
        result = process_ecg_signal(signal)

        return result

    except Exception as e:
        # Fail-safe response (prevents app crashes)
        return {
            "error": "Failed to analyze ECG",
            "details": str(e)
        }