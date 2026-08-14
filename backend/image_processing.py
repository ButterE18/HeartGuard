"""
HeartGuard - ECG image processing

Prototype scope:
- Clear, cropped, single-lead ECG strips or screenshots.
- Not intended for arbitrary multi-lead ECG pages.

Pipeline:
1. Validate/decode image.
2. Convert to grayscale and normalize size.
3. Crop outer margins where labels/borders commonly appear.
4. Threshold the trace.
5. Remove long horizontal/vertical grid structures.
6. Trace a continuous waveform column-by-column.
7. Interpolate small gaps and smooth the waveform.
8. Return a conservative extraction-quality score.
"""

import io

import cv2
import numpy as np
from PIL import Image, ImageOps

TARGET_WIDTH = 1200
TARGET_HEIGHT = 600
ASSUMED_DURATION_SECONDS = 6.0


def _normalize_01(values):
    values = np.asarray(values, dtype=float)
    minimum = float(np.min(values))
    maximum = float(np.max(values))

    if maximum - minimum <= 1e-8:
        return np.zeros_like(values, dtype=float)

    return (values - minimum) / (maximum - minimum)


def calculate_quality_score(signal, coverage, jump_ratio, foreground_ratio):
    """Return a conservative 0.0-1.0 waveform extraction score."""
    signal = np.asarray(signal, dtype=float)

    if signal.size < 100:
        return 0.0

    variability = float(np.std(signal))
    variability_score = float(np.clip(variability / 0.18, 0.0, 1.0))

    coverage_score = float(np.clip(coverage, 0.0, 1.0))
    continuity_score = float(np.clip(1.0 - jump_ratio, 0.0, 1.0))

    # Extremely sparse or extremely dense thresholded images are suspicious.
    foreground_score = 1.0 - min(abs(foreground_ratio - 0.08) / 0.20, 1.0)

    quality = (
        0.35 * coverage_score
        + 0.30 * continuity_score
        + 0.20 * variability_score
        + 0.15 * foreground_score
    )

    return round(float(np.clip(quality, 0.0, 1.0)), 2)


def _remove_grid_lines(binary):
    """Suppress long grid/border lines while retaining shorter ECG features."""
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (45, 1))
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 45))

    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)

    grid_mask = cv2.bitwise_or(horizontal, vertical)
    cleaned = cv2.subtract(binary, grid_mask)

    # Reconnect small gaps caused by grid removal.
    reconnect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    return cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, reconnect_kernel)


def _trace_waveform(binary):
    """Trace one continuous candidate waveform through the binary image."""
    height, width = binary.shape
    signal = np.full(width, np.nan, dtype=float)

    # Begin near the row with the greatest amount of trace-like foreground.
    row_counts = np.count_nonzero(binary, axis=1)
    central_start = int(np.argmax(row_counts))
    previous_y = central_start

    found_columns = 0
    large_jumps = 0
    max_local_jump = max(12, int(height * 0.10))

    for x in range(width):
        points = np.flatnonzero(binary[:, x] > 0)
        if points.size == 0:
            continue

        distances = np.abs(points - previous_y)
        nearest_index = int(np.argmin(distances))
        nearest_y = int(points[nearest_index])

        if abs(nearest_y - previous_y) > max_local_jump:
            large_jumps += 1

        previous_y = nearest_y
        signal[x] = height - nearest_y
        found_columns += 1

    coverage = found_columns / max(width, 1)
    jump_ratio = large_jumps / max(found_columns, 1)

    valid = np.flatnonzero(~np.isnan(signal))
    if valid.size < 2:
        raise ValueError('Unable to trace a continuous ECG waveform.')

    missing = np.flatnonzero(np.isnan(signal))
    signal[missing] = np.interp(missing, valid, signal[valid])

    return signal, coverage, jump_ratio


def extract_signal_from_image(file_bytes):
    """
    Convert an uploaded ECG image into a one-dimensional waveform.

    Returns:
        signal: list[float]
        estimated_fs: int
        quality_score: float
    """
    if not file_bytes:
        raise ValueError('Empty image upload.')

    image = Image.open(io.BytesIO(file_bytes))
    image = ImageOps.exif_transpose(image)
    grayscale = np.array(image.convert('L'))

    if grayscale.size == 0:
        raise ValueError('Empty image detected.')

    source_height, source_width = grayscale.shape
    if source_width < 200 or source_height < 100:
        raise ValueError('Image resolution is too small for ECG extraction.')

    grayscale = cv2.resize(
        grayscale,
        (TARGET_WIDTH, TARGET_HEIGHT),
        interpolation=cv2.INTER_AREA,
    )

    # Remove outer 5% margins to reduce page borders, labels, and UI chrome.
    y_margin = int(TARGET_HEIGHT * 0.05)
    x_margin = int(TARGET_WIDTH * 0.05)
    cropped = grayscale[
        y_margin : TARGET_HEIGHT - y_margin,
        x_margin : TARGET_WIDTH - x_margin,
    ]

    blurred = cv2.GaussianBlur(cropped, (5, 5), 0)

    binary = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        9,
    )

    cleaned = _remove_grid_lines(binary)
    foreground_ratio = float(np.count_nonzero(cleaned) / cleaned.size)

    if foreground_ratio < 0.002:
        raise ValueError('Too little visible waveform information was found.')
    if foreground_ratio > 0.45:
        raise ValueError('Image contains too much foreground detail for reliable tracing.')

    signal, coverage, jump_ratio = _trace_waveform(cleaned)

    # Light smoothing only. Heavy smoothing can erase narrow R peaks.
    signal = np.convolve(signal, np.ones(5) / 5, mode='same')
    signal = _normalize_01(signal)

    quality_score = calculate_quality_score(
        signal,
        coverage,
        jump_ratio,
        foreground_ratio,
    )

    # The prototype currently assumes the visible strip spans ~6 seconds.
    # This is intentionally exposed as a documented limitation.
    estimated_fs = int(len(signal) / ASSUMED_DURATION_SECONDS)
    estimated_fs = max(estimated_fs, 100)

    return signal.tolist(), estimated_fs, quality_score
