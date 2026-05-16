/**
 * Per-platform CSS for the "Limpieza visual" toggles in Settings:
 *  - `hideUI`     → hide chrome (controls, top bar, hover scrim).
 *  - `hideShadows` → hide the gradient overlays players draw on top/bottom of
 *                    the video to make their UI readable. These re-appear on
 *                    pointermove and are the "sombra cuando se pasa el mouse"
 *                    the user reports on HBO Max.
 *
 * Selectors are intentionally broad — players ship class-name suffix hashes
 * on every release, so we anchor on stable substrings and `data-testid`s.
 * Kivara's UI is inside Shadow DOM, so the broad selectors can't reach it.
 */
import type { SubtitleSource } from '../platform-adapters/types';

type Platform = SubtitleSource['platform'] | 'generic';

interface PlatformRules {
  hideUI: string[];
  hideShadows: string[];
}

const COMMON_HIDE_UI = [
  '[data-testid*="player-controls" i]',
  '[data-testid*="player-overlay" i]',
];

const COMMON_HIDE_SHADOWS = [
  '[class*="Gradient" i]',
  '[class*="gradient-overlay" i]',
  '[class*="ScrimOverlay" i]',
  '[class*="scrim" i]',
  '[class*="vignette" i]',
];

const RULES: Record<Platform, PlatformRules> = {
  youtube: {
    hideUI: [
      '.ytp-chrome-top',
      '.ytp-chrome-bottom',
      '.ytp-gradient-top',
      '.ytp-gradient-bottom',
      '.ytp-pause-overlay',
      '.ytp-ce-element',
      '.ytp-iv-player-content',
      '.ytp-suggested-action',
    ],
    hideShadows: [
      '.ytp-gradient-top',
      '.ytp-gradient-bottom',
      '.ytp-shadow-content',
    ],
  },
  netflix: {
    hideUI: [
      '[data-uia="player-controls"]',
      '[data-uia="watch-video-bottom-controls"]',
      '.PlayerControlsNeo__bottom-controls',
      '.PlayerControlsNeo__top-controls',
      '.watch-video--bottom-controls-container',
    ],
    hideShadows: [
      '.watch-video--bottom-gradient',
      '.watch-video--top-gradient',
      '[class*="Gradient" i][class*="player" i]',
    ],
  },
  disney: {
    hideUI: [
      '.controls__container',
      '.controls__wrap',
      '.controls__bg-overlay',
      '.controls-bottom-wrap',
      '.controls-top-wrap',
    ],
    hideShadows: [
      '.controls__bg-overlay',
      '[class*="gradient" i][class*="controls" i]',
    ],
  },
  hbo: {
    // Max's player is a styled-components tree under `Fuse-Web-Play`. Inspecting
    // a live session yields containers like `ControlsContainer-Fuse-Web-Play`,
    // `ControlsHeader-...`, `ControlsCenter-...`, `ControlsFooter-...`, plus the
    // `AutohiderContainer` that wraps the chrome and fades in/out on pointer
    // move. Anchoring on the stable `Controls*` / `Autohider` substrings is
    // resilient across releases.
    hideUI: [
      // Generic testid-style fallbacks (older Max builds expose these).
      '[data-testid="player-overlay"]',
      '[data-testid="player-controls"]',
      '[data-testid="controls-container"]',
      // Current Max/HBO chrome containers.
      '[class*="ControlsContainer"]',
      '[class*="ControlsHeader"]',
      '[class*="ControlsCenter"]',
      '[class*="ControlsCenterInfoContainer"]',
      '[class*="ControlsFooter"]',
      '[class*="ControlsFooterTop"]',
      '[class*="ControlsFooterBottom"]',
      '[class*="AutohiderContainer"]',
      '[class*="OverlayContainer-Fuse-Web-Play"]',
      '[class*="OverlayRootContainer"]',
      '[class*="LayerContainer"]',
      '[class*="PlayerDrawer"]',
      '[class*="PlayerButton"]',
      '[class*="ScrubberContainer"]',
      '[class*="ScrubberInput"]',
      '[class*="ScrubberTime"]',
      '[class*="ScrubberTopInfo"]',
      '[class*="BottomTrinity"]',
      '[class*="CenterTrinity"]',
      '[class*="CastTrinity"]',
      '[class*="CastContainer"]',
      '[class*="DiscoveryTabsContainer"]',
      '[class*="ContentDiscoveryContainer"]',
      // Older variant names kept for safety.
      '[class*="PlayerControls"]',
      '[class*="player-controls"]',
      '[class*="ControlsOverlay"]',
      '[class*="controls-overlay"]',
      '[class*="ControlBar"]',
      '[class*="control-bar"]',
      '[class*="TopBar"][class*="player" i]',
    ],
    hideShadows: [
      '[class*="TopGradient"]',
      '[class*="BottomGradient"]',
      '[class*="ControlsCenterGradient"]',
      '[class*="Gradient"]',
      '[class*="gradient"]',
      '[class*="Scrim"]',
      '[class*="scrim"]',
      '[class*="Vignette"]',
      '[class*="vignette"]',
      '[class*="HoverOverlay"]',
      '[class*="hover-overlay"]',
      '[class*="ProtectionLayerContainer"]',
    ],
  },
  prime: {
    hideUI: [
      '.atvwebplayersdk-overlays-container',
      '.atvwebplayersdk-bottompanel-container',
      '.atvwebplayersdk-toppanel-container',
      '.atvwebplayersdk-hideabletopbuttons-container',
    ],
    hideShadows: [
      '.atvwebplayersdk-gradient',
      '[class*="atvwebplayersdk"][class*="gradient" i]',
    ],
  },
  generic: { hideUI: [], hideShadows: [] },
};

interface BuildOpts {
  hideUI: boolean;
  hideShadows: boolean;
  platform?: SubtitleSource['platform'];
}

export function buildCleanupCss({ hideUI, hideShadows, platform }: BuildOpts): string {
  if (!hideUI && !hideShadows) return '';

  const rules = RULES[platform ?? 'generic'] ?? RULES.generic;
  const selectors: string[] = [];

  if (hideUI) {
    selectors.push(...rules.hideUI, ...COMMON_HIDE_UI);
  }
  if (hideShadows) {
    selectors.push(...rules.hideShadows, ...COMMON_HIDE_SHADOWS);
  }
  if (selectors.length === 0) return '';

  // Combine `display: none` with the visibility/opacity overrides so we cover
  // both static chrome (which would otherwise still take layout space) and
  // styled-components animated overlays that re-assert `opacity: 1` via
  // `style=""` on every pointermove. `!important` beats inline styles at the
  // same specificity tier.
  return `${Array.from(new Set(selectors)).join(',\n')} {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    background: transparent !important;
  }`;
}

/**
 * Injects (or removes) a cleanup `<style>` element keyed off `platform`. Idempotent.
 */
export function applyCleanupCss(opts: BuildOpts): void {
  const id = `kivara-cleanup-${opts.platform ?? 'generic'}`;
  const existing = document.getElementById(id) as HTMLStyleElement | null;
  const css = buildCleanupCss(opts);
  if (!css) {
    existing?.remove();
    return;
  }
  const style = existing ?? document.createElement('style');
  style.id = id;
  style.textContent = css;
  if (!existing) document.documentElement.appendChild(style);
}
