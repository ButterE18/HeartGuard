"""
ECG Processing Module

This file contains the "brain" of HeartGuard.

It:
- Filters noisy ECG signals
- Detects heartbeats (R-peaks)
- Calculates heart rate
- Detects irregular rhythms
- Flags AFib and PVC patterns
- Converts results into simple language
"""

import numpy as np 
from scipy.signal import find_peaks, butter, filtfilt


# ============================================
# SIGNAL FILTERING
# ============================================
def bandpass_filter(signal, fs=250):
    """
    Removes noise outside normal ECG frequency range.

    Keeps frequencies between 0.5 Hz and 40 Hz.
    """
    b, a = butter(2, [0.5/(0.5*fs), 40/(0.5*fs)], btype='band') # type: ignore
    return filtfilt(b, a, signal)


# ============================================
# R-PEAK DETECTION
# ============================================
def detect_r_peaks(signal, fs=250):
    """
    Detects peaks representing heartbeats.

    Uses scipy's find_peaks with:
    - Minimum distance between beats
    - Minimum prominence for valid peaks
    """
    # Calculate dynamic threshold based on signal statistics
    signal_std = np.std(signal)
    signal_mean = np.mean(signal)
    min_height = signal_mean + 0.5 * signal_std  # Above mean + 0.5 std

    peaks, properties = find_peaks(
        signal,
        distance=int(0.4 * fs),   # Minimum 400ms between beats (150 BPM max)
        prominence=signal_std * 0.3,  # Minimum prominence
        height=min_height,  # Minimum height
        width=int(0.05 * fs)  # Minimum width (50ms)
    )
    return peaks


# ============================================
# HEART RATE CALCULATION
# ============================================
def calculate_heart_rate(peaks, fs, length):
    """
    Converts number of detected beats into BPM.
    """
    duration = length / fs
    return int((len(peaks) / duration) * 60) if duration > 0 else 0


# ============================================
# RHYTHM ANALYSIS
# ============================================
def analyze_rhythm(peaks, fs):
    """
    Determines if rhythm is regular or irregular.

    Based on variation between beats (RR intervals).
    """
    if len(peaks) < 2:
        return True

    rr_intervals = np.diff(peaks) / fs
    return np.std(rr_intervals) < 0.1


# ============================================
# AFIB DETECTION (Basic Heuristic)
# ============================================
def detect_afib(rr):
    """
    AFib detection using multiple criteria:
    - High irregularity (coefficient of variation > 15%)
    - Absence of compensatory pauses
    - Random RR intervals
    """
    if len(rr) < 5:
        return False

    # Coefficient of variation
    cv = np.std(rr) / np.mean(rr) if np.mean(rr) > 0 else 0

    # Check for very irregular intervals
    if cv > 0.20:  # 20% variation
        return True

    # Check for fibrillation pattern (no regular pauses)
    # In AFib, RR intervals don't have the regular pattern of sinus rhythm
    diff_rr = np.diff(rr)
    irregularity_score = np.std(diff_rr) / np.mean(np.abs(diff_rr)) if np.mean(np.abs(diff_rr)) > 0 else 0

    return irregularity_score > 0.15


# ============================================
# PVC DETECTION (Basic Heuristic)
# ============================================
def detect_pvc(rr):
    """
    PVC detection with improved criteria:
    - Premature beat (short RR interval)
    - Followed by compensatory pause (long RR interval)
    - Or isolated premature beats
    """
    if len(rr) < 3:
        return False

    mean_rr = np.mean(rr)
    pvc_count = 0

    for i in range(1, len(rr) - 1):
        current_rr = rr[i]
        prev_rr = rr[i-1]
        next_rr = rr[i+1]

        # Check for premature beat
        if current_rr < 0.8 * mean_rr:
            # Check for compensatory pause
            if next_rr > 1.2 * mean_rr:
                pvc_count += 1
            # Or isolated PVC
            elif current_rr < 0.7 * mean_rr:
                pvc_count += 1

    # Consider PVCs present if more than 10% of beats are PVCs
    return pvc_count > len(rr) * 0.1


# ============================================
# MAIN PROCESSING PIPELINE
# ============================================
def process_ecg_signal(signal, fs=250):
    """
    Full ECG analysis pipeline.
    """
    signal = np.array(signal)

    # Step 1: Clean signal
    filtered = bandpass_filter(signal, fs)

    # Step 2: Detect heartbeats
    peaks = detect_r_peaks(filtered, fs)

    # Step 3: Calculate metrics
    heart_rate = calculate_heart_rate(peaks, fs, len(signal))
    rhythm_regular = analyze_rhythm(peaks, fs)

    rr = np.diff(peaks) / fs if len(peaks) > 1 else []

    # Step 4: Detect conditions
    conditions = []

    if heart_rate > 100:
        conditions.append("Tachycardia")
    elif heart_rate < 60:
        conditions.append("Bradycardia")

    if not rhythm_regular:
        conditions.append("Irregular Rhythm")

    if detect_afib(rr):
        conditions.append("Possible AFib")

    if detect_pvc(rr):
        conditions.append("Possible PVCs")

    if not conditions:
        conditions.append("Normal")

    # Step 5: Convert to user-friendly output
    return {
        "heart_rate": heart_rate,
        "conditions": conditions,
        "summary": generate_summary(conditions),
        "recommendation": generate_recommendation(conditions),
        "disclaimer": "This is not a medical diagnosis"
    }


# ============================================
# USER-FRIENDLY OUTPUT
# ============================================
def generate_summary(conditions):
    if "Possible AFib" in conditions:
        return "Your heartbeat appears highly irregular."
    if "Possible PVCs" in conditions:
        return "We detected occasional early heartbeats."
    if "Irregular Rhythm" in conditions:
        return "Your heartbeat is not steady."
    return "Your heart rhythm appears normal."


def generate_recommendation(conditions):
    if "Possible AFib" in conditions:
        return "Consider seeking medical attention."
    if "Irregular Rhythm" in conditions:
        return "Monitor your heart rhythm regularly."
    return "No immediate concerns detected."