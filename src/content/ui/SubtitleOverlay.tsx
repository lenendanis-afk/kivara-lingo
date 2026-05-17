import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { sendMessage } from 'webext-bridge/content-script';
import { Volume1, Copy, Check, Quote, AudioLines, Camera } from 'lucide-react';
import type { SubtitleStyles, Mode, TranslateResponse } from '../../shared/types';
import { tokenizeSentence } from '../nlp/tokenize';
import { lookupDictionary } from '../nlp/dictionary';
import { useKivaraStore } from '../../shared/store';
import { WordPopover } from './WordPopover';

export interface SubtitleOverlayProps {
  subtitleStyles: SubtitleStyles;
  cue: {
    id?: string;
    text: string;
    start?: number;
    end?: number;
    language?: string;
    align?: 'start' | 'center' | 'end' | 'left' | 'right';
  } | null;
  /**
   * Native-language alt cue running in parallel to the source caption — e.g.
   * the platform's official Spanish subtitle track when the source is
   * English. Preferred as the dual-caption source over MT.
   */
  altCue?: {
    id?: string;
    text: string;
    start?: number;
    end?: number;
    language?: string;
    align?: 'start' | 'center' | 'end' | 'left' | 'right';
  } | null;
  mode: Mode;
  saveRequestKey?: number | null;
  onSaveCard: (token: string | undefined, sentence: string) => void;
  onTokenHoverChange?: (hovered: boolean) => void;
}

/**
 * Renders the Kivara subtitle layer over a real platform video. The layer is
 * positioned absolutely inside the platform's video container (passed via the
 * Shadow DOM portal in App.tsx).
 */
export function SubtitleOverlay({
  subtitleStyles,
  cue,
  altCue,
  mode,
  saveRequestKey,
  onSaveCard,
  onTokenHoverChange,
}: SubtitleOverlayProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [captureState, setCaptureState] = useState<'idle' | 'screenshot' | 'audio'>('idle');
  // Identifier of the currently hovered token. Encoded as `${lineIdx}:${tokIdx}`
  // so two occurrences of the same word in a single cue ("how's this, how's
  // that") light up independently — previously the overlay tracked the
  // token's dictionary key, which collides when the same word appears twice.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedMWEs, setExpandedMWEs] = useState<Set<string>>(new Set());
  const [altExpandedKey, setAltExpandedKey] = useState<string | null>(null);
  const [savedTokens, setSavedTokens] = useState<Set<string>>(new Set());

  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the *dictionary key* of the currently hovered token so the Alt /
  // Ctrl+S handlers can act on the actual word/MWE. Kept in sync with
  // hoveredId, but never used to drive React render — the index is the only
  // identity for highlighting.
  const hoveredKeyRef = useRef<string | null>(null);

  // Notify parent (App) so it can pause/resume the underlying <video>. We
  // pause whenever ANY part of the subtitle box is hovered — not just when a
  // dictionary token gets focus — so "hover sobre el subtítulo" pauses the
  // video even on platforms (e.g. YouTube) where most tokens are tagged
  // `unknown` and don't fire `handleTokenEnter`.
  useEffect(() => {
    onTokenHoverChange?.(isHovered || hoveredId !== null);
  }, [isHovered, hoveredId, onTokenHoverChange]);

  useEffect(() => {
    // We only handle the Alt key when it would do something useful — i.e.,
    // the user is currently hovering a phrase-MWE token and wants to expand
    // it. In every other case we let Alt pass through so the platform
    // (Alt+Tab, browser menu activation, Alt+arrow seek shortcuts, etc.)
    // keeps working. Previously we blanket-prevented every Alt keypress.
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      const hk = hoveredKeyRef.current;
      if (!hk || lookupDictionary(hk)?.type !== 'phrase') return;
      e.preventDefault();
      setAltExpandedKey(hk);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      // Only swallow the keyup when we're actually closing the expansion —
      // otherwise let the platform see the release (some players bind Alt
      // for momentary actions).
      setAltExpandedKey((prev) => {
        if (prev !== null) e.preventDefault();
        return null;
      });
    };
    const blur = () => setAltExpandedKey(null);
    const visibility = () => {
      if (document.hidden) setAltExpandedKey(null);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const effectiveExpanded = useMemo(() => {
    if (!altExpandedKey) return expandedMWEs;
    const next = new Set(expandedMWEs);
    next.add(altExpandedKey);
    return next;
  }, [expandedMWEs, altExpandedKey]);

  const targetSentence = cue?.text ?? '';
  const cueLanguage = cue?.language ?? 'en';
  const includeAi = useKivaraStore(
    (s) => s.ai.provider !== 'disabled' && !!s.ai.apiKey && s.ai.enrichOnHover,
  );
  const showDualSubtitle = useKivaraStore((s) => s.translate.showDualSubtitle);
  const nativeLanguage = useKivaraStore((s) => s.translate.targetLanguage || 'es');

  // Dual caption priority chain:
  //   1. Native-language alt cue from the platform's own subtitle track
  //      (`altCue` prop, supplied by App.tsx polling the adapter). This is
  //      the highest quality source — zero latency, free, human-quality
  //      translation, already timed to the source cue.
  //   2. Remote MT (DeepL / Google / MyMemory / Lingva / offline chain) of
  //      the whole source sentence, cached in IndexedDB so re-displaying
  //      the same cue is instant after the first call.
  //   3. Nothing — source language already equals target, or both options
  //      returned empty.
  const nativeAltText = altCue?.text?.trim() || null;
  const [translatedSentence, setTranslatedSentence] = useState<string | null>(null);
  useEffect(() => {
    if (!showDualSubtitle) {
      setTranslatedSentence(null);
      return;
    }
    const src = targetSentence.trim();
    if (!src) {
      setTranslatedSentence(null);
      return;
    }
    // Skip if source language equals target language (no-op).
    if ((cueLanguage || 'en').slice(0, 2) === nativeLanguage.slice(0, 2)) {
      setTranslatedSentence(null);
      return;
    }
    // The platform already shipped a native translation — use it directly
    // and skip the round-trip to the MT provider.
    if (nativeAltText) {
      setTranslatedSentence(null);
      return;
    }
    let cancelled = false;
    setTranslatedSentence(null);
    const t = setTimeout(() => {
      sendMessage(
        'TRANSLATE',
        { text: src, sourceLang: cueLanguage || 'en', targetLang: nativeLanguage },
        'background',
      )
        .then((res) => {
          if (cancelled) return;
          const r = res as TranslateResponse;
          if (r?.ok && r.translatedText && r.translatedText.trim() !== src) {
            setTranslatedSentence(r.translatedText);
          }
        })
        .catch(() => {
          /* network errors are non-fatal — just hide the second line */
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [targetSentence, cueLanguage, nativeLanguage, showDualSubtitle, nativeAltText]);

  // Final string shown on the bilingual line.
  const dualCaptionText = nativeAltText ?? translatedSentence;
  // Tag the bilingual line so the user can tell at a glance whether it came
  // from the platform or from MT — useful when debugging quality issues.
  const dualCaptionSource: 'native' | 'mt' | null = nativeAltText
    ? 'native'
    : translatedSentence
      ? 'mt'
      : null;

  // Split the cue into rendered lines. When the user opts into "mantener
  // saltos de línea nativos" we honour every `\n` in the cue text; otherwise
  // we collapse them so the overlay's own word-wrap stays in charge.
  const lines = useMemo(() => {
    const src = targetSentence;
    if (subtitleStyles.keepNativeLineBreaks) {
      const parts = src.split(/\r?\n/);
      // Drop trailing empty line if the cue ends with `\n`.
      while (parts.length > 1 && parts[parts.length - 1].trim() === '') {
        parts.pop();
      }
      return parts.length > 0 ? parts : [src];
    }
    return [src.replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ')];
  }, [targetSentence, subtitleStyles.keepNativeLineBreaks]);

  const lineTokens = useMemo(
    () => lines.map((line) => tokenizeSentence(line, effectiveExpanded, cueLanguage)),
    [lines, effectiveExpanded, cueLanguage],
  );

  // Reset cue-scoped UI state whenever the cue changes.
  useEffect(() => {
    setHoveredId(null);
    hoveredKeyRef.current = null;
    setAltExpandedKey(null);
  }, [cue?.id]);

  const handleTokenEnter = (id: string, key: string) => {
    if (wordHoverTimeout.current) clearTimeout(wordHoverTimeout.current);
    setHoveredId(id);
    hoveredKeyRef.current = key;
  };
  const handleTokenLeave = () => {
    wordHoverTimeout.current = setTimeout(() => {
      setHoveredId(null);
      hoveredKeyRef.current = null;
    }, 180);
  };

  const toggleExpandMWE = (key: string) => {
    setExpandedMWEs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setHoveredId(null);
    hoveredKeyRef.current = null;
  };

  const findParentMWE = (wordKey: string): string | null => {
    for (const phrase of expandedMWEs) {
      if (phrase.split(' ').includes(wordKey.toLowerCase())) return phrase;
    }
    return null;
  };

  const handleSaveToken = useCallback(
    (token: string) => {
      setCaptureState('screenshot');
      window.setTimeout(() => {
        setCaptureState('audio');
        window.setTimeout(() => setCaptureState('idle'), 900);
      }, 220);
      onSaveCard(token, targetSentence);
      setSavedTokens((prev) => new Set(prev).add(token.toLowerCase()));
    },
    [onSaveCard, targetSentence],
  );

  // Respond to Ctrl+S / external save requests.
  useEffect(() => {
    if (saveRequestKey == null) return;
    const key = hoveredKeyRef.current;
    if (key) {
      const dictionary = lookupDictionary(key, cueLanguage);
      const tokenText = dictionary?.token ?? key;
      handleSaveToken(tokenText);
    } else if (targetSentence) {
      handleSaveToken(targetSentence);
    }
  }, [saveRequestKey, cueLanguage, handleSaveToken, targetSentence]);

  const handleMouseEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setIsHovered(true);
  };
  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => setIsHovered(false), 200);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(targetSentence).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!cue || !targetSentence.trim()) return null;

  const bgOpacity = subtitleStyles.backgroundOpacity / 100;
  const bgColor = subtitleStyles.backgroundColor;

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
      : '0,0,0';
  };
  const backgroundColorWithOpacity = `rgba(${hexToRgb(bgColor)}, ${bgOpacity})`;

  const verticalPercent =
    subtitleStyles.verticalOffset ??
    (subtitleStyles.position === 'top' ? 15 : subtitleStyles.position === 'middle' ? 50 : 85);

  const isReading = mode === 'reading';

  // Honor the cue's `align` setting only when the user opted in. Otherwise
  // (and when the adapter couldn't extract an align hint) we keep the
  // overlay's default centered layout, which is what most viewers expect on
  // any platform.
  const textAlignment: 'left' | 'center' | 'right' = (() => {
    if (!subtitleStyles.keepNativeAlignment) return 'center';
    const a = cue?.align;
    if (a === 'start' || a === 'left') return 'left';
    if (a === 'end' || a === 'right') return 'right';
    return 'center';
  })();
  const flexJustify: 'flex-start' | 'center' | 'flex-end' =
    textAlignment === 'left' ? 'flex-start' : textAlignment === 'right' ? 'flex-end' : 'center';

  return (
    <div
      className="absolute inset-x-0 z-10 flex flex-col items-center px-8 transition-all duration-200"
      style={{
        top: `${verticalPercent}%`,
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
      }}
    >
      <div
        className="relative flex flex-col items-center pointer-events-auto select-text"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-kivara-hover-zone="true"
      >
        <div className="absolute -top-14 w-full h-14 bg-transparent z-0" />

        {!isReading && (
          <div
            className={`absolute -top-12 z-10 flex items-center gap-1 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/60 p-1 rounded-lg shadow-xl transition-all duration-300 transform ${
              isHovered && hoveredId === null ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'
            }`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 px-2">Frase</span>
            <div className="w-px h-3.5 bg-zinc-700/80" />
            <button
              className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-md transition-colors"
              title="Reproducir audio de la frase"
            >
              <Volume1 size={14} />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-md transition-colors"
              title="Copiar texto"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
            <div className="w-px h-3.5 bg-zinc-700/80" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSaveToken(targetSentence);
              }}
              className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium px-2 py-1 rounded transition-colors"
              title="Guardar la frase completa como tarjeta"
            >
              <Quote size={11} /> Guardar frase
            </button>
            <div className="w-px h-3.5 bg-zinc-700/80" />
            <span className="text-[9px] text-zinc-500 px-2 hidden sm:flex items-center gap-1">
              <kbd className="font-sans font-semibold text-[9px] text-zinc-400 bg-zinc-800 border border-zinc-700 rounded px-1 py-px">
                Scroll
              </kbd>
              <span>sobre la expresión para separarla</span>
            </span>
          </div>
        )}

        {!isReading && captureState !== 'idle' && (
          <div className="absolute -top-10 right-0 flex items-center gap-1 bg-zinc-900/95 border border-zinc-700/60 rounded-md px-2 py-1 text-[10px] text-zinc-200 shadow-xl">
            {captureState === 'screenshot' ? <Camera size={11} /> : <AudioLines size={11} />}
            <span>{captureState === 'screenshot' ? 'Capturando frame…' : 'Procesando audio…'}</span>
          </div>
        )}

        <div
          className="rounded-md px-4 py-2 transition-all duration-300"
          style={{
            textAlign: textAlignment,
            fontSize: `${subtitleStyles.fontSize}px`,
            color: subtitleStyles.color,
            backgroundColor: !isReading && isHovered ? 'rgba(0,0,0,0.8)' : backgroundColorWithOpacity,
            fontWeight: subtitleStyles.fontWeight,
            textShadow: (() => {
              const s = subtitleStyles.textShadow;
              if (s <= 0) return 'none';
              const a = (s / 100).toFixed(2);
              const blur = Math.max(2, Math.round(s / 18));
              return `2px 2px ${blur}px rgba(0,0,0,${a}), -1px -1px 0 rgba(0,0,0,${a}), 1px -1px 0 rgba(0,0,0,${a}), -1px 1px 0 rgba(0,0,0,${a}), 1px 1px 0 rgba(0,0,0,${a})`;
            })(),
            transform: !isReading && isHovered ? 'scale(1.05)' : 'scale(1)',
            boxShadow:
              !isReading && isHovered
                ? '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                : 'none',
          }}
        >
          {isReading ? (
            // Reading mode: no popovers, but still respect the
            // "keepNativeLineBreaks" toggle so the visible layout matches
            // interactive mode.
            <div className="flex flex-col" style={{ alignItems: flexJustify }}>
              {lines.map((line, li) => (
                <span key={li}>{line}</span>
              ))}
            </div>
          ) : (
            <>
            <div className="flex flex-col" style={{ alignItems: flexJustify }}>
              {lineTokens.map((tokens, li) => (
                <div key={li} className="block">
                  {tokens.map((tok, i) => {
                    if (tok.kind === 'punct') {
                      return (
                        <React.Fragment key={`${li}:${i}:${tok.key}`}>
                          {tok.text}
                        </React.Fragment>
                      );
                    }
                    // `ignored` tokens render exactly like punct text — no
                    // affordance, no popover, no hover state. This is how the
                    // tokenizer hides auto-classified proper nouns.
                    if (tok.kind === 'ignored') {
                      return (
                        <span key={`${li}:${i}:${tok.key}`} className="opacity-90">
                          {tok.text}
                        </span>
                      );
                    }
                    // `id` is the per-occurrence hover identity. Composite of
                    // line index + token index so two instances of the same
                    // word in a single cue ("how's this, how's that") keep
                    // independent hover/popover state — previously the
                    // overlay keyed off `tok.key` (the lowercased text) and
                    // both occurrences lit up together.
                    const id = `${li}:${i}`;
                    const isTokHovered = hoveredId === id;
                    const isSaved = savedTokens.has(tok.key.toLowerCase());
                    // After the Phase 2 audit we make `unknown` interactive too —
                    // hovering triggers the remote translation chain inside
                    // WordPopover. The visual affordance is much subtler than
                    // known/mwe so it doesn't compete for attention.
                    const isInteractive =
                      tok.kind === 'mwe' ||
                      tok.kind === 'known' ||
                      tok.kind === 'unknown' ||
                      tok.kind === 'mastered';

                    let colorClass: string;
                    if (isTokHovered) {
                      colorClass =
                        'text-white bg-indigo-600 shadow-[0_2px_8px_rgba(99,102,241,0.45)]';
                    } else if (isSaved) {
                      colorClass =
                        'text-emerald-300 border-b-2 border-emerald-400/70 hover:bg-emerald-400/10';
                    } else if (tok.kind === 'mwe' && tok.mweKind === 'phrasal') {
                      // Phrasal verbs use a solid azul underline (distinct from
                      // idiomatic MWEs) to signal they're grammatical units.
                      colorClass =
                        'text-sky-300 border-b-2 border-sky-400 hover:bg-sky-400/15';
                    } else if (tok.kind === 'mwe') {
                      colorClass =
                        'text-amber-300 border-b-2 border-amber-400 border-dotted hover:bg-amber-400/15';
                    } else if (tok.kind === 'known') {
                      colorClass =
                        'border-b border-zinc-300/40 border-dashed hover:text-white hover:bg-white/10';
                    } else if (tok.kind === 'mastered') {
                      colorClass = 'opacity-50 hover:opacity-100 hover:bg-white/5';
                    } else {
                      // unknown — interactive but with the most subtle affordance.
                      colorClass =
                        'opacity-80 hover:opacity-100 hover:bg-white/10 hover:underline hover:decoration-dotted hover:decoration-zinc-400/70 hover:underline-offset-2';
                    }

                    const parentForSplit = tok.kind !== 'mwe' ? findParentMWE(tok.key) : null;
                    const wheelable = tok.kind === 'mwe' || !!parentForSplit;
                    const handleWheel = (e: React.WheelEvent) => {
                      if (!wheelable) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.deltaY > 0 && tok.kind === 'mwe') {
                        setExpandedMWEs((prev) => {
                          const n = new Set(prev);
                          n.add(tok.key);
                          return n;
                        });
                      } else if (e.deltaY < 0 && parentForSplit) {
                        setExpandedMWEs((prev) => {
                          const n = new Set(prev);
                          n.delete(parentForSplit);
                          return n;
                        });
                        setHoveredId(null);
                        hoveredKeyRef.current = null;
                      }
                    };

                    return (
                      <span key={`${li}:${i}:${tok.key}`} className="relative inline-block">
                        <span
                          onMouseEnter={() => isInteractive && handleTokenEnter(id, tok.key)}
                          onMouseLeave={handleTokenLeave}
                          onWheel={handleWheel}
                          className={`relative rounded px-0.5 transition-all duration-150 ${
                            isInteractive ? 'cursor-help' : ''
                          } ${colorClass}`}
                        >
                          {tok.text}
                          {isSaved && !isTokHovered && (
                            <Check size={9} className="inline-block ml-0.5 -mt-1 text-emerald-400" strokeWidth={3} />
                          )}
                        </span>
                        {isTokHovered && isInteractive && (
                          <WordPopover
                            visible={true}
                            onMouseEnter={() => handleTokenEnter(id, tok.key)}
                            onMouseLeave={handleTokenLeave}
                            token={tok.text}
                            sentence={targetSentence}
                            sourceLang={cueLanguage}
                            includeAi={includeAi}
                            kind={tok.kind}
                            mweKind={tok.mweKind}
                            lemma={tok.lemma}
                            isExpanded={expandedMWEs.has(tok.key)}
                            isSaved={isSaved}
                            parentMWE={tok.kind !== 'mwe' ? findParentMWE(tok.key) : null}
                            onToggleExpand={() => toggleExpandMWE(tok.key)}
                            onRejoinParent={(parent) => {
                              setExpandedMWEs((prev) => {
                                const n = new Set(prev);
                                n.delete(parent);
                                return n;
                              });
                              setHoveredId(null);
                              hoveredKeyRef.current = null;
                            }}
                            onSave={(e, token) => {
                              e.stopPropagation();
                              handleSaveToken(token);
                            }}
                          />
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Dual caption — native-language full sentence under the
                source. Lives INSIDE the source plate (same container as
                the English tokens above) so both lines share one rounded
                box, matching the original Figma Make mock. The line
                animates via max-height + opacity so when it's hidden it
                takes ZERO vertical space — fixing the "jump up by a few
                pixels when the bilingual line fades in" bug. Prefers the
                platform's own native track over an MT round-trip; the
                source is exposed via the `title` tooltip. */}
            {showDualSubtitle && dualCaptionText && (
              <div
                data-kivara-hover-zone="true"
                className={`mt-2 transition-all duration-300 ease-out overflow-hidden ${
                  isHovered ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
                }`}
                title={
                  dualCaptionSource === 'native'
                    ? 'Subtítulo nativo de la plataforma'
                    : 'Traducción automática'
                }
                style={{
                  textAlign: textAlignment,
                }}
                aria-hidden={!isHovered}
              >
                <span
                  className="text-zinc-300"
                  style={{
                    // 0.65em from the mock — the bilingual line scales
                    // with the user's source font-size automatically.
                    fontSize: '0.65em',
                    fontWeight: 500,
                    letterSpacing: '0.025em',
                  }}
                >
                  {dualCaptionText}
                </span>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
