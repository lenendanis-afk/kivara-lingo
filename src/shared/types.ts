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

export type TranslateProvider = 'offline' | 'deepl' | 'google' | 'libretranslate';

export interface TranslateSettings {
  provider: TranslateProvider;
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
  /** Cache TTL in days (default 30) */
  cacheTtlDays: number;
}

export interface AsrSettings {
  /** Whether the user opted-in to on-device transcription as fallback */
  enabled: boolean;
  /** 'tiny' is ~75MB, 'small' ~466MB. Reserved for Phase 3 wiring. */
  model: 'tiny' | 'base' | 'small';
}

export interface OnboardingState {
  /** Whether the user has completed initial setup */
  completed: boolean;
  /** Timestamp when onboarding finished (or null) */
  completedAt: number | null;
}

export interface DictionaryEntry {
  token: string;
  type: 'word' | 'phrase';
  phonetic?: string;
  translation: string;
  bilingual?: string;
  monolingual?: string;
  level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
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
