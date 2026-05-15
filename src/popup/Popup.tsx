import { useEffect, useState } from 'react';
import { sendMessage } from 'webext-bridge/popup';
import { Power, ExternalLink, MicIcon, MicOffIcon, Settings } from 'lucide-react';
import { useKivaraStore } from '../shared/store';
import { KivaraLingoLogo } from '../app/components/KivaraLingoLogo';
import type { AnkiPingResponse } from '../shared/types';

interface PingState {
  status: 'idle' | 'pinging' | 'ok' | 'error';
  version?: number;
  error?: string;
}

export function Popup() {
  const {
    enabled,
    isDarkMode,
    audioCaptureActive,
    ankiMapping,
    setEnabled,
    setPanelOpen,
    setIsDarkMode,
    setAudioCaptureActive,
  } = useKivaraStore();

  const [ping, setPing] = useState<PingState>({ status: 'idle' });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setPing({ status: 'pinging' });
      try {
        const result = (await sendMessage('ANKI_PING', { url: ankiMapping.ankiUrl }, 'background')) as AnkiPingResponse;
        if (cancelled) return;
        if (result.ok) setPing({ status: 'ok', version: result.version });
        else setPing({ status: 'error', error: result.error });
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : 'unknown';
        setPing({ status: 'error', error: reason });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [ankiMapping.ankiUrl]);

  async function openPanelOnActiveTab() {
    setPanelOpen(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' });
      }
    } catch {
      // ignore — no content script on tab
    }
    window.close();
  }

  async function toggleAudioCapture() {
    setAudioCaptureActive(!audioCaptureActive);
    // Phase 2: send START/STOP_AUDIO_CAPTURE to background which will set up
    // the offscreen document via chrome.offscreen.createDocument.
  }

  function openOptions() {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  }

  const statusColor =
    ping.status === 'ok'
      ? 'bg-emerald-500'
      : ping.status === 'error'
        ? 'bg-rose-500'
        : 'bg-amber-400';

  const statusLabel =
    ping.status === 'ok'
      ? `Conectado a Anki (v${ping.version})`
      : ping.status === 'pinging'
        ? 'Comprobando AnkiConnect…'
        : ping.status === 'error'
          ? 'AnkiConnect no responde'
          : '—';

  return (
    <div className={`w-[360px] ${isDarkMode ? 'dark' : ''}`} style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}>
      <div className="p-4 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
        <header className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <KivaraLingoLogo size={28} />
            <div>
              <div className="text-sm font-bold leading-none">Kivara Lingo</div>
              <div className="text-[10px] text-zinc-500 leading-none mt-0.5">v0.1 — Fase 1</div>
            </div>
          </div>
          <button
            onClick={openOptions}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
            title="Abrir página de opciones"
          >
            <Settings size={14} />
          </button>
        </header>

        <section className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor}`} />
              <span className="text-[12px]">{statusLabel}</span>
            </div>
            <button
              onClick={() => setPing({ status: 'idle' })}
              className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Reintentar
            </button>
          </div>
          {ping.status === 'error' && (
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
              Abre Anki y verifica que el complemento AnkiConnect esté instalado.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <button
            onClick={() => setEnabled(!enabled)}
            className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              enabled
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Power size={14} />
              {enabled ? 'Extensión activada' : 'Extensión desactivada'}
            </span>
          </button>

          <button
            onClick={openPanelOnActiveTab}
            className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          >
            <span>Abrir panel en la pestaña</span>
            <ExternalLink size={12} />
          </button>

          <button
            onClick={toggleAudioCapture}
            className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
              audioCaptureActive
                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25'
                : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
            title="Phase 1.5: requiere gesto del usuario y chrome.tabCapture"
          >
            <span className="flex items-center gap-2">
              {audioCaptureActive ? <MicIcon size={14} /> : <MicOffIcon size={14} />}
              {audioCaptureActive ? 'Captura de audio activa' : 'Activar captura de audio'}
            </span>
            <span className="text-[9px] text-zinc-500">Phase 1.5</span>
          </button>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full text-left text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-1"
          >
            Cambiar a tema {isDarkMode ? 'claro' : 'oscuro'}
          </button>
        </section>
      </div>
    </div>
  );
}
