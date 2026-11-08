import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point the bank at a temp folder so the real data/questions.json is never read.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-harvester-dedupe-'));
const DATA_DIR = path.join(TMP, 'data');
const IMPORT_DIR = path.join(TMP, 'import');
fs.mkdirSync(DATA_DIR);
fs.mkdirSync(IMPORT_DIR);
process.env.TRIVIA_DATA_DIR = DATA_DIR;

const { loadExisting, dropDuplicates } = await import('../src/dedupe.js');

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const koala = { question: 'What do koalas primarily eat?', answer: 'Eucalyptus Leaves' };
const otter = { question: 'Which mammal has the thickest fur?', answer: 'Sea Otter' };

describe('dropDuplicates', () => {
  test('drops a reworded copy of an existing question', () => {
    const existing = [{ question: 'What do koalas eat?', currentAnswer: 'Eucalyptus Leaves' }];
    const { kept, dropped } = dropDuplicates([koala, otter], existing);
    assert.deepEqual(kept, [otter]);
    assert.equal(dropped, 1);
  });

  test('drops repeats inside the same batch', () => {
    const { kept, dropped } = dropDuplicates([koala, { ...koala }], []);
    assert.equal(kept.length, 1);
    assert.equal(dropped, 1);
  });

  test('stops once limit questions are kept', () => {
    const { kept } = dropDuplicates([koala, otter], [], 1);
    assert.deepEqual(kept, [koala]);
  });
});

describe('loadExisting', () => {
  test('reads the bank and every import CSV without changing the CSVs', () => {
    fs.writeFileSync(
      path.join(DATA_DIR, 'questions.json'),
      JSON.stringify([{ id: 'x', question: 'Bank question?', currentAnswer: 'Yes', categories: [] }]),
    );
    // Blank Points: parseCsv would rewrite this file, loadExisting must not.
    const csv = 'Question,Current Answer,Type,Points\nCSV question?,No,Single Choice,\n';
    const csvPath = path.join(IMPORT_DIR, 'old.csv');
    fs.writeFileSync(csvPath, csv);
    fs.writeFileSync(path.join(IMPORT_DIR, 'background audio.csv'), 'link,title\nhttps://x.test,Song\n');

    const existing = loadExisting({ importDir: IMPORT_DIR });

    assert.deepEqual(existing, [
      { question: 'Bank question?', currentAnswer: 'Yes' },
      { question: 'CSV question?', currentAnswer: 'No' },
    ]);
    assert.equal(fs.readFileSync(csvPath, 'utf8'), csv);
  });
});
