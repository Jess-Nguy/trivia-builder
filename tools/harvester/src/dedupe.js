import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { IMPORT_DIR } from '../../../server/csv.js';
import { getLibrary, findDuplicate } from '../../../server/library.js';

const clean = (v) => (v == null ? '' : String(v).trim());
const mediaKey = (attachment, answer) => `${clean(attachment).toLowerCase()} :: ${clean(answer).toLowerCase()}`;

/**
 * Every question the game already knows: the Builder bank plus each CSV in the
 * import folder (earlier harvests included). Reads CSVs with Papa directly
 * because parseCsv writes back blank Points, and this must not touch the files.
 */
export function loadExisting({ importDir = IMPORT_DIR } = {}) {
  const bank = getLibrary().questions.map(({ question, currentAnswer, attachment }) => ({
    question,
    currentAnswer,
    attachment: clean(attachment),
  }));
  const files = fs.existsSync(importDir)
    ? fs.readdirSync(importDir).filter((f) => f.toLowerCase().endsWith('.csv'))
    : [];
  const fromCsv = files.flatMap((f) => {
    const { data } = Papa.parse(fs.readFileSync(path.join(importDir, f), 'utf8'), {
      header: true,
      skipEmptyLines: 'greedy',
    });
    return data
      .map((r) => ({
        question: clean(r['Question']),
        currentAnswer: clean(r['Current Answer']),
        attachment: clean(r['Question Attachments'] || r['Attachments']),
      }))
      .filter((q) => q.question);
  });
  return [...bank, ...fromCsv];
}

/**
 * Keep up to `limit` harvested questions that don't look like an existing one
 * or one kept earlier in the same batch. Uses the Builder's fuzzy match, so a
 * reworded copy of a bank question is dropped too. Picture questions often
 * share their text ("Which country does this flag belong to?"), so those are
 * told apart by attachment + answer instead, as the Builder's CSV import does.
 */
export function dropDuplicates(candidates, existing, limit = Infinity) {
  const seen = [...existing];
  const seenMedia = new Set(existing.filter((q) => q.attachment).map((q) => mediaKey(q.attachment, q.currentAnswer)));
  const kept = [];
  let dropped = 0;
  for (const q of candidates) {
    if (kept.length >= limit) break;
    const probe = { question: q.question, currentAnswer: q.answer, attachment: clean(q.attachment) };
    const duplicate = probe.attachment
      ? seenMedia.has(mediaKey(probe.attachment, probe.currentAnswer))
      : findDuplicate(probe, seen);
    if (duplicate) {
      dropped += 1;
    } else {
      kept.push(q);
      seen.push(probe);
      if (probe.attachment) seenMedia.add(mediaKey(probe.attachment, probe.currentAnswer));
    }
  }
  return { kept, dropped };
}
