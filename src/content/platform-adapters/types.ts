export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
  language: string;
  /**
   * Optional horizontal alignment hint extracted from the platform's cue
   * (VTT `align:start` setting, TTML `tts:textAlign`, or the WebVTT
   * `TextTrackCue.align` enum on `<track>` elements). Honoured by the
   * overlay when the user enables "keepNativeAlignment". Adapters that
   * cannot extract an alignment leave this `undefined`, in which case the
   * overlay falls back to its centered default.
   */
  align?: 'start' | 'center' | 'end' | 'left' | 'right';
}

export type CueListener = (cues: SubtitleCue[]) => void;

export interface SubtitleSource {
  platform: 'netflix' | 'youtube' | 'disney' | 'hbo' | 'prime' | 'generic';

  onCueChange(listener: CueListener): void;
  getCurrentTime(): number;
  getActiveCue(): SubtitleCue | null;
  seek(timeMs: number): void;

  hideNativeSubtitles(): void;
  showNativeSubtitles(): void;

  /**
   * Pick the cue overlapping `timeMs` for an *alternate* language track
   * (e.g. native Spanish track running parallel to the active English
   * captions). Returns `null` when no such track has been intercepted or
   * when no cue overlaps the requested time. The text comes from the
   * platform's own translators — preferred over MT.
   */
  getAltCueAt?(timeMs: number, lang: string): SubtitleCue | null;

  /** List of alternate languages currently known to the adapter. */
  getAvailableAltLanguages?(): string[];
}
