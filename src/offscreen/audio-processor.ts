/// <reference types="chrome" />

/**
 * Offscreen audio processor (Phase 1.5).
 *
 * The service worker dispatches `START_AUDIO_CAPTURE` once the user has
 * granted a tab capture stream. We keep a rolling 30s buffer of audio so
 * the card-saving flow can clip ~the last N seconds (approximate cue
 * window) into an mp3/webm blob.
 *
 * This file is intentionally minimal; full VAD and clipping logic ships in
 * Phase 2 when we have a real end-to-end audio pipeline.
 */

interface OffscreenMessage {
  type: string;
  streamId?: string;
}

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;

async function startCapture(streamId: string) {
  if (mediaRecorder) await stopCapture();
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
    console.warn('[Kivara Lingo] offscreen getUserMedia failed', err);
    return;
  }
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size) {
      chunks.push(e.data);
      // Keep only the last ~30 seconds of audio
      while (chunks.length > 30) chunks.shift();
    }
  };
  mediaRecorder.start(1000);
}

async function stopCapture() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  mediaRecorder = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  chunks = [];
}

chrome.runtime.onMessage.addListener((msg: OffscreenMessage, _sender, sendResponse) => {
  if (msg.type === 'START_AUDIO_CAPTURE' && msg.streamId) {
    void startCapture(msg.streamId);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'STOP_AUDIO_CAPTURE') {
    void stopCapture();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

console.log('[Kivara Lingo] offscreen audio worker ready');
