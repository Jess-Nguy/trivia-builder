import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Papa from 'papaparse';
import { COLUMNS, parseCsv } from '@trivia/builder/server/csv.js';

const toCsv = (rows) => Papa.unparse(rows, { columns: COLUMNS }) + '\n';

/**
 * Split rows into those the app accepts and those it rejects, by running them
 * through the app's own CSV parser. `invalid` entries carry the parser's problems.
 */
export function validateRows(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-harvest-'));
  try {
    const file = path.join(dir, 'check.csv');
    fs.writeFileSync(file, toCsv(rows));
    const { problems } = parseCsv(file);
    // parseCsv reports 1-based CSV rows including the header, so data row i is i + 2.
    const byIndex = new Map();
    for (const p of problems) {
      const i = p.row - 2;
      if (!byIndex.has(i)) byIndex.set(i, []);
      byIndex.get(i).push(`${p.field}: ${p.message}`);
    }
    const valid = rows.filter((_, i) => !byIndex.has(i));
    const invalid = [...byIndex].map(([i, messages]) => ({ question: rows[i]['Question'], messages }));
    return { valid, invalid };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A path in `dir` named `<base>.csv`, adding " (2)", " (3)" ... if it already exists. */
export function freePath(dir, base) {
  let file = path.join(dir, `${base}.csv`);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${base} (${n}).csv`);
  return file;
}

export function writeRows(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toCsv(rows));
}
