#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { IMPORT_DIR } from '../../../server/csv.js';
import { toRow } from './row.js';
import { loadExisting, dropDuplicates } from './dedupe.js';
import { validateRows, freePath, writeRows } from './write.js';

const CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.cache');

const SOURCES = {};

const USAGE = `Usage: npm run harvest -- <source> [options]

Sources: ${Object.keys(SOURCES).join(', ') || '(none yet)'}

Options:
  --amount <n>      questions to keep (default 50)
  --category <x>    source-specific category filter (see tools/harvester/README.md)
  --path <p>        local dataset file or folder (jeopardy, opentriviaqa)
  --out <file>      output CSV (default: import/Harvest - <source> - <date>.csv)
  --dry-run         report what would be written, write nothing`;

function fail(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      amount: { type: 'string', default: '50' },
      category: { type: 'string' },
      path: { type: 'string' },
      out: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) return console.log(USAGE);

  const source = SOURCES[positionals[0]];
  if (!source) fail(positionals[0] ? `Unknown source "${positionals[0]}".` : 'Pick a source.');
  const amount = Number(values.amount);
  if (!Number.isInteger(amount) || amount < 1) fail('--amount must be a positive whole number.');

  const { questions, skipped } = await source.harvest({
    amount,
    category: values.category,
    path: values.path,
    cacheDir: CACHE_DIR,
    log: (m) => console.error(m),
  });

  const { kept, dropped } = dropDuplicates(questions, loadExisting(), amount);
  const rows = kept.map((q) => toRow(q, { credit: source.credit }));
  const { valid, invalid } = validateRows(rows);

  console.log(`fetched:   ${questions.length}`);
  console.log(`skipped:   ${skipped.length} (source data unusable)`);
  console.log(`duplicate: ${dropped} (already in the bank or import/)`);
  console.log(`invalid:   ${invalid.length} (rejected by the app's CSV rules)`);
  for (const { question, messages } of invalid) console.log(`  - ${question}: ${messages.join('; ')}`);

  if (!valid.length) return console.log('Nothing to write.');
  const date = new Date().toLocaleDateString('en-CA');
  const out = values.out
    ? path.resolve(values.out)
    : freePath(IMPORT_DIR, `Harvest - ${positionals[0]} - ${date}`);
  if (values['dry-run']) return console.log(`would write ${valid.length} to ${out}`);
  writeRows(out, valid);
  console.log(`written:   ${valid.length} to ${out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
