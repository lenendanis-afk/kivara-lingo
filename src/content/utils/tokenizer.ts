// Backwards-compatible wrapper. New code should import from '../nlp/tokenize'
// and '../nlp/dictionary' directly.
import type { DictionaryEntry } from '../../shared/types';
import { getDictionary } from '../nlp/dictionary';

export type SegmentMeta = DictionaryEntry;

/** SEGMENT_REGISTRY exposes the English dictionary (legacy alias). */
export const SEGMENT_REGISTRY: Record<string, SegmentMeta> = getDictionary('en');

export type { Token, TokenKind } from '../nlp/tokenize';
export { tokenizeSentence, lookup } from '../nlp/tokenize';
