/*
HeartGuard API Layer

Changes for prototype v1:
- Backend URL can come from EXPO_PUBLIC_API_URL.
- Uploads keep their original MIME type / filename when available.
- API errors are parsed defensively.
- signal_quality is preserved for the results screen.
*/

const DEFAULT_API_URL = 'http://10.0.0.226:8000';

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL
).replace(/\/$/, '');

function guessMimeType(uri = '') {
  const cleanUri = uri.toLowerCase().split('?')[0];

  if (cleanUri.endsWith('.png')) return 'image/png';
  if (cleanUri.endsWith('.webp')) return 'image/webp';
  if (cleanUri.endsWith('.heic') || cleanUri.endsWith('.heif')) {
    return 'image/heic';
  }

  return 'image/jpeg';
}

function extensionForMimeType(mimeType = '') {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('heic') || mimeType.includes('heif')) return 'heic';
  return 'jpg';
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export const analyzeECGImage = async (
  uri,
  mimeType = null,
  fileName = null,
) => {
  if (!uri) {
    return { error: 'No ECG image was selected.' };
  }

  const resolvedMimeType = mimeType || guessMimeType(uri);
  const resolvedFileName =
    fileName || `ecg.${extensionForMimeType(resolvedMimeType)}`;

  const formData = new FormData();

  formData.append('file', {
    uri,
    name: resolvedFileName,
    type: resolvedMimeType,
  });

  try {
    const response = await fetch(`${API_URL}/analyze-ecg-image`, {
      method: 'POST',
      body: formData,
    });

    const data = await readJsonSafely(response);

    if (!response.ok) {
      return {
        error: data.error || `Backend analysis failed (${response.status}).`,
      };
    }

    return {
      heart_rate:
        typeof data.heart_rate === 'number' ? data.heart_rate : 0,
      conditions:
        Array.isArray(data.conditions) && data.conditions.length > 0
          ? data.conditions
          : ['Unknown'],
      rhythm: data.rhythm || 'Unknown',
      confidence:
        typeof data.confidence === 'number' ? data.confidence : 0,
      signal_quality:
        typeof data.signal_quality === 'number' ? data.signal_quality : 0,
      summary: data.summary || 'Analysis completed.',
      recommendation:
        data.recommendation || 'No recommendation available.',
      disclaimer:
        data.disclaimer || 'Prototype only. Not a medical diagnosis.',
    };
  } catch (error) {
    console.error('HeartGuard API error:', error);

    return {
      error:
        `Unable to connect to HeartGuard backend at ${API_URL}. ` +
        'Confirm the FastAPI server is running and the phone can reach your computer.',
    };
  }
};

export const checkBackendHealth = async () => {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await readJsonSafely(response);

    return response.ok && data.healthy === true;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
};
