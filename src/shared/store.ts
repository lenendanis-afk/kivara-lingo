import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import type {
  SubtitleStyles,
  AnkiMapping,
  Mode,
  CaptureSettings,
  CleanupSettings,
  TranslateSettings,
  AsrSettings,
  AiSettings,
  OnboardingState,
} from './types';

export const DEFAULT_SUBTITLE_STYLES: SubtitleStyles = {
  fontSize: 32,
  color: '#FCD34D',
  backgroundColor: '#000000',
  backgroundOpacity: 60,
  position: 'bottom',
  verticalOffset: 85,
  fontWeight: 'bold',
  textShadow: 80,
};

export const DEFAULT_ANKI_MAPPING: AnkiMapping = {
  ankiUrl: 'http://127.0.0.1:8765',
  deckName: 'Vocabulario Inglés',
  modelName: 'Basic',
  fieldSources: {},
};

export const DEFAULT_CAPTURE: CaptureSettings = {
  autoMode: true,
  audioSource: 'tab',
  frameMoment: 'center',
  endDetect: 'vad',
  bufferSize: 30,
  preRoll: 300,
  postRoll: 400,
  cueMerge: 300,
};

export const DEFAULT_CLEANUP: CleanupSettings = {
  hideUI: true,
  hideShadows: true,
};

export const DEFAULT_TRANSLATE: TranslateSettings = {
  // Chain mode by default — offline first, then free providers, then any
  // configured premium API. Single mode is still selectable in Settings for
  // users who want exact control over which API gets hit.
  mode: 'chain',
  provider: 'offline',
  tiersEnabled: { free: true, premium: true },
  // MyMemory first because for short tokens (most subtitle hovers) its corpus
  // returns better quality than the unauthenticated Google scrape that Lingva
  // performs.
  freeChain: ['mymemory', 'lingva'],
  // Premium chain skips any provider that lacks credentials at call time.
  premiumChain: ['deepl', 'google', 'libretranslate'],
  targetLanguage: 'es',
  deeplToken: '',
  googleToken: '',
  libreTranslateUrl: 'https://libretranslate.com',
  libreTranslateToken: '',
  myMemoryEmail: '',
  // The original lingva.ml host went down in 2024; thedaviddelta runs a
  // long-lived Vercel deployment at this domain. Users can point at their own
  // self-hosted instance or any of the mirrors listed at
  // https://github.com/thedaviddelta/lingva-translate#instances .
  lingvaUrl: 'https://lingva.thedaviddelta.com',
  cacheTtlDays: 30,
};

export const DEFAULT_ASR: AsrSettings = {
  enabled: false,
  model: 'tiny',
};

export const DEFAULT_AI: AiSettings = {
  provider: 'disabled',
  apiKey: '',
  model: 'gpt-4o-mini',
  enrichOnSave: false,
  enrichOnHover: false,
  cacheTtlDays: 30,
};

export const DEFAULT_ONBOARDING: OnboardingState = {
  completed: false,
  completedAt: null,
};

export interface KivaraState {
  enabled: boolean;
  panelOpen: boolean;
  isPopupMode: boolean;
  isDarkMode: boolean;
  mode: Mode;
  subtitleStyles: SubtitleStyles;
  ankiMapping: AnkiMapping;
  capture: CaptureSettings;
  cleanup: CleanupSettings;
  translate: TranslateSettings;
  asr: AsrSettings;
  ai: AiSettings;
  onboarding: OnboardingState;
  audioCaptureActive: boolean;

  setEnabled: (v: boolean) => void;
  setPanelOpen: (v: boolean) => void;
  setIsPopupMode: (v: boolean) => void;
  setIsDarkMode: (v: boolean) => void;
  setMode: (m: Mode) => void;
  setSubtitleStyles: (s: SubtitleStyles | ((prev: SubtitleStyles) => SubtitleStyles)) => void;
  setAnkiMapping: (m: AnkiMapping | ((prev: AnkiMapping) => AnkiMapping)) => void;
  setCapture: (c: CaptureSettings | ((prev: CaptureSettings) => CaptureSettings)) => void;
  setCleanup: (c: CleanupSettings | ((prev: CleanupSettings) => CleanupSettings)) => void;
  setTranslate: (t: TranslateSettings | ((prev: TranslateSettings) => TranslateSettings)) => void;
  setAsr: (a: AsrSettings | ((prev: AsrSettings) => AsrSettings)) => void;
  setAi: (a: AiSettings | ((prev: AiSettings) => AiSettings)) => void;
  setOnboarding: (o: OnboardingState | ((prev: OnboardingState) => OnboardingState)) => void;
  setAudioCaptureActive: (v: boolean) => void;
  resetSubtitleStyles: () => void;
}

/**
 * chrome.storage adapter for zustand's persist middleware. Falls back to localStorage
 * when chrome.storage is unavailable (e.g. when bundling tests).
 */
function makeChromeStorage(area: 'sync' | 'local' = 'sync'): StateStorage {
  return {
    async getItem(name: string): Promise<string | null> {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.[area]) {
          const result = await chrome.storage[area].get(name);
          const value = result[name];
          return typeof value === 'string' ? value : null;
        }
      } catch {
        // fall through
      }
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    async setItem(name: string, value: string): Promise<void> {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.[area]) {
          await chrome.storage[area].set({ [name]: value });
          return;
        }
      } catch {
        // fall through
      }
      try {
        localStorage.setItem(name, value);
      } catch {
        // ignore
      }
    },
    async removeItem(name: string): Promise<void> {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.[area]) {
          await chrome.storage[area].remove(name);
          return;
        }
      } catch {
        // fall through
      }
      try {
        localStorage.removeItem(name);
      } catch {
        // ignore
      }
    },
  };
}

const STORE_KEY = 'kivara-lingo-state';

/**
 * Defensive merge for persisted state. Zustand's default shallow merge only
 * fills in MISSING top-level keys — it doesn't recurse, so a snapshot saved
 * before a `translate.tiersEnabled` field existed will load with
 * `translate.tiersEnabled === undefined` and crash SettingsTab.
 *
 * This walks each top-level settings group and re-applies the default if
 * either the group is missing or any of its inner fields are missing. Existing
 * user choices are preserved.
 */
function mergePersisted(persistedState: unknown, currentState: KivaraState): KivaraState {
  const persisted = (persistedState ?? {}) as Partial<KivaraState>;
  return {
    ...currentState,
    ...persisted,
    subtitleStyles: { ...DEFAULT_SUBTITLE_STYLES, ...(persisted.subtitleStyles ?? {}) },
    ankiMapping: {
      ...DEFAULT_ANKI_MAPPING,
      ...(persisted.ankiMapping ?? {}),
      fieldSources: {
        ...DEFAULT_ANKI_MAPPING.fieldSources,
        ...(persisted.ankiMapping?.fieldSources ?? {}),
      },
    },
    capture: { ...DEFAULT_CAPTURE, ...(persisted.capture ?? {}) },
    cleanup: { ...DEFAULT_CLEANUP, ...(persisted.cleanup ?? {}) },
    translate: {
      ...DEFAULT_TRANSLATE,
      ...(persisted.translate ?? {}),
      tiersEnabled: {
        ...DEFAULT_TRANSLATE.tiersEnabled,
        ...(persisted.translate?.tiersEnabled ?? {}),
      },
      freeChain: Array.isArray(persisted.translate?.freeChain)
        ? persisted.translate!.freeChain
        : DEFAULT_TRANSLATE.freeChain,
      premiumChain: Array.isArray(persisted.translate?.premiumChain)
        ? persisted.translate!.premiumChain
        : DEFAULT_TRANSLATE.premiumChain,
    },
    asr: { ...DEFAULT_ASR, ...(persisted.asr ?? {}) },
    ai: { ...DEFAULT_AI, ...(persisted.ai ?? {}) },
    onboarding: { ...DEFAULT_ONBOARDING, ...(persisted.onboarding ?? {}) },
  };
}

export const useKivaraStore = create<KivaraState>()(
  persist(
    (set) => ({
      enabled: true,
      panelOpen: false,
      isPopupMode: false,
      isDarkMode: true,
      mode: 'learning',
      subtitleStyles: DEFAULT_SUBTITLE_STYLES,
      ankiMapping: DEFAULT_ANKI_MAPPING,
      capture: DEFAULT_CAPTURE,
      cleanup: DEFAULT_CLEANUP,
      translate: DEFAULT_TRANSLATE,
      asr: DEFAULT_ASR,
      ai: DEFAULT_AI,
      onboarding: DEFAULT_ONBOARDING,
      audioCaptureActive: false,

      setEnabled: (v) => set({ enabled: v }),
      setPanelOpen: (v) => set({ panelOpen: v }),
      setIsPopupMode: (v) => set({ isPopupMode: v }),
      setIsDarkMode: (v) => set({ isDarkMode: v }),
      setMode: (m) => set({ mode: m }),
      setSubtitleStyles: (s) =>
        set((state) => ({
          subtitleStyles: typeof s === 'function' ? s(state.subtitleStyles) : s,
        })),
      setAnkiMapping: (m) =>
        set((state) => ({
          ankiMapping: typeof m === 'function' ? m(state.ankiMapping) : m,
        })),
      setCapture: (c) =>
        set((state) => ({
          capture: typeof c === 'function' ? c(state.capture) : c,
        })),
      setCleanup: (c) =>
        set((state) => ({
          cleanup: typeof c === 'function' ? c(state.cleanup) : c,
        })),
      setTranslate: (t) =>
        set((state) => ({
          translate: typeof t === 'function' ? t(state.translate) : t,
        })),
      setAsr: (a) =>
        set((state) => ({
          asr: typeof a === 'function' ? a(state.asr) : a,
        })),
      setAi: (a) =>
        set((state) => ({
          ai: typeof a === 'function' ? a(state.ai) : a,
        })),
      setOnboarding: (o) =>
        set((state) => ({
          onboarding: typeof o === 'function' ? o(state.onboarding) : o,
        })),
      setAudioCaptureActive: (v) => set({ audioCaptureActive: v }),
      resetSubtitleStyles: () => set({ subtitleStyles: DEFAULT_SUBTITLE_STYLES }),
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => makeChromeStorage('sync')),
      partialize: (state) => ({
        enabled: state.enabled,
        panelOpen: state.panelOpen,
        isPopupMode: state.isPopupMode,
        isDarkMode: state.isDarkMode,
        mode: state.mode,
        subtitleStyles: state.subtitleStyles,
        ankiMapping: state.ankiMapping,
        capture: state.capture,
        cleanup: state.cleanup,
        translate: state.translate,
        asr: state.asr,
        ai: state.ai,
        onboarding: state.onboarding,
      }),
      // Deep-merge defaults into the persisted slice so a snapshot saved by an
      // older build (e.g. missing translate.tiersEnabled) doesn't crash the
      // panel with `Cannot read properties of undefined (reading 'free')`.
      merge: (persisted, current) => mergePersisted(persisted, current as KivaraState),
    },
  ),
);

// Cross-context state sync: when another extension context (popup / options /
// background) writes to chrome.storage.sync, rehydrate this store so the
// content script picks up the change without a full reload.
try {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && Object.prototype.hasOwnProperty.call(changes, STORE_KEY)) {
        void useKivaraStore.persist.rehydrate();
      }
    });
  }
} catch {
  // ignore — chrome.storage may not be available in test environments
}
