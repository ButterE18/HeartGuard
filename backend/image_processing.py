"""
HeartGuard - Image Processing Module (Field-Test Version)

Purpose:
- Converts ECG image into numeric waveform
- Designed for:
  - Digital ECG screenshots
  - Camera-taken ECG photos
"""

import cv2
import numpy as np
from PIL import Image
import io


# =========================================================
# MAIN FUNCTION: IMAGE → SIGNAL
# =========================================================
def extract_signal_from_image(file_bytes):

    # Load image from upload
    image = Image.open(io.BytesIO(file_bytes)).convert("L")
    img = np.array(image)

    # Resize for consistency across devices
    img = cv2.resize(img, (800, 400))

    # =====================================================
    # STEP 1: Enhance contrast (important for camera images)
    # =====================================================
    img = cv2.equalizeHist(img)

    # =====================================================
    # STEP 2: Reduce noise
    # =====================================================
    blurred = cv2.GaussianBlur(img, (5, 5), 0)

    # =====================================================
    # STEP 3: Detect edges (ECG waveform)
    # =====================================================
    edges = cv2.Canny(blurred, 30, 100)

    height = edges.shape[0]

    signal = []
    last_y = height // 2  # starting fallback point

    # =====================================================
    # STEP 4: Track waveform column by column
    # =====================================================
    for x in range(edges.shape[1]):
        column = edges[:, x]

        y_points = np.where(column > 0)[0]

        if len(y_points) > 0:
            # Take strongest edge (likely ECG line)
            y = np.max(y_points)

            # Prevent sudden jumps (noise protection)
            if abs(y - last_y) > 50:
                y = last_y

            signal.append(height - y)
            last_y = y
        else:
            # Fill missing data using last value
            signal.append(height - last_y)

    signal = np.array(signal)

    # =====================================================
    # STEP 5: Smooth signal (critical for stability)
    # =====================================================
    window = 5
    signal = np.convolve(signal, np.ones(window)/window, mode='same')

    # =====================================================
    # STEP 6: Normalize output to 0–1 range
    # =====================================================
    min_val = np.min(signal)
    max_val = np.max(signal)

    if max_val - min_val > 0:
        signal = (signal - min_val) / (max_val - min_val)
    else:
        signal = np.zeros_like(signal)

    return signal.tolist()
