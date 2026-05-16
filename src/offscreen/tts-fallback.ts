/**
 * SpeechSynthesis (Web Speech API) TTS fallback for the offscreen document.
 *
 * Why a fallback?
 *  - `chrome.tts` is only available in Chromium-based browsers and even
 *    there it can fail when no system voice is installed for the
 *    requested BCP-47 language. Examples:
 *      - Linux without `speech-dispatcher`.
 *      - Chromebooks where the user disabled accessibility voices.
 *      - Edge with policy that turned off TTS engines.
 *  - The Web Speech API (`speechSynthesis.speak`) is available in *all*
 *    evergreen browsers (Chrome, Firefox, Safari) and uses the OS voices.
 *    It just needs a DOM context, which is exactly what the offscreen
 *    document provides.
 *
 * The background service worker has no DOM (and thus no
 * `window.speechSynthesis`), so it routes the request here via
 * `chrome.runtime.sendMessage({ type: 'OFFSCREEN_TTS_SPEAK', text, lang })`.
 */

export interface TtsRequest {
  text: string;
  lang: string;
  /** 0.1 – 10. Default 0.95 to match `chrome.tts` defaults. */
  rate?: number;
  /** 0 – 2. Default 1. */
  pitch?: number;
}

export interface TtsResult {
  ok: boolean;
  error?: string;
  /** Voice URI actually used (debugging). */
  voice?: string;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/**
 * Wait for the voice list to be populated. Chrome/Edge return [] on the
 * first call and fire `voiceschanged` once the engines are ready.
 */
function listVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    if (typeof speechSynthesis === 'undefined') {
      resolve([]);
      return;
    }
    const initial = speechSynthesis.getVoices();
    if (initial.length) {
      resolve(initial);
      return;
    }
    const onChange = () => {
      speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener('voiceschanged', onChange);
    // Safety net in case the event never fires.
    setTimeout(() => {
      try {
        speechSynthesis.removeEventListener('voiceschanged', onChange);
      } catch {
        /* ignore */
      }
      resolve(speechSynthesis.getVoices());
    }, 800);
  });
  return voicesPromise;
}

/** Pick the best voice for the requested BCP-47 tag. */
function selectVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  const norm = lang.toLowerCase();
  const base = norm.split('-')[0];
  // Exact match first; then language-only; then default voice; then any.
  return (
    voices.find((v) => v.lang.toLowerCase() === norm) ??
    voices.find((v) => v.lang.toLowerCase().split('-')[0] === base) ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

export async function speakViaSpeechSynthesis(req: TtsRequest): Promise<TtsResult> {
  const text = (req.text ?? '').trim();
  if (!text) return { ok: true };
  if (typeof speechSynthesis === 'undefined') {
    return { ok: false, error: 'speechSynthesis unavailable' };
  }

  const voices = await listVoices();
  const voice = selectVoice(voices, req.lang || 'en');

  return new Promise<TtsResult>((resolve) => {
    let settled = false;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = voice?.lang ?? req.lang ?? 'en';
    utt.rate = req.rate ?? 0.95;
    utt.pitch = req.pitch ?? 1;
    if (voice) utt.voice = voice;

    const settle = (result: TtsResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    utt.onend = () => settle({ ok: true, voice: voice?.voiceURI });
    utt.onerror = (event) =>
      settle({
        ok: false,
        error: event.error || 'speechSynthesis error',
        voice: voice?.voiceURI,
      });

    try {
      // Cancel anything currently speaking — single word at a time.
      speechSynthesis.cancel();
      speechSynthesis.speak(utt);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'speechSynthesis threw';
      settle({ ok: false, error: reason });
    }

    // Belt + suspenders: some browsers silently drop utterances if the
    // queue is paused; fall through after a generous deadline so callers
    // are never stuck waiting forever.
    const timeoutMs = Math.max(2000, text.length * 120);
    setTimeout(() => settle({ ok: false, error: 'speechSynthesis timeout' }), timeoutMs);
  });
}
