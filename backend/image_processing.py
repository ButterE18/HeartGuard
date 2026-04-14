"""
Image Processing Module

Converts an ECG image into a numerical signal.

Steps:
1. Convert image to grayscale
2. Detect edges (waveform)
3. Track waveform across image columns
4. Normalize output
"""

import cv2
import numpy as np
from PIL import Image
import io


def extract_signal_from_image(file_bytes):
    # Load image from bytes and convert to grayscale
    image = Image.open(io.BytesIO(file_bytes)).convert("L")
    img = np.array(image)

    # Resize image for consistent processing
    img = cv2.resize(img, (800, 400))

    # Apply blur to reduce noise
    blurred = cv2.GaussianBlur(img, (5, 5), 0)

    # Edge detection to find ECG line
    edges = cv2.Canny(blurred, 50, 150)

    signal = []
    height = edges.shape[0]

    # Scan each vertical column
    for x in range(edges.shape[1]):
        column = edges[:, x]

        # Find where waveform exists
        y_points = np.where(column > 200)[0]

        if len(y_points) > 0:
            # Track average position of waveform
            signal.append(height - np.mean(y_points))
        else:
            # Fill gaps using last known value
            signal.append(signal[-1] if signal else 0)

    signal = np.array(signal)

    # Normalize signal between 0 and 1
    signal = (signal - np.min(signal)) / (np.max(signal) - np.min(signal) + 1e-6)

    return signal.tolist()