import { test, describe, after, beforeEach } from 'node:test';
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

  test('keeps picture questions that share text but not the picture', () => {
    const flag = (country) => ({
      question: 'Which country does this flag belong to?',
      answer: country,
      attachment: `https://x.test/${country}.svg`,
    });
    const { kept } = dropDuplicates([flag('Canada'), flag('Japan')], []);
    assert.equal(kept.length, 2);
  });

  test('drops a picture question whose picture and answer already exist', () => {
    const existing = [{ question: 'Name this flag', currentAnswer: 'Canada', attachment: 'https://x.test/Canada.svg' }];
    const candidate = { question: 'Which country does this flag belong to?', answer: 'canada', attachment: 'https://x.test/Canada.svg' };
    assert.equal(dropDuplicates([candidate], existing).dropped, 1);
  });

  test('stops once limit questions are kept', () => {
    const { kept } = dropDuplicates([koala, otter], [], 1);
    assert.deepEqual(kept, [koala]);
  });
});

describe('loadExisting', () => {
  // Blank Points: parseCsv would rewrite this file, loadExisting must not.
  const csv = 'Question,Current Answer,Type,Points,Question Attachments\nCSV question?,No,Single Choice,,https://x.test/a.png\n';
  const csvPath = path.join(IMPORT_DIR, 'old.csv');

  beforeEach(() => {
    fs.writeFileSync(
      path.join(DATA_DIR, 'questions.json'),
      JSON.stringify([{ id: 'x', question: 'Bank question?', currentAnswer: 'Yes', attachment: '', categories: [] }]),
    );
    fs.writeFileSync(csvPath, csv);
    fs.writeFileSync(path.join(IMPORT_DIR, 'background audio.csv'), 'link,title\nhttps://x.test,Song\n');
  });

  test('reads the bank and every import CSV', () => {
    assert.deepEqual(loadExisting({ importDir: IMPORT_DIR }), [
      { question: 'Bank question?', currentAnswer: 'Yes', attachment: '' },
      { question: 'CSV question?', currentAnswer: 'No', attachment: 'https://x.test/a.png' },
    ]);
  });

  test('leaves the import CSVs unchanged', () => {
    loadExisting({ importDir: IMPORT_DIR });
    assert.equal(fs.readFileSync(csvPath, 'utf8'), csv);
  });
});
