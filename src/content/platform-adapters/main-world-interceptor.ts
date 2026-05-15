/**
 * MAIN-world subtitle interceptor.
 *
 * Runs at `document_start` in the page's main world (via the second
 * content_scripts entry in manifest.json with `"world": "MAIN"`). Patches
 * `window.fetch` and `XMLHttpRequest` so that every response that looks like
 * a subtitle file (WebVTT / TTML / DFXP) gets parsed and the resulting cues
 * are forwarded to the ISOLATED-world content script via
 * `window.postMessage`.
 *
 * Why MAIN world: streaming sites enforce strict CSP that blocks
 * `<script src=...>` injection, and the player calls live in the page's own
 * realm. Manifest-declared MAIN content scripts bypass CSP at the runtime
 * level (Chrome 102+).
 */
import { parseAny } from './parsers';

const TAG = '[Kivara Lingo / MAIN]';
const EVENT = 'kivara-lingo:subtitle-track';

declare global {
  interface Window {
    __KIVARA_MAIN_INSTALLED?: boolean;
  }
}

(() => {
  if (window.__KIVARA_MAIN_INSTALLED) return;
  window.__KIVARA_MAIN_INSTALLED = true;

  const matchers: Array<(url: string) => boolean> = [
    // Netflix TTML/DFXP
    (url) =>
      /nflxvideo\.net/i.test(url) &&
      (/[?&]o=\d/.test(url) || /\.dfxp(\?|$)/i.test(url) || /\.xml(\?|$)/i.test(url)),
    // Disney+ WebVTT
    (url) => /disneyplus\.com/i.test(url) && /\.vtt(\?|$)/i.test(url),
    (url) => /\.bamgrid\.com/i.test(url) && /\.vtt(\?|$)/i.test(url),
    // HBO Max / Max WebVTT
    (url) => /(hbomax|max)\.com/i.test(url) && /\.vtt(\?|$)/i.test(url),
    // Prime Video TTML/DFXP — often hosted on cloudfront
    (url) => /cloudfront\.net/i.test(url) && /\.dfxp(\?|$)/i.test(url),
    (url) => /(media-amazon|primevideo)\.com/i.test(url) && /\.(xml|dfxp|ttml)(\?|$)/i.test(url),
    // Generic catch-all for any .vtt/.ttml served from the current page origin
    (url) => /\.(vtt|ttml)(\?|$)/i.test(url),
  ];

  function isSubtitleUrl(url: string): boolean {
    try {
      return matchers.some((m) => m(url));
    } catch {
      return false;
    }
  }

  function postCues(url: string, body: string) {
    try {
      const cues = parseAny(url, body);
      if (!cues.length) return;
      window.postMessage(
        {
          source: EVENT,
          url,
          cues,
        },
        '*',
      );
    } catch (err) {
      console.warn(TAG, 'parse failed for', url, err);
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url || (args[0] as URL).href || '';
      if (url && isSubtitleUrl(url)) {
        response
          .clone()
          .text()
          .then((body) => postCues(url, body))
          .catch(() => {});
      }
    } catch (err) {
      console.warn(TAG, 'fetch wrap failed', err);
    }
    return response;
  };

  const OrigXHR = window.XMLHttpRequest;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function PatchedXHR(this: any) {
    const xhr = new OrigXHR();
    let interceptUrl: string | null = null;
    const origOpen = xhr.open;
    xhr.open = function (method: string, url: string | URL, async_?: boolean, username?: string | null, password?: string | null) {
      try {
        const u = typeof url === 'string' ? url : url.href;
        if (isSubtitleUrl(u)) interceptUrl = u;
      } catch {
        // ignore
      }
      return origOpen.call(this, method, url as string, async_ ?? true, username ?? null, password ?? null);
    };
    xhr.addEventListener('load', () => {
      if (!interceptUrl) return;
      try {
        const body =
          typeof xhr.responseText === 'string'
            ? xhr.responseText
            : xhr.response && typeof xhr.response === 'string'
              ? xhr.response
              : '';
        if (body) postCues(interceptUrl, body);
      } catch (err) {
        console.warn(TAG, 'XHR load handler failed', err);
      }
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).XMLHttpRequest = PatchedXHR;

  console.log(TAG, 'fetch / XHR interception installed');
})();
