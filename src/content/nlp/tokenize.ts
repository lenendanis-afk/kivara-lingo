import type { DictionaryEntry } from '../../shared/types';
import { getDictionary, lookupDictionary } from './dictionary';

export type TokenKind = 'mwe' | 'known' | 'unknown' | 'punct';

export interface Token {
  text: string;
  /** Lowercased canonical key. For MWE = the phrase. */
  key: string;
  kind: TokenKind;
}

/**
 * Greedy tokenizer. Matches MWEs (up to MAX_MWE_LEN words) first, then falls
 * back to single words. Whitespace and punctuation are preserved as 'punct'
 * tokens so the output reconstructs the original cue verbatim.
 */
const MAX_MWE_LEN = 5;

export function tokenizeSentence(
  sentence: string,
  expanded: Set<string> = new Set(),
  lang = 'en',
): Token[] {
  const raw = sentence.match(/[\w']+|[^\w\s]+|\s+/g) ?? [];
  const words: { text: string; idx: number }[] = [];
  raw.forEach((t, idx) => {
    if (/[\w']/.test(t)) words.push({ text: t, idx });
  });

  const dict = getDictionary(lang);

  const wordKey = new Map<number, Token>();
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let len = Math.min(MAX_MWE_LEN, words.length - i); len >= 2; len--) {
      const phrase = words.slice(i, i + len).map((w) => w.text).join(' ').toLowerCase();
      if (dict[phrase]?.type === 'phrase' && !expanded.has(phrase)) {
        const text = words.slice(i, i + len).map((w) => w.text).join(' ');
        wordKey.set(words[i].idx, { text, key: phrase, kind: 'mwe' });
        for (let k = 1; k < len; k++) {
          wordKey.set(words[i + k].idx, { text: '', key: '', kind: 'mwe' });
        }
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const w = words[i];
      const lower = w.text.toLowerCase();
      const known = !!dict[lower];
      wordKey.set(w.idx, { text: w.text, key: lower, kind: known ? 'known' : 'unknown' });
      i++;
    }
  }

  const tokens: Token[] = [];
  raw.forEach((t, idx) => {
    if (/^\s+$/.test(t)) tokens.push({ text: t, key: `_sp${idx}`, kind: 'punct' });
    else if (/^[^\w\s]+$/.test(t)) tokens.push({ text: t, key: `_p${idx}`, kind: 'punct' });
    else {
      const tok = wordKey.get(idx);
      if (tok && tok.text) tokens.push(tok);
    }
  });
  return tokens;
}

/** Returns metadata for a token or a placeholder entry. */
export function lookup(token: string, lang = 'en'): DictionaryEntry {
  return (
    lookupDictionary(token, lang) ?? {
      token,
      type: token.includes(' ') ? 'phrase' : 'word',
      translation: '—',
    }
  );
}
