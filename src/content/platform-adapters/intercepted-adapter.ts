/**
 * Generic adapter factory used by all streaming platforms that ship subtitles
 * over network requests (Netflix, Disney+, HBO Max, Prime Video). Each
 * platform supplies its `platform` tag, `language`, video selector and the
 * CSS used to hide the native subtitles. The cue data itself comes from the
 * MAIN-world interceptor via `intercepted-bus`.
 */
import { onTrack, type InterceptedTrack } from './intercepted-bus';
import type { CueListener, SubtitleCue, SubtitleSource } from './types';

export interface InterceptedAdapterOptions {
  platform: SubtitleSource['platform'];
  /** BCP-47 language tag for cues (best-guess; Phase 3: parse from manifest) */
  language: string;
  /** CSS to inject in document head to hide the native subtitle layer */
  hideNativeCss?: string;
  /** Optional callback for adapter-specific setup */
  onMount?(): void;
  /** Override to find the active video element */
  getVideo?(): HTMLVideoElement | null;
}

function injectStyle(id: string, css: string): HTMLStyleElement | null {
  if (!css) return null;
  if (document.getElementById(id)) return document.getElementById(id) as HTMLStyleElement;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.documentElement.appendChild(style);
  return style;
}

export function createInterceptedAdapter(opts: InterceptedAdapterOptions): SubtitleSource {
  const listeners: CueListener[] = [];
  let track: InterceptedTrack | null = null;
  let activeCue: SubtitleCue | null = null;
  let lastEmittedId: string | null = null;
  let hideStyle: HTMLStyleElement | null = null;
  let lastVideo: HTMLVideoElement | null = null;
  let pollHandle: number | null = null;

  function getVideo(): HTMLVideoElement | null {
    if (opts.getVideo) return opts.getVideo();
    return document.querySelector<HTMLVideoElement>('video');
  }

  function pickCueAt(timeMs: number): SubtitleCue | null {
    if (!track) return null;
    const hit = track.cues.find((c) => timeMs >= c.start && timeMs <= c.end);
    if (!hit) return null;
    return {
      id: `${opts.platform}-${hit.start}-${hit.end}`,
      start: hit.start,
      end: hit.end,
      text: hit.text,
      language: opts.language,
    };
  }

  function tick() {
    const video = getVideo();
    if (video) lastVideo = video;
    if (!video || !track) {
      if (activeCue !== null) {
        activeCue = null;
        lastEmittedId = null;
        listeners.forEach((l) => l([]));
      }
      return;
    }
    const cue = pickCueAt(video.currentTime * 1000);
    if (cue?.id !== lastEmittedId) {
      activeCue = cue;
      lastEmittedId = cue?.id ?? null;
      listeners.forEach((l) => l(cue ? [cue] : []));
    }
  }

  function startPolling() {
    if (pollHandle != null) return;
    pollHandle = window.setInterval(tick, 100);
  }

  function stopPolling() {
    if (pollHandle != null) {
      window.clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  // Subscribe to intercepted tracks (replays last one if already seen)
  onTrack((next) => {
    track = next;
    tick();
    startPolling();
  });

  // Start polling regardless — the next track may arrive at any time
  startPolling();

  if (opts.hideNativeCss) {
    hideStyle = injectStyle(`kivara-hide-native-${opts.platform}`, opts.hideNativeCss);
  }

  try {
    opts.onMount?.();
  } catch (err) {
    console.warn('[Kivara Lingo] adapter onMount threw', err);
  }

  return {
    platform: opts.platform,
    onCueChange(listener) {
      listeners.push(listener);
    },
    getCurrentTime() {
      const v = getVideo() ?? lastVideo;
      return (v?.currentTime ?? 0) * 1000;
    },
    getActiveCue() {
      return activeCue;
    },
    seek(timeMs) {
      const v = getVideo() ?? lastVideo;
      if (v) v.currentTime = timeMs / 1000;
    },
    hideNativeSubtitles() {
      if (opts.hideNativeCss && !hideStyle) {
        hideStyle = injectStyle(`kivara-hide-native-${opts.platform}`, opts.hideNativeCss);
      }
    },
    showNativeSubtitles() {
      if (hideStyle) {
        hideStyle.remove();
        hideStyle = null;
      }
      stopPolling();
    },
  };
}
