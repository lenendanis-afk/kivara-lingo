/**
 * Capture the current frame of a `<video>` element as a JPEG data URL.
 *
 * Uses an `OffscreenCanvas` when available (smaller memory pressure and no
 * layout side effects) and falls back to a regular HTMLCanvasElement for
 * older browsers.
 *
 * NOTE: Some streaming platforms tag their video element as cross-origin and
 * cause `drawImage` to throw a SecurityError. We catch and return `null` so
 * the caller can build a card without the picture instead of failing.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  options: { quality?: number; maxWidth?: number } = {},
): Promise<string | null> {
  if (!video || video.readyState < 2 /* HAVE_CURRENT_DATA */) return null;
  const quality = options.quality ?? 0.82;
  const maxWidth = options.maxWidth ?? 1280;
  const ratio = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  const width = Math.max(1, Math.round(video.videoWidth * ratio));
  const height = Math.max(1, Math.round(video.videoHeight * ratio));

  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      return await blobToDataUrl(blob);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch (err) {
    console.warn('[Kivara Lingo] frame capture failed', err);
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
