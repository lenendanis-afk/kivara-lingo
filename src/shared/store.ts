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
  provider: 'offline',
  targetLanguage: 'es',
  deeplToken: '',
  googleToken: '',
  libreTranslateUrl: 'https://libretranslate.com',
  libreTranslateToken: '',
  cacheTtlDays: 30,
};

export const DEFAULT_ASR: AsrSettings = {
  enabled: false,
  model: 'tiny',
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
        onboarding: state.onboarding,
      }),
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
