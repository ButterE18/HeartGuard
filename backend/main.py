"""
HeartGuard Backend - API Server (Field-Test Version)

Flow:
1. Receive ECG image from mobile app
2. Convert image → signal
3. Analyze signal
4. Return structured result
"""

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

from ecg_processing import process_ecg_signal
from image_processing import extract_signal_from_image

import time
import io
from PIL import Image

app = FastAPI()


# =========================================================
# API ENDPOINT: ECG IMAGE ANALYSIS
# =========================================================
@app.post("/analyze-ecg-image")
async def analyze_ecg_image(file: UploadFile = File(...)):

    start_time = time.time()

    try:
        # =================================================
        # STEP 1: Validate file type
        # =================================================
        if not file.content_type.startswith("image/"):
            return JSONResponse(
                status_code=400,
                content={"error": "Please upload an image file."}
            )

        contents = await file.read()

        # =================================================
        # STEP 2: File size limit (10MB)
        # =================================================
        if len(contents) > 10 * 1024 * 1024:
            return JSONResponse(
                status_code=400,
                content={"error": "File too large (max 10MB)."}
            )

        # =================================================
        # STEP 3: Validate image integrity
        # =================================================
        try:
            Image.open(io.BytesIO(contents)).verify()
        except:
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid image file."}
            )

        # =================================================
        # STEP 4: Convert image → signal
        # =================================================
        signal = extract_signal_from_image(contents)

        if not signal or len(signal) < 50:
            return {
                "heart_rate": 0,
                "conditions": ["Unclear Signal"],
                "summary": "Could not extract ECG signal.",
                "recommendation": "Retake image with better lighting.",
                "disclaimer": "Not a medical diagnosis"
            }

        # =================================================
        # STEP 5: Analyze ECG signal
        # =================================================
        result = process_ecg_signal(signal)

        # =================================================
        # STEP 6: Add metadata (demo visibility)
        # =================================================
        result["meta"] = {
            "processing_time_sec": round(time.time() - start_time, 2),
            "signal_length": len(signal)
        }

        return result

    except Exception as e:
        print("ERROR:", str(e))

        return {
            "error": "Analysis failed",
            "details": str(e)
        }
