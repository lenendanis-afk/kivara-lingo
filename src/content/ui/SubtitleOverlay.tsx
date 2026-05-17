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
  cue: { id?: string; text: string; start?: number; end?: number; language?: string } | null;
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
  mode,
  saveRequestKey,
  onSaveCard,
  onTokenHoverChange,
}: SubtitleOverlayProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [captureState, setCaptureState] = useState<'idle' | 'screenshot' | 'audio'>('idle');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [expandedMWEs, setExpandedMWEs] = useState<Set<string>>(new Set());
  const [altExpandedKey, setAltExpandedKey] = useState<string | null>(null);
  const [savedTokens, setSavedTokens] = useState<Set<string>>(new Set());

  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    hoveredKeyRef.current = hoveredKey;
  }, [hoveredKey]);

  // Notify parent (App) so it can pause/resume the underlying <video>. We
  // pause whenever ANY part of the subtitle box is hovered — not just when a
  // dictionary token gets focus — so "hover sobre el subtítulo" pauses the
  // video even on platforms (e.g. YouTube) where most tokens are tagged
  // `unknown` and don't fire `handleTokenEnter`.
  useEffect(() => {
    onTokenHoverChange?.(isHovered || hoveredKey !== null);
  }, [isHovered, hoveredKey, onTokenHoverChange]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      e.preventDefault();
      const hk = hoveredKeyRef.current;
      if (hk && lookupDictionary(hk)?.type === 'phrase') setAltExpandedKey(hk);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Alt' && e.altKey) return;
      if (e.key === 'Alt') e.preventDefault();
      setAltExpandedKey(null);
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

  // Dual caption — translate the whole cue text to the native language and
  // render it under the source subtitle. The translation is cached by the
  // background's Dexie cache so re-displaying the same cue is instant.
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
  }, [targetSentence, cueLanguage, nativeLanguage, showDualSubtitle]);

  const tokens = useMemo(
    () => tokenizeSentence(targetSentence, effectiveExpanded, cueLanguage),
    [targetSentence, effectiveExpanded, cueLanguage],
  );

  // Reset cue-scoped UI state whenever the cue changes.
  useEffect(() => {
    setHoveredKey(null);
    setAltExpandedKey(null);
  }, [cue?.id]);

  const handleTokenEnter = (key: string) => {
    if (wordHoverTimeout.current) clearTimeout(wordHoverTimeout.current);
    setHoveredKey(key);
  };
  const handleTokenLeave = () => {
    wordHoverTimeout.current = setTimeout(() => setHoveredKey(null), 180);
  };

  const toggleExpandMWE = (key: string) => {
    setExpandedMWEs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setHoveredKey(null);
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
      >
        <div className="absolute -top-14 w-full h-14 bg-transparent z-0" />

        {!isReading && (
          <div
            className={`absolute -top-12 z-10 flex items-center gap-1 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/60 p-1 rounded-lg shadow-xl transition-all duration-300 transform ${
              isHovered && hoveredKey === null ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'
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
          className="text-center rounded-md px-4 py-2 transition-all duration-300"
          style={{
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
            <span>{targetSentence}</span>
          ) : (
            <span>
              {tokens.map((tok, i) => {
                if (tok.kind === 'punct') {
                  return <React.Fragment key={tok.key + i}>{tok.text}</React.Fragment>;
                }
                // `ignored` tokens render exactly like punct text — no
                // affordance, no popover, no hover state. This is how the
                // tokenizer hides auto-classified proper nouns.
                if (tok.kind === 'ignored') {
                  return (
                    <span key={tok.key + i} className="opacity-90">
                      {tok.text}
                    </span>
                  );
                }
                const isTokHovered = hoveredKey === tok.key;
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
                    setHoveredKey(null);
                  }
                };

                return (
                  <span key={tok.key + i} className="relative inline-block">
                    <span
                      onMouseEnter={() => isInteractive && handleTokenEnter(tok.key)}
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
                        onMouseEnter={() => handleTokenEnter(tok.key)}
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
                          setHoveredKey(null);
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
            </span>
          )}
        </div>

        {/* Dual caption — native-language full sentence under the source.
            Renders only when the source language differs from the user's
            native language and the cache/translator returned something
            different from the input. Sits inside the same pointer-events
            container so hovering it also pauses the video, just like the
            source line. */}
        {showDualSubtitle && translatedSentence && !isReading && (
          <div
            className="text-center rounded-md px-4 py-1 mt-1 select-text"
            style={{
              fontSize: `${Math.max(12, subtitleStyles.fontSize - 4)}px`,
              color: '#d4d4d8',
              backgroundColor: backgroundColorWithOpacity,
              fontWeight: 400,
              fontStyle: 'italic',
              textShadow: (() => {
                const s = subtitleStyles.textShadow;
                if (s <= 0) return 'none';
                const a = (s / 100).toFixed(2);
                const blur = Math.max(2, Math.round(s / 18));
                return `2px 2px ${blur}px rgba(0,0,0,${a})`;
              })(),
            }}
          >
            {translatedSentence}
          </div>
        )}
      </div>
    </div>
  );
}
