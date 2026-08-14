"""HeartGuard ECG signal analysis for the prototype pipeline."""

from typing import cast

import numpy as np
from scipy.signal import butter, filtfilt, find_peaks


def preprocess_signal(signal, fs):
    signal = np.asarray(signal, dtype=float)

    if signal.size < 100:
        return signal
    if fs is None or fs <= 0:
        raise ValueError('Invalid sampling frequency.')

    standard_deviation = float(np.std(signal))
    if standard_deviation <= 1e-8:
        return np.zeros_like(signal)

    signal = (signal - np.mean(signal)) / standard_deviation

    nyquist = 0.5 * fs
    low_cut = 0.5 / nyquist
    high_cut = 25.0 / nyquist

    if not 0 < low_cut < high_cut < 1:
        raise ValueError('Sampling frequency is incompatible with ECG bandpass filter.')

    ba = butter(
        N=3,
        Wn=(low_cut, high_cut),
        btype='bandpass',
        output='ba',
    )
    b, a = cast(tuple[np.ndarray, np.ndarray], ba)

    return filtfilt(b, a, signal)


def detect_peaks(signal, fs):
    """Detect candidate R peaks with conservative spacing constraints."""
    signal = np.asarray(signal, dtype=float)

    if signal.size < 100 or fs is None or fs <= 0:
        return np.array([], dtype=int)

    minimum_distance = max(1, int(0.30 * fs))  # <= about 200 BPM
    prominence = max(0.35, float(np.std(signal)) * 0.45)

    positive_peaks, positive_properties = find_peaks(
        signal,
        prominence=prominence,
        distance=minimum_distance,
    )
    negative_peaks, negative_properties = find_peaks(
        -signal,
        prominence=prominence,
        distance=minimum_distance,
    )

    def candidate_score(peaks, properties):
        if len(peaks) < 2:
            return -1.0

        rr = np.diff(peaks) / fs
        plausible = rr[(rr >= 0.30) & (rr <= 2.0)]
        if plausible.size == 0:
            return -1.0

        prominence_values = properties.get('prominences', np.array([0.0]))
        return float(plausible.size + np.median(prominence_values) * 0.1)

    if candidate_score(negative_peaks, negative_properties) > candidate_score(
        positive_peaks,
        positive_properties,
    ):
        return negative_peaks

    return positive_peaks


def _valid_rr_intervals(peaks, fs):
    if fs is None or fs <= 0 or len(peaks) < 2:
        return np.array([], dtype=float)

    rr = np.diff(peaks) / fs
    return rr[(rr >= 0.30) & (rr <= 2.0)]


def calculate_heart_rate(peaks, fs):
    rr_intervals = _valid_rr_intervals(peaks, fs)

    if rr_intervals.size == 0:
        return 0

    median_rr = float(np.median(rr_intervals))
    if median_rr <= 0:
        return 0

    heart_rate = int(round(60.0 / median_rr))
    return heart_rate if 30 <= heart_rate <= 200 else 0


def analyze_rhythm(peaks, fs):
    rr_intervals = _valid_rr_intervals(peaks, fs)

    if rr_intervals.size < 2:
        return 'Unknown'

    median_rr = float(np.median(rr_intervals))
    if median_rr <= 0:
        return 'Unknown'

    # Robust variability based on median absolute deviation.
    mad = float(np.median(np.abs(rr_intervals - median_rr)))
    relative_variability = mad / median_rr

    if relative_variability < 0.06:
        return 'Regular'
    if relative_variability < 0.12:
        return 'Slightly Irregular'
    return 'Irregular'


def estimate_signal_quality(signal, peaks, raw_quality):
    signal = np.asarray(signal, dtype=float)

    if signal.size < 100:
        return 0.0

    peak_count = len(peaks)
    peak_score = float(np.clip(peak_count / 6.0, 0.0, 1.0))
    raw_quality_score = float(np.clip(raw_quality, 0.0, 1.0))

    variability = float(np.std(signal))
    variability_score = float(np.clip(variability / 1.0, 0.0, 1.0))

    quality = (
        0.55 * raw_quality_score
        + 0.30 * peak_score
        + 0.15 * variability_score
    )

    return round(float(np.clip(quality, 0.0, 1.0)), 2)


def calculate_confidence(heart_rate, rhythm, signal_quality, peaks):
    confidence = 0.75 * float(signal_quality)

    if heart_rate > 0:
        confidence += 0.10
    if rhythm != 'Unknown':
        confidence += 0.08
    if len(peaks) >= 4:
        confidence += 0.07

    return round(float(np.clip(confidence, 0.0, 1.0)), 2)


def classify_conditions(heart_rate, rhythm):
    findings = []

    if heart_rate == 0:
        findings.append('Heart Rate Could Not Be Reliably Estimated')
    elif heart_rate > 100:
        findings.append('Possible Fast Heart Rate')
    elif heart_rate < 60:
        findings.append('Possible Slow Heart Rate')

    if rhythm == 'Irregular':
        findings.append('Possible Rhythm Irregularity')
    elif rhythm == 'Slightly Irregular':
        findings.append('Slight Rhythm Irregularity')

    if not findings:
        findings.append('No Major Prototype Finding')

    return findings


def create_summary(heart_rate, rhythm, findings):
    if heart_rate == 0:
        return (
            'Heart rate could not be reliably estimated from this image. '
            'Use a clearer, tightly cropped single-lead ECG strip or screenshot.'
        )

    return (
        f'Estimated heart rate is {heart_rate} BPM. '
        f'Rhythm regularity appears {rhythm.lower()}. '
        f'Prototype finding: {", ".join(findings)}.'
    )


def create_recommendation(heart_rate, rhythm):
    if heart_rate == 0:
        return 'Retake or re-import a clearer, tightly cropped ECG image.'

    if rhythm == 'Irregular':
        return (
            'This prototype detected irregular beat spacing. Do not treat this as a diagnosis. '
            'If you have symptoms or concerns, use an appropriate medical service.'
        )

    if heart_rate > 100:
        return (
            'The estimated rate is above 100 BPM. Retest with a clear resting ECG if appropriate; '
            'seek medical advice for symptoms or persistent concerns.'
        )

    if 0 < heart_rate < 60:
        return (
            'The estimated rate is below 60 BPM. This can be normal in some people, but symptoms '
            'or persistent concerns should be discussed with a healthcare professional.'
        )

    return 'No urgent conclusion should be drawn from this prototype result.'


def process_ecg_signal(signal, fs, quality):
    filtered_signal = preprocess_signal(signal, fs)
    peaks = detect_peaks(filtered_signal, fs)
    heart_rate = calculate_heart_rate(peaks, fs)
    rhythm = analyze_rhythm(peaks, fs)
    signal_quality = estimate_signal_quality(filtered_signal, peaks, quality)
    confidence = calculate_confidence(heart_rate, rhythm, signal_quality, peaks)
    findings = classify_conditions(heart_rate, rhythm)

    return {
        'heart_rate': heart_rate,
        'rhythm': rhythm,
        'signal_quality': signal_quality,
        'confidence': confidence,
        'conditions': findings,
        'summary': create_summary(heart_rate, rhythm, findings),
        'recommendation': create_recommendation(heart_rate, rhythm),
        'detected_peak_count': int(len(peaks)),
        'disclaimer': (
            'Experimental prototype only. Not a medical diagnosis or medical-device result. '
            'Do not use HeartGuard for emergency decisions.'
        ),
    }
