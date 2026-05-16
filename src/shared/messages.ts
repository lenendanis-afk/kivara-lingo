/**
 * Centralized message name registry for webext-bridge. Keeping the names in one
 * place prevents typos between content/background/popup.
 */
export const MSG = {
  /** content → background: build & save a card */
  CREATE_CARD: 'CREATE_CARD',
  /** popup/options → background: ping AnkiConnect */
  ANKI_PING: 'ANKI_PING',
  /** any → background: list AnkiConnect decks */
  ANKI_DECKS: 'ANKI_DECKS',
  /** any → background: list AnkiConnect models */
  ANKI_MODELS: 'ANKI_MODELS',
  /** any → background: list fields for a given model */
  ANKI_FIELDS: 'ANKI_FIELDS',
  /** any → background: create a deck via AnkiConnect */
  ANKI_CREATE_DECK: 'ANKI_CREATE_DECK',
  /** popup → background: start audio capture for the current tab */
  START_AUDIO_CAPTURE: 'START_AUDIO_CAPTURE',
  /** popup → background: stop audio capture */
  STOP_AUDIO_CAPTURE: 'STOP_AUDIO_CAPTURE',
  /** offscreen → background: notify audio capture state */
  AUDIO_CAPTURE_STATE: 'AUDIO_CAPTURE_STATE',
  /** background → offscreen: request a sliced audio blob */
  REQUEST_AUDIO_SLICE: 'REQUEST_AUDIO_SLICE',
  /** content → background: extract clip for active cue (ms-relative to recording start) */
  EXTRACT_AUDIO_CLIP: 'EXTRACT_AUDIO_CLIP',
  /** content → background: transcribe a clip with the on-device Whisper model */
  TRANSCRIBE_AUDIO_CLIP: 'TRANSCRIBE_AUDIO_CLIP',
  /** popup/options → background: get audio capture status */
  AUDIO_CAPTURE_STATUS: 'AUDIO_CAPTURE_STATUS',
  /** any → background: translate a single token using the configured provider */
  TRANSLATE: 'TRANSLATE',
  /** any → background: speak a single word via chrome.tts */
  TTS_SPEAK: 'TTS_SPEAK',
  /** chrome.runtime.sendMessage payloads */
  TOGGLE_PANEL: 'TOGGLE_PANEL',
  RUN_COMMAND: 'RUN_COMMAND',
} as const;

export type MessageName = (typeof MSG)[keyof typeof MSG];

/**
 * Namespace used by the MAIN-world subtitle interceptor to relay parsed cues
 * back to the ISOLATED content script via `window.postMessage`.
 */
export const MAIN_WORLD_EVENT = 'kivara-lingo:subtitle-track' as const;
