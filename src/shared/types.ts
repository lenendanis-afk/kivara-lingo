export interface SubtitleStyles {
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'top' | 'middle' | 'bottom';
  /** 0..100 — vertical center of the subtitle expressed as % of the video height */
  verticalOffset: number;
  fontWeight: 'normal' | 'bold' | '900';
  /** 0..100 — text shadow intensity (0 = off) */
  textShadow: number;
}

export type FieldSource =
  | 'selection'
  | 'cue'
  | 'dictionary'
  | 'translate'
  | 'frame'
  | 'tabCapture'
  | 'tts'
  | 'ai-definition'
  | 'ai-synonyms'
  | 'ai-collocations'
  | 'ai-nuance'
  | 'ai-register'
  | 'manual';

export interface AudioClipResponse {
  ok: boolean;
  /** data URL: `data:audio/webm;base64,...` */
  dataUrl?: string;
  /** MIME type the offscreen recorder produced */
  mimeType?: string;
  /** Duration of the slice in milliseconds */
  durationMs?: number;
  error?: string;
}

export interface AudioCaptureStatus {
  active: boolean;
  tabId: number | null;
  /** mimeType currently used by the recorder */
  mimeType?: string;
  error?: string;
}

export interface TranslateRequest {
  text: string;
  sourceLang: string;
  targetLang?: string;
}

export interface TranslateResponse {
  ok: boolean;
  translatedText?: string;
  provider?: string;
  cached?: boolean;
  error?: string;
}

export interface TtsSpeakRequest {
  text: string;
  lang: string;
}

export interface TtsResponse {
  ok: boolean;
  error?: string;
}

export interface AnkiMapping {
  ankiUrl: string;
  deckName: string;
  modelName: string;
  /** key = exact Anki field name, value = source */
  fieldSources: Record<string, FieldSource>;
}

export type Mode = 'learning' | 'reading';

export type AudioSource = 'tab' | 'mic';
export type FrameMoment = 'start' | 'center' | 'end';
export type EndDetect = 'vad' | 'cue';

export interface CaptureSettings {
  autoMode: boolean;
  audioSource: AudioSource;
  frameMoment: FrameMoment;
  endDetect: EndDetect;
  /** rolling buffer length in seconds */
  bufferSize: number;
  /** ms before cue.start that is also captured */
  preRoll: number;
  /** ms after cue.end that is also captured */
  postRoll: number;
  /** ms — merge adjacent cues separated by less than this */
  cueMerge: number;
}

export interface CleanupSettings {
  hideUI: boolean;
  hideShadows: boolean;
}

/**
 * Concrete translation providers (in roughly the same order they're tried
 * inside a chain): the bundled offline dictionary, two zero-config FREE
 * networked services, three BYOK premium services, and a sentinel value
 * ('none') we use when callers want to signal "no remote translation at all"
 * inside a single-provider config.
 *
 * The chain mode walks them in tier order (offline → free → premium) and
 * returns the first successful result.
 */
export type TranslateProvider =
  | 'offline'
  | 'mymemory'
  | 'lingva'
  | 'libretranslate'
  | 'deepl'
  | 'google';

export type TranslateMode = 'single' | 'chain';

export type TranslateTier = 'offline' | 'free' | 'premium';

export interface TranslateSettings {
  /**
   * Selection strategy:
   *  - 'single' picks just `provider` (legacy behaviour).
   *  - 'chain' walks `tiersEnabled` from offline → free → premium until one
   *    succeeds. This is the recommended default.
   */
  mode: TranslateMode;
  /** Active provider when `mode === 'single'`. */
  provider: TranslateProvider;
  /**
   * Which tiers participate in chain mode. Offline is always tried first and
   * is non-disable-able (the bundled dictionary is free and fast).
   */
  tiersEnabled: { free: boolean; premium: boolean };
  /**
   * Ordered list of free providers to attempt in chain mode. The default is
   * `['mymemory', 'lingva']` — MyMemory first because it returns higher quality
   * for short tokens, Lingva second because it's an unauthenticated Google
   * proxy and may rate-limit when used heavily.
   */
  freeChain: TranslateProvider[];
  /**
   * Ordered list of premium providers tried after the free chain. Each one
   * requires its own credential (see fields below); a provider with a missing
   * credential is silently skipped.
   */
  premiumChain: TranslateProvider[];
  /** Native target language (BCP-47). Default 'es'. */
  targetLanguage: string;
  /** DeepL API token (free or pro) */
  deeplToken: string;
  /** Google Cloud Translate v3 / v2 API key */
  googleToken: string;
  /** LibreTranslate base URL (e.g. https://libretranslate.com or self-hosted) */
  libreTranslateUrl: string;
  /** Optional API key for paid LibreTranslate instances */
  libreTranslateToken: string;
  /**
   * Optional email passed to MyMemory's `de` parameter. Anonymous = 5000
   * chars/day; with an email = 50000 chars/day.
   */
  myMemoryEmail: string;
  /**
   * Lingva base URL. Defaults to a well-known mirror. Self-host with
   * `docker run -p 3000:3000 thedaviddelta/lingva-translate` and point this at
   * `http://localhost:3000`.
   */
  lingvaUrl: string;
  /** Cache TTL in days (default 30) */
  cacheTtlDays: number;
}

export interface AsrSettings {
  /** Whether the user opted-in to on-device transcription as fallback */
  enabled: boolean;
  /** 'tiny' is ~75MB, 'small' ~466MB. Wired via Whisper.cpp WASM. */
  model: 'tiny' | 'base' | 'small';
  /**
   * Optional override for the Whisper.cpp glue script URL. Defaults to a
   * pinned jsdelivr CDN URL inside `whisper-asr.ts`. Surfaced here so the
   * user can point at a self-hosted build (e.g. for offline environments).
   */
  glueUrl?: string;
  /**
   * Optional override for the ggml model URL. Defaults to the HuggingFace
   * mirror of `ggml-tiny.en.bin` in `whisper-asr.ts`.
   */
  modelUrl?: string;
}

export interface TranscribeRequest {
  startMs: number;
  endMs: number;
  /** BCP-47 language tag; 'auto' lets Whisper detect */
  language?: string;
  /** Trim to detected speech via RMS-based VAD. Default true. */
  useVad?: boolean;
  preRollMs?: number;
  postRollMs?: number;
  /** Override the Whisper.cpp loader at runtime */
  whisperConfig?: {
    glueUrl?: string;
    modelUrl?: string;
    cacheName?: string;
  };
}

export interface TranscribeSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export type TranscribeResponse =
  | {
      ok: true;
      text: string;
      segments: TranscribeSegment[];
      language?: string;
      /** Clip metadata so the caller can attach it to a card. */
      clip: AudioClipResponse;
    }
  | { ok: false; error: string; transient?: boolean };

export type AiProvider = 'openai' | 'anthropic' | 'google-ai' | 'disabled';

export interface AiSettings {
  /** Active AI backend */
  provider: AiProvider;
  /** API key (chrome.storage.sync — never committed) */
  apiKey: string;
  /** Model identifier (e.g. gpt-4o-mini, claude-3-5-haiku-latest, gemini-1.5-flash) */
  model: string;
  /** Optional native language override (defaults to translate.targetLanguage) */
  nativeLanguage?: string;
  /** Enrich the saved card at save-time */
  enrichOnSave: boolean;
  /** Enrich the popover when the user hovers a word */
  enrichOnHover: boolean;
  /** Cache TTL in days for AI responses (default 30) */
  cacheTtlDays: number;
}

export interface AiEnrichment {
  /** Definition tailored to the cue context */
  contextualDefinition: string;
  /** Up to 5 synonyms in the source language */
  synonyms: string[];
  /** Up to 5 common collocations in the source language */
  collocations: string[];
  /** Nuanced translation that respects the cue context */
  nuancedTranslation: string;
  /** Detected register */
  register: 'formal' | 'neutral' | 'informal' | 'slang' | 'literary';
  /** How appropriate the token is for the platform's typical audience */
  appropriateness: string;
  /** Which provider was used (filled by the wrapper) */
  provider: AiProvider;
  /** Latency of the call in ms (filled by the wrapper) */
  latencyMs: number;
  /** True when the value came from the IndexedDB cache */
  cached: boolean;
}

export interface AiEnrichRequest {
  token: string;
  sentence: string;
  sourceLang: string;
  nativeLang: string;
  platform?: string;
}

export type AiEnrichResponse =
  | { ok: true; data: AiEnrichment }
  | { ok: false; error: string; provider: AiProvider };

/** Streaming-style resolution for the WordPopover */
export interface ResolveWordRequest {
  token: string;
  sentence: string;
  sourceLang: string;
  /** Whether the caller wants the AI wave (only fires if AI settings allow it) */
  includeAi?: boolean;
}

export interface ResolveWordLocalWave {
  stage: 'local';
  entry: DictionaryEntry | null;
}

export interface ResolveWordRemoteWave {
  stage: 'remote';
  translation: string;
  provider: string;
  cached: boolean;
}

export interface ResolveWordAiWave {
  stage: 'ai';
  data: AiEnrichment;
}

export interface ResolveWordErrorWave {
  stage: 'error';
  scope: 'remote' | 'ai';
  message: string;
}

export type ResolveWordWave =
  | ResolveWordLocalWave
  | ResolveWordRemoteWave
  | ResolveWordAiWave
  | ResolveWordErrorWave;

export interface ResolveWordResponse {
  ok: true;
  waves: ResolveWordWave[];
}

export interface OnboardingState {
  /** Whether the user has completed initial setup */
  completed: boolean;
  /** Timestamp when onboarding finished (or null) */
  completedAt: number | null;
}

export interface DictionaryEntry {
  token: string;
  /**
   * 'word' = single-word entry.
   * 'phrase' = multi-word expression. The render layer differentiates idiomatic
   * MWEs (e.g. "kick the bucket") from phrasal verbs (e.g. "look up") via the
   * optional `phraseKind` field below.
   */
  type: 'word' | 'phrase';
  /**
   * Optional sub-classification for phrase entries:
   *  - 'idiom'   — figurative meaning, ámbar-punteado in UI (default for phrase).
   *  - 'phrasal' — phrasal verb, rendered with a solid azul underline.
   */
  phraseKind?: 'idiom' | 'phrasal';
  phonetic?: string;
  translation: string;
  /**
   * When the dictionary hit was resolved via the lemmatizer (e.g. user looked
   * up "running" and we returned the entry for "run"), the lemma is recorded
   * here so the popover header can show "running → run".
   */
  lemmaOf?: string;
  bilingual?: string;
  monolingual?: string;
  level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  /**
   * Native-language example sentences from the dictionary. Rendered under the
   * monolingual definition in the popover and surfaced as a separate field in
   * the Anki auto-mapping when the user creates a card.
   */
  examples?: string[];
  /**
   * Source attribution surfaced in the popover footer. Useful for chain-mode
   * lookups so the user can see whether the translation came from the bundled
   * dictionary, MyMemory, DeepL, etc.
   */
  source?: string;
}

export interface CueSnapshot {
  id: string;
  text: string;
  start: number;
  end: number;
  language: string;
}

export interface CaptureContext {
  token: string;
  cue: CueSnapshot;
  platform: 'netflix' | 'youtube' | 'disney' | 'hbo' | 'prime' | 'generic';
  /** ISO BCP-47 of the cue language */
  language: string;
  /** JPEG blob of the active frame (base64) */
  frameDataUrl?: string;
  /** Audio blob (base64) — opt-in */
  audioDataUrl?: string;
  /** dictionary-resolved metadata */
  meta?: DictionaryEntry;
}

export interface CreateCardRequest {
  token: string;
  sentence: string;
  /** Optional: ISO-encoded frame as data URL (jpeg) */
  frame?: string;
  /** Optional: audio data URL (webm or mp3) */
  audio?: string;
  /** Cue start/end in ms (informational) */
  cueStart?: number;
  cueEnd?: number;
  language?: string;
  platform?: string;
}

export interface CreateCardResponse {
  ok: boolean;
  noteId?: number;
  error?: string;
  warnings?: string[];
}

export interface AnkiPingResponse {
  ok: boolean;
  version?: number;
  error?: string;
}

export interface AnkiListsResponse {
  decks: string[];
  models: string[];
}

export interface AnkiFieldsResponse {
  fields: string[];
}
