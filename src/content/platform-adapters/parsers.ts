/**
 * Subtitle parsers (WebVTT, TTML / DFXP). Kept dependency-free so they can
 * run in both the MAIN and ISOLATED worlds.
 *
 * Each parser produces `RawCue[]` — the platform adapter is responsible for
 * tagging with `language` and assigning stable ids.
 */

export interface RawCue {
  start: number;
  end: number;
  text: string;
}

function timeStringToMs(input: string): number {
  // Accepts: HH:MM:SS.mmm | HH:MM:SS,mmm | MM:SS.mmm | SS.mmm | secs ('1.234s') | clock ('00:01:23:12')
  const trimmed = input.trim();
  if (!trimmed) return 0;

  // Plain seconds with optional 's' suffix.
  if (/^[0-9]+(?:\.[0-9]+)?s?$/.test(trimmed)) {
    return Math.round(parseFloat(trimmed) * 1000);
  }

  // SMPTE ticks (not common) — not supported.
  const cleaned = trimmed.replace(',', '.');
  const parts = cleaned.split(':');
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) {
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
    s = parseFloat(parts[2]) || 0;
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10) || 0;
    s = parseFloat(parts[1]) || 0;
  } else {
    s = parseFloat(parts[0]) || 0;
  }
  return Math.round((h * 3600 + m * 60 + s) * 1000);
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parse WebVTT text (e.g. Disney+/HBO Max external subtitle file). */
export function parseWebVTT(input: string): RawCue[] {
  if (!input) return [];
  const lines = input.replace(/\r/g, '').split('\n');
  const cues: RawCue[] = [];
  let i = 0;
  // Skip WEBVTT header (first non-empty line) and any NOTE / STYLE blocks.
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (/^WEBVTT/i.test(line) || /^NOTE/i.test(line) || /^STYLE/i.test(line) || /^REGION/i.test(line)) {
      // Skip until blank line
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }
    break;
  }
  while (i < lines.length) {
    // Optional cue identifier
    let line = lines[i]?.trim() ?? '';
    if (!line) {
      i++;
      continue;
    }
    let timingLine: string | null = null;
    if (line.includes('-->')) {
      timingLine = line;
    } else {
      i++;
      timingLine = lines[i]?.trim() ?? null;
    }
    if (!timingLine || !timingLine.includes('-->')) {
      i++;
      continue;
    }
    const [rawStart, rawRest] = timingLine.split('-->');
    const rawEnd = rawRest.trim().split(/\s+/)[0];
    const start = timeStringToMs(rawStart);
    const end = timeStringToMs(rawEnd);
    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }
    const text = stripHtml(textLines.join('\n'));
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

/**
 * Parse TTML / DFXP (used by Netflix, Prime Video). Both are XML-based with
 * `<p begin="..." end="..." ...>text</p>` elements. Some platforms wrap text
 * in `<span>` lines.
 */
export function parseTTML(input: string): RawCue[] {
  if (!input) return [];
  // Pull out the tickRate (optional) to convert "1234567t" timings.
  const tickMatch = /tickRate\s*=\s*"(\d+)"/.exec(input);
  const tickRate = tickMatch ? parseInt(tickMatch[1], 10) : 0;

  const cues: RawCue[] = [];
  const pRegex = /<p\b[^>]*?begin\s*=\s*"([^"]+)"[^>]*?end\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(input))) {
    const start = tickToMs(match[1], tickRate);
    const end = tickToMs(match[2], tickRate);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    // Replace <br/> with newline before stripping
    const withBreaks = match[3].replace(/<br\s*\/?\s*>/gi, '\n');
    // Replace <span ...>X</span> with X
    const flat = withBreaks.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    const text = stripHtml(flat);
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

function tickToMs(value: string, tickRate: number): number {
  const v = value.trim();
  if (/t$/i.test(v) && tickRate > 0) {
    const ticks = parseFloat(v.slice(0, -1));
    if (!Number.isFinite(ticks)) return NaN;
    return Math.round((ticks / tickRate) * 1000);
  }
  return timeStringToMs(v);
}

/** Detect kind from content + URL. */
export function detectSubtitleKind(url: string, body: string): 'webvtt' | 'ttml' | 'dfxp' | null {
  if (/^\s*WEBVTT/i.test(body)) return 'webvtt';
  if (/^\s*<\??xml[^>]*\?>/i.test(body) || /<tt[\s>]/i.test(body)) {
    // DFXP is functionally a TTML subset; we parse both with parseTTML.
    if (/\.dfxp(\b|\?|$)/i.test(url)) return 'dfxp';
    return 'ttml';
  }
  return null;
}

export function parseAny(url: string, body: string): RawCue[] {
  const kind = detectSubtitleKind(url, body);
  if (kind === 'webvtt') return parseWebVTT(body);
  if (kind === 'ttml' || kind === 'dfxp') return parseTTML(body);
  return [];
}
