"""
HeartGuard - ECG Processing Module (Field-Test Version)

Purpose:
- Takes a numeric ECG signal (from image processing)
- Cleans + analyzes it
- Detects heart conditions (lightweight heuristics for demo use)
"""

import numpy as np
from scipy.signal import find_peaks, butter, filtfilt


# =========================================================
# STEP 1: SIGNAL CLEANING (FILTER + NORMALIZATION)
# =========================================================
def preprocess_signal(signal, fs=250):
    signal = np.array(signal)

    # Normalize signal (important for camera-based ECGs)
    if np.std(signal) > 0:
        signal = (signal - np.mean(signal)) / np.std(signal)

    # Stronger bandpass filter to remove noise + drift
    b, a = butter(4, [0.5/(0.5*fs), 40/(0.5*fs)], btype='band')
    return filtfilt(b, a, signal)


# =========================================================
# STEP 2: SIGNAL QUALITY CHECK
# =========================================================
def is_signal_usable(signal):
    """
    Prevents garbage input from breaking analysis
    """
    if len(signal) < 50:
        return False

    std = np.std(signal)

    # Too flat or too noisy = unusable
    if std < 0.05 or std > 5:
        return False

    return True


# =========================================================
# STEP 3: R-PEAK DETECTION (HEARTBEATS)
# =========================================================
def detect_r_peaks(signal, fs=250):
    peaks, _ = find_peaks(
        signal,
        distance=int(0.35 * fs),  # prevents double counting beats
        prominence=0.5            # works well after normalization
    )
    return peaks


# =========================================================
# STEP 4: HEART RATE CALCULATION (RR METHOD)
# =========================================================
def calculate_heart_rate(peaks, fs):
    if len(peaks) < 2:
        return 0

    rr = np.diff(peaks) / fs
    mean_rr = np.mean(rr)

    if mean_rr <= 0:
        return 0

    return int(60 / mean_rr)


# =========================================================
# STEP 5: RHYTHM CHECK
# =========================================================
def analyze_rhythm(peaks, fs):
    if len(peaks) < 3:
        return True

    rr = np.diff(peaks) / fs

    # Coefficient of variation = rhythm stability
    cv = np.std(rr) / np.mean(rr) if np.mean(rr) > 0 else 0

    return cv < 0.12


# =========================================================
# STEP 6: SIMPLE ARRHYTHMIA DETECTION
# =========================================================
def detect_afib(rr):
    if len(rr) < 6:
        return False

    cv = np.std(rr) / np.mean(rr)
    return cv > 0.25


def detect_pvc(rr):
    if len(rr) < 4:
        return False

    mean_rr = np.mean(rr)
    pvc_count = 0

    for i in range(1, len(rr) - 1):
        if rr[i] < 0.75 * mean_rr and rr[i+1] > 1.15 * mean_rr:
            pvc_count += 1

    return pvc_count >= 2


# =========================================================
# STEP 7: MAIN PIPELINE (ENTRY POINT)
# =========================================================
def process_ecg_signal(signal, fs=250):
    signal = np.array(signal)

    # Reject unusable input early
    if not is_signal_usable(signal):
        return {
            "heart_rate": 0,
            "conditions": ["Unclear Signal"],
            "summary": "We couldn't read the ECG clearly.",
            "recommendation": "Try a clearer image.",
            "disclaimer": "Not a medical diagnosis"
        }

    # Clean signal
    filtered = preprocess_signal(signal, fs)

    # Detect heartbeats
    peaks = detect_r_peaks(filtered, fs)

    # Compute metrics
    heart_rate = calculate_heart_rate(peaks, fs)
    rhythm_regular = analyze_rhythm(peaks, fs)

    rr = np.diff(peaks) / fs if len(peaks) > 1 else []

    # Build condition list
    conditions = []

    if heart_rate > 110:
        conditions.append("Tachycardia")
    elif heart_rate < 50 and heart_rate > 0:
        conditions.append("Bradycardia")

    if not rhythm_regular:
        conditions.append("Irregular Rhythm")

    if len(rr) > 0 and detect_afib(rr):
        conditions.append("Possible AFib")

    if len(rr) > 0 and detect_pvc(rr):
        conditions.append("Possible PVCs")

    if not conditions:
        conditions.append("Normal")

    return {
        "heart_rate": heart_rate,
        "conditions": conditions,
        "summary": generate_summary(conditions),
        "recommendation": generate_recommendation(conditions),
        "disclaimer": "Not a medical diagnosis"
    }


# =========================================================
# STEP 8: USER-FRIENDLY OUTPUT
# =========================================================
def generate_summary(conditions):
    if "Possible AFib" in conditions:
        return "Your heartbeat appears irregular."
    if "Irregular Rhythm" in conditions:
        return "Your heartbeat is slightly irregular."
    return "Your heart rhythm appears normal."


def generate_recommendation(conditions):
    if "Possible AFib" in conditions:
        return "Consider medical attention."
    if "Irregular Rhythm" in conditions:
        return "Monitor your heart rhythm."
    return "No immediate concerns."
