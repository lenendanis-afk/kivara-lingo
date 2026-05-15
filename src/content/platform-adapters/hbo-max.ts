/**
 * HBO Max / Max adapter.
 *
 * Max uses an HLS player that pulls external WebVTT segments. The
 * MAIN-world interceptor catches `.vtt` GETs; this adapter focuses on
 * anchoring the overlay over the player and hiding the native captions.
 */
import { createInterceptedAdapter } from './intercepted-adapter';
import type { SubtitleSource } from './types';

const HIDE_NATIVE_CSS = `
  video::cue,
  video::-webkit-media-text-track-display,
  video::-webkit-media-text-track-container,
  [class*="SubtitleRenderer"],
  [class*="subtitleRenderer"],
  [data-testid="captions-container"] { display: none !important; }
`;

export function createHboMaxAdapter(): SubtitleSource {
  return createInterceptedAdapter({
    platform: 'hbo',
    language: 'en',
    hideNativeCss: HIDE_NATIVE_CSS,
    getVideo: () => document.querySelector<HTMLVideoElement>('video'),
  });
}
