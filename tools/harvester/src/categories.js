import { KNOWN_CATEGORIES } from '@trivia/builder/server/library.js';

const FALLBACK = 'General Knowledge';
const byLower = new Map(KNOWN_CATEGORIES.map((c) => [c.toLowerCase(), c]));

/**
 * Map a source's category name onto one of the Builder's known categories:
 * the source's own table first, then a case-insensitive name match, then
 * General Knowledge. Keeps hundreds of source categories out of the picker.
 */
export function toKnownCategory(raw, table = {}) {
  const name = String(raw ?? '').trim();
  return table[name] || byLower.get(name.toLowerCase()) || FALLBACK;
}
