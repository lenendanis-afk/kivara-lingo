import React, { useEffect, useState } from 'react';
import { sendMessage } from 'webext-bridge/content-script';
import {
  Volume2, ChevronsLeftRight, Link2, Search, Plus, Eye, BookOpen, Check, Sparkles,
} from 'lucide-react';
import type {
  AiEnrichment,
  DictionaryEntry,
  ResolveWordResponse,
  ResolveWordWave,
} from '../../shared/types';
import { lookupDictionary } from '../nlp/dictionary';

interface WordPopoverProps {
  visible: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  token: string;
  /** The full subtitle/sentence around the token — used by AI enrichment. */
  sentence?: string;
  /** BCP-47 language tag of the source caption, defaults to "en". */
  sourceLang?: string;
  /** Whether to ask the background to invoke the AI provider on this hover. */
  includeAi?: boolean;
  kind: 'mwe' | 'known' | 'unknown' | 'mastered' | 'ignored' | 'punct';
  /** Sub-type for MWE tokens (idiom vs phrasal verb). */
  mweKind?: 'idiom' | 'phrasal';
  /** Resolved lemma if the dictionary hit came from the lemmatizer. */
  lemma?: string;
  isExpanded: boolean;
  isSaved: boolean;
  parentMWE: string | null;
  onToggleExpand: () => void;
  onRejoinParent: (parent: string) => void;
  onSave: (e: React.MouseEvent, token: string) => void;
}

interface ResolveState {
  /** Best-known dictionary entry for the token (local + remote merged). */
  entry: DictionaryEntry | null;
  /** True while waiting on the remote translator (entry comes from neither cache nor dict). */
  remoteLoading: boolean;
  remoteError: string | null;
  /**
   * Source / provider attribution for the translation currently shown.
   *  - 'dictionary' — came from the bundled offline JSON.
   *  - One of the TranslateProvider strings (mymemory / lingva / deepl / …)
   *    — came from a remote provider.
   *  - 'cache' — remote-sourced but served from the IndexedDB cache.
   */
  source: string | null;
  ai: AiEnrichment | null;
  /** True while waiting on the AI enrichment wave. */
  aiLoading: boolean;
  aiError: string | null;
}

const INITIAL_STATE: ResolveState = {
  entry: null,
  remoteLoading: false,
  remoteError: null,
  source: null,
  ai: null,
  aiLoading: false,
  aiError: null,
};

function useResolveWord(
  token: string,
  sentence: string,
  sourceLang: string,
  includeAi: boolean,
): ResolveState {
  const [state, setState] = useState<ResolveState>(INITIAL_STATE);

  useEffect(() => {
    // 1) Synchronous local-dict pass — always cheap, no need to wait.
    const local = lookupDictionary(token, sourceLang) ?? null;
    setState({
      ...INITIAL_STATE,
      entry: local,
      remoteLoading: !local,
      // Even when the local dict produces a hit we still attempt a remote
      // lookup in chain mode — the popover prefers the local entry for
      // phonetics + level metadata but augments with the remote translation
      // when our dict only has a tilde-placeholder. Setting source eagerly
      // here so the badge has something to show during the loading window.
      source: local ? 'dictionary' : null,
      aiLoading: includeAi,
    });
    if (!token.trim()) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const resp = (await sendMessage(
          'RESOLVE_WORD',
          { token, sentence, sourceLang, includeAi },
          'background',
        )) as ResolveWordResponse;
        if (controller.signal.aborted) return;
        applyWaves(resp.waves, setState);
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          remoteLoading: false,
          aiLoading: false,
          remoteError: prev.entry ? null : (err instanceof Error ? err.message : 'unknown'),
        }));
      }
    })();

    return () => {
      controller.abort();
    };
  }, [token, sentence, sourceLang, includeAi]);

  return state;
}

/**
 * Merge the wave array returned by the background into the popover's local
 * state. The waves arrive together (the SW resolves all three sequentially
 * before responding) so we apply them in order to mimic streaming.
 */
function applyWaves(waves: ResolveWordWave[], setState: React.Dispatch<React.SetStateAction<ResolveState>>): void {
  for (const wave of waves) {
    if (wave.stage === 'local') {
      setState((prev) => ({ ...prev, entry: prev.entry ?? wave.entry ?? null }));
    } else if (wave.stage === 'remote') {
      setState((prev) => {
        const hadGoodLocal =
          prev.entry?.translation && prev.entry.translation !== '—';
        return {
          ...prev,
          remoteLoading: false,
          remoteError: null,
          source: hadGoodLocal
            ? prev.source ?? 'dictionary'
            : wave.cached
              ? 'cache'
              : wave.provider,
          entry: hadGoodLocal
            ? prev.entry
            : {
                token: prev.entry?.token ?? '',
                type: prev.entry?.type ?? 'word',
                translation: wave.translation,
                bilingual: wave.translation,
                source: wave.provider,
              },
        };
      });
    } else if (wave.stage === 'ai') {
      setState((prev) => ({ ...prev, ai: wave.data, aiLoading: false, aiError: null }));
    } else if (wave.stage === 'error') {
      setState((prev) =>
        wave.scope === 'remote'
          ? { ...prev, remoteLoading: false, remoteError: wave.message }
          : { ...prev, aiLoading: false, aiError: wave.message },
      );
    }
  }
  // If the background omitted a wave (e.g. AI was requested but provider is
  // disabled), flip the corresponding loading flag off.
  setState((prev) => {
    const sawRemote = waves.some((w) => w.stage === 'remote' || (w.stage === 'error' && w.scope === 'remote'));
    const sawAi = waves.some((w) => w.stage === 'ai' || (w.stage === 'error' && w.scope === 'ai'));
    return {
      ...prev,
      remoteLoading: prev.remoteLoading && !sawRemote && !prev.entry ? false : prev.remoteLoading,
      aiLoading: prev.aiLoading && !sawAi ? false : prev.aiLoading,
    };
  });
}

export function WordPopover({
  visible,
  onMouseEnter,
  onMouseLeave,
  token,
  sentence = '',
  sourceLang = 'en',
  includeAi = false,
  kind,
  mweKind,
  lemma,
  isExpanded,
  isSaved,
  parentMWE,
  onToggleExpand,
  onRejoinParent,
  onSave,
}: WordPopoverProps) {
  const resolved = useResolveWord(token, sentence, sourceLang, includeAi);
  if (!visible) return null;

  const meta: DictionaryEntry =
    resolved.entry ?? {
      token,
      type: token.includes(' ') ? 'phrase' : 'word',
      translation: resolved.remoteLoading ? '' : '—',
    };
  const isMWE = kind === 'mwe';
  const isPhrasal = isMWE && mweKind === 'phrasal';
  const isUnknown = kind === 'unknown';
  const isMastered = kind === 'mastered';

  // CEFR level → colour. Mirrors the Common European Framework convention
  // used by Migaku/Trancy popovers (A1 = beginner green, climbing through
  // blue / indigo / violet to C2 = rose / advanced).
  const levelClasses = (level: string | undefined): string => {
    if (!level) return '';
    switch (level.toUpperCase()) {
      case 'A1': return 'text-emerald-300 bg-emerald-500/15 ring-emerald-500/30';
      case 'A2': return 'text-teal-300 bg-teal-500/15 ring-teal-500/30';
      case 'B1': return 'text-sky-300 bg-sky-500/15 ring-sky-500/30';
      case 'B2': return 'text-indigo-300 bg-indigo-500/15 ring-indigo-500/30';
      case 'C1': return 'text-fuchsia-300 bg-fuchsia-500/15 ring-fuchsia-500/30';
      case 'C2': return 'text-rose-300 bg-rose-500/15 ring-rose-500/30';
      default:   return 'text-zinc-300 bg-zinc-500/15 ring-zinc-500/30';
    }
  };

  // External-dictionary actions for the Definir / Buscar buttons. These used
  // to be inert placeholders; now they open useful references in a new tab.
  const headword = (meta.token || token).trim();
  const cleanHeadword = headword.replace(/["'‘’“”…]/g, '');
  const defineUrl =
    sourceLang && sourceLang.startsWith('en')
      ? `https://dictionary.cambridge.org/dictionary/english-spanish/${encodeURIComponent(cleanHeadword)}`
      : `https://www.wordreference.com/${encodeURIComponent((sourceLang || 'en').slice(0, 2))}es/${encodeURIComponent(cleanHeadword)}`;
  const searchQuery = sentence
    ? `${cleanHeadword} "${sentence.slice(0, 60)}"`
    : cleanHeadword;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    // First try the SpeechSynthesis API directly — it works offline and
    // doesn't need extension permissions. Fall back to the background's
    // chrome.tts fallback if the user has it disabled.
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(cleanHeadword);
        utter.lang = sourceLang || 'en-US';
        utter.rate = 0.95;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
        return;
      }
    } catch {
      /* fall through */
    }
    void sendMessage(
      'TTS_SPEAK',
      { text: cleanHeadword, lang: sourceLang || 'en' },
      'background',
    ).catch(() => {});
  };

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-kivara-hover-zone="true"
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 z-30"
      style={{
        pointerEvents: 'auto',
        textShadow: 'none',
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: 'normal',
        lineHeight: 1.4,
        color: '#ffffff',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        textAlign: 'left',
        width: '280px',
        maxWidth: 'min(320px, calc(100vw - 32px))',
        zIndex: 2147483646,
      }}
    >
      <div
        className="rounded-xl overflow-hidden text-left border"
        style={{
          backgroundColor: 'rgba(24, 24, 27, 0.97)',
          borderColor: 'rgba(82, 82, 91, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow:
            '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="flex items-start justify-between gap-3 px-3 pt-2.5 pb-2 border-b border-zinc-800/60">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleSpeak}
              className="w-6 h-6 rounded-full bg-indigo-500/15 hover:bg-indigo-500/25 ring-1 ring-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0 transition-colors"
              title="Reproducir pronunciación"
            >
              <Volume2 size={11} />
            </button>
            <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
              <span className="text-white font-semibold text-sm leading-tight normal-case">{meta.token || token}</span>
              {isPhrasal && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-sky-300 bg-sky-500/10 ring-1 ring-sky-500/25 px-1 py-px rounded shrink-0">
                  Phrasal
                </span>
              )}
              {isMWE && !isPhrasal && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/25 px-1 py-px rounded shrink-0">
                  MWE
                </span>
              )}
              {isUnknown && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-700/40 ring-1 ring-zinc-600/40 px-1 py-px rounded shrink-0">
                  Sin dicc.
                </span>
              )}
              {isMastered && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-700/40 ring-1 ring-zinc-600/40 px-1 py-px rounded shrink-0">
                  Dominada
                </span>
              )}
              {lemma && lemma !== token.toLowerCase() && (
                <span className="text-[10px] text-zinc-400 normal-case" title={`Forma base: ${lemma}`}>
                  → {lemma}
                </span>
              )}
              {meta.level && (
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider ring-1 px-1 py-px rounded shrink-0 ${levelClasses(meta.level)}`}
                  title={`Nivel CEFR ${meta.level.toUpperCase()}`}
                >
                  {meta.level.toUpperCase()}
                </span>
              )}
              {isSaved && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/25 px-1 py-px rounded shrink-0">
                  <Check size={9} strokeWidth={3} /> En tu mazo
                </span>
              )}
            </div>
          </div>
          {meta.phonetic && (
            <span className="font-mono text-[11px] text-zinc-300 bg-zinc-800/70 px-1.5 py-0.5 rounded shrink-0 leading-tight normal-case">
              {meta.phonetic}
            </span>
          )}
        </div>

        <div className="px-3 py-2 space-y-1.5">
          {/* Wave 1+2 — translation. */}
          {resolved.remoteLoading && !meta.translation ? (
            <SkeletonLine width="70%" />
          ) : (
            <div className="text-[13px] text-white leading-snug normal-case">
              {meta.translation || '—'}
            </div>
          )}
          {meta.bilingual && meta.bilingual !== meta.translation && (
            <div className="text-[11px] text-zinc-400 leading-snug normal-case">{meta.bilingual}</div>
          )}
          {meta.monolingual && (
            <div className="text-[11px] text-zinc-400 italic leading-snug border-l-2 border-zinc-700 pl-2 mt-1.5 normal-case">
              "{meta.monolingual}"
            </div>
          )}
          {meta.examples && meta.examples.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {meta.examples.slice(0, 2).map((ex, i) => (
                <div
                  key={i}
                  className="text-[11px] text-zinc-300/90 leading-snug normal-case border-l-2 border-amber-700/40 pl-2"
                >
                  {ex}
                </div>
              ))}
            </div>
          )}
          {resolved.remoteError && !meta.translation && (
            <div className="text-[10px] text-rose-300/80 normal-case">
              No se pudo traducir: {resolved.remoteError}
            </div>
          )}
          {/* Provider attribution — same pattern Trancy/Language Reactor use.
              Helps the user understand whether they're seeing a dictionary
              entry, a free-tier API response, or a premium one. */}
          {(resolved.source || meta.source) && (
            <div className="text-[9px] uppercase tracking-wider text-zinc-500 normal-case pt-0.5">
              <span className="text-zinc-600">via </span>
              {formatSource(resolved.source ?? meta.source ?? null)}
            </div>
          )}
        </div>

        {/* Wave 3 — AI enrichment (synonyms / collocations / register). */}
        {(includeAi && (resolved.aiLoading || resolved.ai || resolved.aiError)) && (
          <div className="px-3 pb-2 pt-1 border-t border-zinc-800/60 space-y-1">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-fuchsia-300/90 font-semibold">
              <Sparkles size={9} /> IA
              {resolved.ai?.cached && (
                <span className="text-[9px] text-zinc-500 normal-case">(caché)</span>
              )}
            </div>
            {resolved.aiLoading && !resolved.ai && (
              <>
                <SkeletonLine width="90%" />
                <SkeletonLine width="60%" />
              </>
            )}
            {resolved.ai && (
              <div className="space-y-1 text-[11px] text-zinc-300 normal-case">
                {resolved.ai.synonyms.length > 0 && (
                  <div>
                    <span className="text-zinc-500">Sinónimos: </span>
                    {resolved.ai.synonyms.join(', ')}
                  </div>
                )}
                {resolved.ai.collocations.length > 0 && (
                  <div>
                    <span className="text-zinc-500">Colocaciones: </span>
                    {resolved.ai.collocations.join(', ')}
                  </div>
                )}
                {resolved.ai.nuancedTranslation && (
                  <div>
                    <span className="text-zinc-500">Matiz: </span>
                    {resolved.ai.nuancedTranslation}
                  </div>
                )}
                {resolved.ai.register && (
                  <div>
                    <span className="text-zinc-500">Registro: </span>
                    {resolved.ai.register}
                  </div>
                )}
              </div>
            )}
            {resolved.aiError && !resolved.ai && (
              <div className="text-[10px] text-rose-300/80 normal-case">
                IA falló: {resolved.aiError}
              </div>
            )}
          </div>
        )}

        {isMWE && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-indigo-300 bg-zinc-900/60 border-t border-zinc-800/60 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <ChevronsLeftRight size={10} />
              <span className="normal-case">{isExpanded ? 'Unir como expresión' : 'Ver palabras por separado'}</span>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-zinc-500 normal-case">
              <span>o</span>
              <kbd className="font-sans font-semibold text-[9px] text-zinc-400 bg-zinc-800/80 border border-zinc-700 rounded px-1 py-px">scroll</kbd>
            </span>
          </button>
        )}

        {parentMWE && !isMWE && (
          <button
            onClick={(e) => { e.stopPropagation(); onRejoinParent(parentMWE); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border-t border-amber-500/20 transition-colors"
          >
            <Link2 size={10} />
            <span className="normal-case">Unir con "{parentMWE}"</span>
          </button>
        )}

        <div className="flex items-stretch border-t border-zinc-800/60 bg-zinc-900/40">
          <PopoverAction
            icon={<BookOpen size={11} />}
            label="Definir"
            href={defineUrl}
            title="Abrir en Cambridge / WordReference"
          />
          <PopoverDivider />
          <PopoverAction
            icon={<Search size={11} />}
            label="Buscar"
            href={searchUrl}
            title="Buscar en Google con la frase"
          />
          <PopoverDivider />
          {isSaved ? (
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors normal-case"
              title="Esta tarjeta ya está en tu mazo"
            >
              <Eye size={12} /> Ver en Anki
            </button>
          ) : (
            <button
              onClick={(e) => onSave(e, meta.token || token)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors normal-case"
            >
              <Plus size={12} /> Guardar
            </button>
          )}
        </div>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-zinc-900/95 border-r border-b border-zinc-700/60" />
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className="h-3 rounded bg-zinc-700/60 animate-pulse"
      style={{ width }}
    />
  );
}

function PopoverAction({
  icon,
  label,
  href,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  title?: string;
}) {
  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (href) {
      // Open the reference in a new tab — we deliberately don't use
      // window.open in noopener mode because some hosts intercept that.
      // chrome.tabs.create would be cleaner but it's not available from a
      // content script, so the anchor href + target=_blank fallback below
      // is the safest path.
      const w = window.open(href, '_blank', 'noopener,noreferrer');
      if (!w) {
        // Pop-up blocker bit us — swap to location for a same-tab nav.
        window.location.href = href;
      }
    }
  };
  return (
    <button
      onClick={handle}
      title={title}
      className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800/50 transition-colors"
    >
      {icon}{label}
    </button>
  );
}

function PopoverDivider() {
  return <div className="w-px bg-zinc-800/80" />;
}

/**
 * Human-readable provider label for the popover footer.
 * Keeps marketing-y names short so they fit on one line.
 */
function formatSource(source: string | null): string {
  if (!source) return '\u2014';
  // Yomitan packs come in as "pack:<title>" so we can show the pack name
  // without colliding with the named providers.
  if (source.startsWith('pack:')) {
    const title = source.slice(5).trim();
    return title ? `Pack: ${title}` : 'Pack';
  }
  switch (source) {
    case 'dictionary':
      return 'Diccionario offline';
    case 'cache':
      return 'Caché';
    case 'mymemory':
      return 'MyMemory (free)';
    case 'lingva':
      return 'Lingva (free)';
    case 'libretranslate':
      return 'LibreTranslate';
    case 'deepl':
      return 'DeepL';
    case 'google':
      return 'Google Translate';
    case 'chain':
      return 'Cadena';
    case 'offline':
      return 'Offline';
    default:
      return source;
  }
}
