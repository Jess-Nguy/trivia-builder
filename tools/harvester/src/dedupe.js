import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { IMPORT_DIR } from '../../../server/csv.js';
import { getLibrary, findDuplicate } from '../../../server/library.js';

const clean = (v) => (v == null ? '' : String(v).trim());

/**
 * Every question the game already knows: the Builder bank plus each CSV in the
 * import folder (earlier harvests included). Reads CSVs with Papa directly
 * because parseCsv writes back blank Points, and this must not touch the files.
 */
export function loadExisting({ importDir = IMPORT_DIR } = {}) {
  const bank = getLibrary().questions.map(({ question, currentAnswer }) => ({ question, currentAnswer }));
  const files = fs.existsSync(importDir)
    ? fs.readdirSync(importDir).filter((f) => f.toLowerCase().endsWith('.csv'))
    : [];
  const fromCsv = files.flatMap((f) => {
    const { data } = Papa.parse(fs.readFileSync(path.join(importDir, f), 'utf8'), {
      header: true,
      skipEmptyLines: 'greedy',
    });
    return data
      .map((r) => ({ question: clean(r['Question']), currentAnswer: clean(r['Current Answer']) }))
      .filter((q) => q.question);
  });
  return [...bank, ...fromCsv];
}

/**
 * Keep up to `limit` harvested questions that don't look like an existing one
 * or one kept earlier in the same batch. Uses the Builder's fuzzy match, so a
 * reworded copy of a bank question is dropped too.
 */
export function dropDuplicates(candidates, existing, limit = Infinity) {
  const seen = [...existing];
  const kept = [];
  let dropped = 0;
  for (const q of candidates) {
    if (kept.length >= limit) break;
    const probe = { question: q.question, currentAnswer: q.answer };
    if (findDuplicate(probe, seen)) {
      dropped += 1;
    } else {
      kept.push(q);
      seen.push(probe);
    }
  }
  return { kept, dropped };
}
