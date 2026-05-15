import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toaster, toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { sendMessage } from 'webext-bridge/content-script';
import { SidePanel } from './SidePanel';
import { SubtitleOverlay } from './SubtitleOverlay';
import { useKivaraStore } from '../../shared/store';
import { captureFrame } from '../capture/frame';
import type { CreateCardRequest, CreateCardResponse } from '../../shared/types';
import type { SubtitleSource } from '../platform-adapters/types';

interface ActiveCue {
  id: string;
  text: string;
  start?: number;
  end?: number;
  language?: string;
}

interface AppProps {
  adapter: SubtitleSource | null;
  videoElement: HTMLVideoElement | null;
  videoOverlayRoot?: HTMLElement | null;
}

export function App({ adapter, videoElement, videoOverlayRoot }: AppProps) {
  const {
    enabled,
    panelOpen,
    isPopupMode,
    isDarkMode,
    mode,
    subtitleStyles,
    ankiMapping,
    setPanelOpen,
    setIsPopupMode,
    setIsDarkMode,
    setSubtitleStyles,
    setAnkiMapping,
  } = useKivaraStore();

  const [activeCue, setActiveCue] = useState<ActiveCue | null>(null);
  const [saveTick, setSaveTick] = useState<number | null>(null);
  const cueLanguageRef = useRef('en');
  const wasPlayingRef = useRef(false);

  // Sync dark mode on hosts + overlay root so theme.css `.dark` selector works.
  useEffect(() => {
    const mainHost = document.getElementById('kivara-lingo-host');
    const mainRoot = mainHost?.shadowRoot?.getElementById('kivara-lingo-react-root');
    const videoHost = document.getElementById('kivara-lingo-video-host');
    const videoRoot = videoHost?.shadowRoot?.getElementById('kivara-lingo-video-react-root');

    const elementsToUpdate = [mainHost, mainRoot, videoHost, videoRoot, videoOverlayRoot].filter(
      Boolean,
    ) as HTMLElement[];

    elementsToUpdate.forEach((el) => {
      if (isDarkMode) {
        el.classList.add('dark');
        if (el.style) el.style.colorScheme = 'dark';
      } else {
        el.classList.remove('dark');
        if (el.style) el.style.colorScheme = 'light';
      }
    });
  }, [isDarkMode, videoOverlayRoot]);

  // Listen to adapter cue changes.
  useEffect(() => {
    if (!adapter) return;
    adapter.onCueChange((cues) => {
      if (cues.length === 0) {
        setActiveCue(null);
        return;
      }
      const first = cues[0];
      cueLanguageRef.current = first.language || 'en';
      setActiveCue({
        id: first.id,
        text: first.text,
        start: first.start,
        end: first.end,
        language: first.language,
      });
    });
    const initialCue = adapter.getActiveCue?.();
    if (initialCue) {
      cueLanguageRef.current = initialCue.language || 'en';
      setActiveCue({
        id: initialCue.id,
        text: initialCue.text,
        start: initialCue.start,
        end: initialCue.end,
        language: initialCue.language,
      });
    }
  }, [adapter]);

  // Pause video while the user is reading a popover; resume on leave.
  const handleTokenHoverChange = useCallback(
    (hovered: boolean) => {
      if (!videoElement) return;
      if (hovered) {
        if (!videoElement.paused) {
          wasPlayingRef.current = true;
          videoElement.pause();
        } else {
          wasPlayingRef.current = false;
        }
      } else if (wasPlayingRef.current) {
        wasPlayingRef.current = false;
        void videoElement.play().catch(() => {});
      }
    },
    [videoElement],
  );

  // Bridge runtime messages (from background) → local actions.
  useEffect(() => {
    const handler = (msg: { type?: string; command?: string }) => {
      if (msg?.type === 'TOGGLE_PANEL') {
        setPanelOpen(!useKivaraStore.getState().panelOpen);
      } else if (msg?.type === 'OPEN_PANEL') {
        setPanelOpen(true);
      } else if (msg?.type === 'CLOSE_PANEL') {
        setPanelOpen(false);
      } else if (msg?.type === 'RUN_COMMAND') {
        switch (msg.command) {
          case 'save_word':
            setSaveTick(Date.now());
            break;
          case 'toggle_subtitles':
            // Phase 2: hide overlay
            break;
          case 'repeat_phrase':
            if (videoElement && activeCue?.start != null) {
              videoElement.currentTime = activeCue.start / 1000;
              void videoElement.play().catch(() => {});
            }
            break;
          case 'show_translation':
            // No-op for now: translation already shows on hover.
            break;
          default:
            break;
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [activeCue, setPanelOpen, videoElement]);

  const handleSaveCard = async (token: string | undefined, sentence: string) => {
    if (!enabled) return;
    const tokenValue = token?.trim() || sentence.trim();
    if (!tokenValue) return;

    let frameDataUrl: string | null = null;
    if (videoElement) {
      frameDataUrl = await captureFrame(videoElement);
    }

    const request: CreateCardRequest = {
      token: tokenValue,
      sentence,
      frame: frameDataUrl ?? undefined,
      cueStart: activeCue?.start,
      cueEnd: activeCue?.end,
      language: cueLanguageRef.current,
      platform: adapter?.platform,
    };

    try {
      const response = (await sendMessage('CREATE_CARD', request, 'background')) as CreateCardResponse;
      if (response?.ok) {
        toast.custom(
          (id) => (
            <div className="flex items-center gap-2.5 bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/60 rounded-lg shadow-2xl px-3 py-2.5 min-w-[280px]">
              <div className="w-7 h-7 rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-white leading-tight">Tarjeta guardada</div>
                <div className="text-[10px] text-zinc-400 leading-tight mt-0.5 truncate">
                  <span className="font-mono text-indigo-300">{tokenValue}</span>
                  <span className="text-zinc-500"> → </span>
                  {ankiMapping.deckName}
                </div>
              </div>
              <button
                onClick={() => toast.dismiss(id)}
                className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded transition-colors shrink-0"
              >
                OK
              </button>
            </div>
          ),
          { duration: 3200 },
        );
        if (response.warnings?.length) {
          toast.message(response.warnings.join(' · '));
        }
      } else {
        toast.error(response?.error ?? 'Error guardando en Anki');
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'desconocido';
      toast.error(`Error guardando en Anki: ${reason}`);
    }
  };

  const overlayPortal = useMemo(() => {
    if (!videoOverlayRoot || !enabled) return null;
    return createPortal(
      <div
        className={`absolute inset-0 pointer-events-none ${isDarkMode ? 'dark' : ''}`}
        style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
      >
        <SubtitleOverlay
          subtitleStyles={subtitleStyles}
          cue={activeCue}
          mode={mode}
          saveRequestKey={saveTick}
          onSaveCard={handleSaveCard}
          onTokenHoverChange={handleTokenHoverChange}
        />
      </div>,
      videoOverlayRoot,
    );
  }, [
    activeCue,
    enabled,
    isDarkMode,
    mode,
    saveTick,
    subtitleStyles,
    videoOverlayRoot,
    handleTokenHoverChange,
  ]);

  return (
    <div
      className={`font-sans text-zinc-900 dark:text-zinc-100 pointer-events-none ${isDarkMode ? 'dark' : ''}`}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483646, colorScheme: isDarkMode ? 'dark' : 'light' }}
    >
      <div className="pointer-events-auto">
        <Toaster position="top-center" theme={isDarkMode ? 'dark' : 'light'} />
      </div>

      {overlayPortal}

      {enabled && panelOpen && (
        <div
          className="pointer-events-auto"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          <SidePanel
            isPopupMode={isPopupMode}
            onClose={() => setPanelOpen(false)}
            togglePopupMode={() => setIsPopupMode(!isPopupMode)}
            isDarkMode={isDarkMode}
            toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            styles={subtitleStyles}
            setStyles={setSubtitleStyles}
            mapping={ankiMapping}
            setMapping={setAnkiMapping}
            mockData={{
              targetSentence: activeCue?.text ?? '',
              nativeSentence: '',
              word: '',
              translation: '',
              phonetic: '',
              bilingual: '',
              monolingual: '',
            }}
          />
        </div>
      )}
    </div>
  );
}
