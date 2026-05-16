/**
 * Dictionary Packs management section.
 *
 * Lists Yomitan-compatible packs the user has installed (stored in IndexedDB
 * via Dexie), lets them toggle each pack on/off, and lets them import a new
 * pack from a .zip file. Importing reuses the existing
 * `importYomitanPack()` helper so the same pipeline is reachable from the
 * background service worker and any UI surface (Options page, side panel).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookText, Trash2, Upload, Power, PowerOff, Loader2 } from 'lucide-react';
import type { DictPackRow } from '../../../shared/db';
import {
  importYomitanPack,
  listYomitanPacks,
  deleteYomitanPack,
  setPackEnabled,
} from '../../../content/nlp/yomitan';

interface ImportFeedback {
  kind: 'ok' | 'err';
  message: string;
}

export function DictPacksSection() {
  const [packs, setPacks] = useState<DictPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listYomitanPacks();
      setPacks(list);
    } catch (err) {
      console.warn('[Kivara Lingo] could not list dict packs', err);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setFeedback(null);
      setImporting(true);
      try {
        const buffer = await file.arrayBuffer();
        const result = await importYomitanPack(buffer);
        if (result.ok) {
          setFeedback({
            kind: 'ok',
            message: `${result.pack.title} · ${result.termsImported.toLocaleString()} términos importados`,
          });
        } else {
          setFeedback({ kind: 'err', message: result.error });
        }
        await refresh();
      } catch (err) {
        setFeedback({
          kind: 'err',
          message: `Error inesperado: ${(err as Error).message}`,
        });
      } finally {
        setImporting(false);
      }
    },
    [refresh],
  );

  const onToggle = useCallback(
    async (pack: DictPackRow) => {
      await setPackEnabled(pack.id, !pack.enabled);
      await refresh();
    },
    [refresh],
  );

  const onDelete = useCallback(
    async (pack: DictPackRow) => {
      if (
        // eslint-disable-next-line no-alert
        !window.confirm(`¿Eliminar "${pack.title}" y sus ${pack.termCount.toLocaleString()} términos?`)
      ) {
        return;
      }
      await deleteYomitanPack(pack.id);
      await refresh();
    },
    [refresh],
  );

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
      <header className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <BookText size={10} className="text-zinc-500" />
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex-1">
          Diccionarios offline
        </h3>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-500 normal-case">
          {packs.length} {packs.length === 1 ? 'pack' : 'packs'}
        </span>
      </header>
      <div className="p-2.5 space-y-2">
        <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-snug">
          Importa packs en formato Yomitan (.zip) para tener cobertura offline completa.
          Compatible con dicts de{' '}
          <a
            href="https://yomitan.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 hover:underline"
          >
            yomitan.io
          </a>{' '}
          y otros packs Yomitan estándar.
        </p>

        {loading ? (
          <div className="text-[11px] text-zinc-500 italic">Cargando packs…</div>
        ) : packs.length === 0 ? (
          <div className="text-[11px] text-zinc-500 italic px-1">
            Ningún pack instalado. Importa uno para empezar.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {packs.map((pack) => (
              <li
                key={pack.id}
                className="border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1.5 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200 truncate normal-case">
                      {pack.title}
                    </span>
                    <span className="text-[9px] text-zinc-500 normal-case shrink-0">
                      {pack.sourceLang} → {pack.targetLang}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 normal-case flex gap-2">
                    <span>{pack.termCount.toLocaleString()} términos</span>
                    <span>· rev. {pack.revision}</span>
                    {!pack.enabled && (
                      <span className="text-rose-400">· deshabilitado</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onToggle(pack)}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                  title={pack.enabled ? 'Deshabilitar' : 'Habilitar'}
                >
                  {pack.enabled ? <Power size={12} /> : <PowerOff size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(pack)}
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500"
                  title="Eliminar"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onPickFile}
            disabled={importing}
            className="text-[11px] px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            {importing ? 'Importando…' : 'Importar pack (.zip)'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => void onFile(e)}
            className="hidden"
          />
        </div>

        {feedback && (
          <div
            className={`text-[10px] leading-snug normal-case pt-0.5 ${
              feedback.kind === 'ok' ? 'text-emerald-500' : 'text-rose-400'
            }`}
          >
            {feedback.message}
          </div>
        )}
      </div>
    </section>
  );
}
