"""HeartGuard FastAPI backend for the prototype ECG image-analysis flow."""

import io

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError

from ecg_processing import process_ecg_signal
from image_processing import extract_signal_from_image

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MIN_EXTRACTION_QUALITY = 0.30
MIN_FINAL_SIGNAL_QUALITY = 0.35
SUPPORTED_IMAGE_FORMATS = {'JPEG', 'PNG', 'WEBP', 'HEIF', 'HEIC'}

app = FastAPI(
    title='HeartGuard API',
    version='1.1.0-prototype',
    description='Experimental ECG image analysis service',
)


@app.get('/')
def root():
    return {
        'status': 'online',
        'service': 'HeartGuard API',
        'prototype': True,
    }


@app.get('/health')
def health_check():
    return {'healthy': True}


def error_response(status_code, message):
    return JSONResponse(status_code=status_code, content={'error': message})


def validate_image_bytes(contents):
    if not contents:
        raise ValueError('Uploaded image is empty.')

    if len(contents) > MAX_UPLOAD_BYTES:
        raise ValueError('Image is too large. Maximum upload size is 10 MB.')

    try:
        with Image.open(io.BytesIO(contents)) as image:
            detected_format = (image.format or '').upper()
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as error:
        raise ValueError('Invalid or unreadable image file.') from error

    # Pillow support for HEIF/HEIC depends on the local installation. The
    # extraction step will still reject it cleanly if decoding is unavailable.
    if detected_format and detected_format not in SUPPORTED_IMAGE_FORMATS:
        raise ValueError(
            f'Unsupported image format: {detected_format}. Use JPEG, PNG, or WEBP.'
        )


@app.post('/analyze-ecg-image')
async def analyze_ecg_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith('image/'):
        return error_response(400, 'Image file required.')

    try:
        contents = await file.read()
    except Exception:
        return error_response(400, 'Failed to read uploaded image.')

    try:
        validate_image_bytes(contents)
    except ValueError as error:
        return error_response(400, str(error))

    try:
        signal, estimated_fs, extraction_quality = extract_signal_from_image(contents)
    except Exception as error:
        return error_response(
            422,
            f'ECG waveform could not be extracted reliably: {str(error)}',
        )

    if len(signal) < 100 or extraction_quality < MIN_EXTRACTION_QUALITY:
        return error_response(
            422,
            'ECG waveform could not be reliably extracted. Use a clear, tightly cropped '
            'single-lead ECG strip or screenshot and try again.',
        )

    try:
        result = process_ecg_signal(signal, estimated_fs, extraction_quality)
    except Exception as error:
        return error_response(500, f'ECG analysis failed: {str(error)}')

    if result.get('signal_quality', 0.0) < MIN_FINAL_SIGNAL_QUALITY:
        return error_response(
            422,
            'The extracted waveform quality is too low for a prototype result. '
            'Retake or import a clearer ECG image.',
        )

    if result.get('heart_rate', 0) == 0:
        return error_response(
            422,
            'Heart rate could not be estimated reliably from this ECG image. '
            'Try a clearer single-lead strip with several visible beats.',
        )

    return {
        'heart_rate': result.get('heart_rate', 0),
        'rhythm': result.get('rhythm', 'Unknown'),
        'conditions': result.get('conditions', ['Unknown']),
        'confidence': result.get('confidence', 0.0),
        'summary': result.get('summary', 'Analysis completed.'),
        'recommendation': result.get(
            'recommendation',
            'No recommendation available.',
        ),
        'disclaimer': result.get(
            'disclaimer',
            'Experimental prototype only. Not a medical diagnosis.',
        ),
        'signal_quality': result.get('signal_quality', extraction_quality),
    }


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(
        'main:app',
        host='0.0.0.0',
        port=8000,
        reload=True,
    )
