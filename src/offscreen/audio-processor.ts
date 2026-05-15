/// <reference types="chrome" />

/**
 * Offscreen audio processor.
 *
 * Lifecycle:
 *  1. Service worker calls `chrome.offscreen.createDocument` with reason
 *     `USER_MEDIA` and gives this document a `streamId` from
 *     `chrome.tabCapture.getMediaStreamId`.
 *  2. We open the tab media stream via `navigator.mediaDevices.getUserMedia`
 *     using the legacy `chromeMediaSource` constraints — those still work in
 *     MV3 offscreen documents.
 *  3. We re-route the captured audio to `AudioContext.destination` so the
 *     user keeps hearing the tab.
 *  4. `MediaRecorder` records continuously into a rolling buffer of N seconds
 *     worth of chunks (timeslice 250 ms).
 *  5. When the background asks `EXTRACT_AUDIO_CLIP`, we splice the relevant
 *     chunks and ship them back as a base64-encoded WebM/Opus blob.
 *
 * The whole document lives only while audio capture is active. The service
 * worker tears it down with `chrome.offscreen.closeDocument()` on stop.
 */

interface OffscreenMessage {
  type: string;
  streamId?: string;
  startMs?: number;
  endMs?: number;
  bufferSizeSec?: number;
  requestId?: string;
}

interface ChunkRecord {
  blob: Blob;
  /** Wall-clock ms at the moment the chunk was emitted by MediaRecorder */
  recordedAt: number;
  /** Approximate duration in ms (timeslice) */
  durationMs: number;
}

const TIMESLICE_MS = 250;

let mediaRecorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let chunks: ChunkRecord[] = [];
let bufferSizeMs = 30_000;
let recordedMime = '';
/** wall-clock ms when MediaRecorder was started — anchor for all timestamps */
let recordingStartedAt = 0;

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore
    }
  }
  return '';
}

async function startCapture(streamId: string, bufferSec: number): Promise<{ ok: boolean; mimeType?: string; error?: string }> {
  if (mediaRecorder) await stopCapture();
  bufferSizeMs = Math.max(5, bufferSec) * 1000;

  try {
    stream = await (navigator.mediaDevices as MediaDevices & {
      getUserMedia(constraints: unknown): Promise<MediaStream>;
    }).getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
      },
      video: false,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'getUserMedia failed';
    console.warn('[Kivara Lingo] offscreen getUserMedia failed', err);
    return { ok: false, error: reason };
  }

  // Re-route audio back to the user's speakers so the tab keeps making sound.
  try {
    audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNode.connect(audioCtx.destination);
  } catch (err) {
    console.warn('[Kivara Lingo] failed to wire audio passthrough', err);
  }

  const mimeType = pickMimeType();
  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'MediaRecorder failed';
    return { ok: false, error: reason };
  }

  recordedMime = mediaRecorder.mimeType || mimeType || 'audio/webm';
  recordingStartedAt = Date.now();
  chunks = [];

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (!event.data || !event.data.size) return;
    chunks.push({
      blob: event.data,
      recordedAt: Date.now(),
      durationMs: TIMESLICE_MS,
    });
    pruneOld();
  };

  mediaRecorder.start(TIMESLICE_MS);
  console.log('[Kivara Lingo] offscreen recording', { mime: recordedMime, bufferSizeMs });
  return { ok: true, mimeType: recordedMime };
}

function pruneOld() {
  if (!chunks.length) return;
  const horizon = Date.now() - bufferSizeMs;
  let firstKeep = 0;
  while (firstKeep < chunks.length && chunks[firstKeep].recordedAt < horizon) firstKeep++;
  if (firstKeep > 0) chunks.splice(0, firstKeep);
}

async function stopCapture(): Promise<void> {
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  } catch (err) {
    console.warn('[Kivara Lingo] mediaRecorder.stop failed', err);
  }
  mediaRecorder = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  try {
    sourceNode?.disconnect();
  } catch {
    // ignore
  }
  sourceNode = null;
  try {
    await audioCtx?.close();
  } catch {
    // ignore
  }
  audioCtx = null;
  chunks = [];
  recordedMime = '';
  recordingStartedAt = 0;
}

async function extractClip(startMs: number, endMs: number): Promise<{
  ok: boolean;
  dataUrl?: string;
  mimeType?: string;
  durationMs?: number;
  error?: string;
}> {
  if (!chunks.length) return { ok: false, error: 'No audio buffered yet' };
  const minStart = Math.min(...chunks.map((c) => c.recordedAt));
  const maxEnd = Math.max(...chunks.map((c) => c.recordedAt + c.durationMs));

  const sliceStart = Math.max(startMs, minStart);
  const sliceEnd = Math.min(endMs, maxEnd);
  if (sliceEnd <= sliceStart) {
    return { ok: false, error: 'Requested clip is outside the rolling buffer window' };
  }

  // MediaRecorder writes a self-contained stream — the first chunk includes
  // the container header. To produce a playable file we must always include
  // the very first chunk, then append any chunks whose time range overlaps
  // the requested window. This keeps the WebM/Opus framing intact.
  const header = chunks[0].blob;
  const overlapping = chunks
    .filter(
      (c) =>
        c.recordedAt + c.durationMs >= sliceStart && c.recordedAt <= sliceEnd,
    )
    .map((c) => c.blob);

  const parts = overlapping.includes(header) ? overlapping : [header, ...overlapping];
  const blob = new Blob(parts, { type: recordedMime || 'audio/webm' });
  const dataUrl = await blobToDataUrl(blob);
  return {
    ok: true,
    dataUrl,
    mimeType: recordedMime || 'audio/webm',
    durationMs: sliceEnd - sliceStart,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Failed to encode audio blob'));
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((rawMsg: unknown, _sender, sendResponse) => {
  const msg = (rawMsg ?? {}) as OffscreenMessage;
  if (!msg.type || !msg.type.startsWith('OFFSCREEN_')) return false;

  if (msg.type === 'OFFSCREEN_START_AUDIO_CAPTURE' && msg.streamId) {
    void startCapture(msg.streamId, msg.bufferSizeSec ?? 30).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (msg.type === 'OFFSCREEN_STOP_AUDIO_CAPTURE') {
    void stopCapture().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'OFFSCREEN_EXTRACT_AUDIO_CLIP' && typeof msg.startMs === 'number' && typeof msg.endMs === 'number') {
    void extractClip(msg.startMs, msg.endMs).then((result) => sendResponse(result));
    return true;
  }

  if (msg.type === 'OFFSCREEN_STATUS') {
    sendResponse({
      ok: true,
      active: !!mediaRecorder,
      mimeType: recordedMime,
      bufferedChunks: chunks.length,
      recordingStartedAt,
    });
    return false;
  }

  return false;
});

console.log('[Kivara Lingo] offscreen audio worker ready');
