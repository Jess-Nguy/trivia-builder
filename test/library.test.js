// Question Builder tests against the real 316-question import, so anything the
// game already plays from that CSV is proven to survive the builder unchanged.
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_NAME = '316 - Total Trivia Mix w_ hints - ALL.csv';

// The bank and a copy of the CSV live in a temp folder: the real data/ is never
// touched, and parseCsv's Points write-back can't modify the committed file.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-builder-test-'));
const DATA_DIR = path.join(TMP, 'data');
const CSV_PATH = path.join(TMP, CSV_NAME);
fs.copyFileSync(path.join(ROOT, 'import', CSV_NAME), CSV_PATH);
process.env.TRIVIA_DATA_DIR = DATA_DIR;

const lib = await import('../server/library.js');
const { parseCsv } = await import('../server/csv.js');

const csvQuestions = () => parseCsv(CSV_PATH).questions.map(({ id, ...q }) => q);
const bankFields = ({ id, createdAt, updatedAt, ...q }) => q;
const findByText = (text) => lib.getLibrary().questions.find((q) => q.question === text);

beforeEach(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('importing the 316-question CSV', () => {
  test('adds every row to the bank', () => {
    const r = lib.importCsv(CSV_PATH, CSV_NAME);
    assert.deepEqual({ added: r.added, reused: r.reused, skipped: r.skipped }, { added: 316, reused: 0, skipped: 0 });
  });

  test('creates a shuffled playlist named after the file, in CSV row order', () => {
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    const game = lib.getPlaylistGame(playlist.id);
    assert.equal(playlist.name, '316 - Total Trivia Mix w_ hints - ALL');
    assert.equal(playlist.ordered, false);
    assert.deepEqual(game.questions.map((q) => q.question), csvQuestions().map((q) => q.question));
  });

  test('stores each question exactly as the CSV parser reads it', () => {
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    assert.deepEqual(lib.getPlaylistGame(playlist.id).questions.map(bankFields), csvQuestions());
  });

  test('re-importing reuses every question instead of duplicating it', () => {
    lib.importCsv(CSV_PATH, CSV_NAME);
    const again = lib.importCsv(CSV_PATH, CSV_NAME);
    assert.deepEqual({ added: again.added, reused: again.reused }, { added: 0, reused: 316 });
    assert.equal(lib.getLibrary().questions.length, 316);
  });

  test('a second import of the same file gets a numbered playlist name', () => {
    lib.importCsv(CSV_PATH, CSV_NAME);
    const again = lib.importCsv(CSV_PATH, CSV_NAME);
    assert.equal(again.playlist.name, '316 - Total Trivia Mix w_ hints - ALL (2)');
  });

  test('the known category list covers every category in the file', () => {
    lib.importCsv(CSV_PATH, CSV_NAME);
    const fileCats = [...new Set(csvQuestions().flatMap((q) => q.categories))].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(fileCats, [...lib.KNOWN_CATEGORIES].sort((a, b) => a.localeCompare(b)));
    assert.deepEqual(lib.getLibrary().categories, fileCats);
  });
});

describe('builder validation matches the CSV', () => {
  test('accepts every question from the file and saves it unchanged', () => {
    for (const q of csvQuestions()) {
      assert.deepEqual(lib.normalizeQuestion(q), q, `row changed or rejected: ${q.question}`);
    }
  });

  test('saves a Single Choice question like the CSV row "What is a male duck called?"', () => {
    const row = csvQuestions().find((q) => q.question === 'What is a male duck called?');
    const saved = lib.createQuestion({
      type: 'Single Choice',
      question: 'What is a male duck called?',
      currentAnswer: 'Drake',
      categories: ['Animal'],
      points: '2',
      hint: 'Shares a name with a chart-topping Canadian rapper.',
    });
    assert.deepEqual(bankFields(saved), row);
  });

  test('saves a True or False question like the CSV row about crawfish', () => {
    const row = csvQuestions().find((q) => q.question === 'True or False: Crawfish are fish.');
    const saved = lib.createQuestion({ ...row, currentAnswer: 'false', options: [] });
    assert.deepEqual(bankFields(saved), row);
  });

  test('a blank Points defaults to 2 with a hint, like the CSV', () => {
    const q = lib.normalizeQuestion({ type: 'Single Choice', question: 'Q?', currentAnswer: 'A', hint: 'h', points: '' });
    assert.equal(q.points, 2);
  });

  test('a blank Points defaults to 1 without a hint, like the CSV', () => {
    const q = lib.normalizeQuestion({ type: 'Single Choice', question: 'Q?', currentAnswer: 'A', points: '' });
    assert.equal(q.points, 1);
  });

  test('rejects Multiple Choice with fewer than 2 options, like the CSV', () => {
    assert.throws(
      () => lib.normalizeQuestion({ type: 'Multiple Choice', question: 'Q?', currentAnswer: 'A', options: [{ text: 'A' }] }),
      (e) => e.status === 400 && e.problems.some((p) => p.field === 'options'),
    );
  });

  test('rejects a True or False answer that is not TRUE or FALSE', () => {
    assert.throws(
      () => lib.normalizeQuestion({ type: 'True or False', question: 'Q?', currentAnswer: 'Yes' }),
      (e) => e.status === 400 && e.problems.some((p) => p.field === 'currentAnswer'),
    );
  });
});

describe('playlist CSV export', () => {
  test('parses back to the same questions as the original file', () => {
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    const out = path.join(TMP, 'export.csv');
    fs.writeFileSync(out, lib.playlistCsv(playlist.id).csv);
    assert.deepEqual(parseCsv(out).questions.map(({ id, ...q }) => q), csvQuestions());
  });
});

describe('playlists reference questions', () => {
  test('an edit to a question shows in every playlist that holds it', () => {
    const a = lib.createPlaylist({ name: 'Friday' });
    const b = lib.createPlaylist({ name: 'Kids' });
    const q = lib.createQuestion({ type: 'Single Choice', question: 'What is a baby goat called?', currentAnswer: 'Kid', playlistIds: [a.id, b.id] });
    lib.updateQuestion(q.id, { type: 'Single Choice', question: 'What is a baby goat called?', currentAnswer: 'A kid', playlistIds: [a.id, b.id] });
    assert.equal(lib.getPlaylistGame(a.id).questions[0].currentAnswer, 'A kid');
    assert.equal(lib.getPlaylistGame(b.id).questions[0].currentAnswer, 'A kid');
  });

  test('unticking a playlist removes the question from that playlist only', () => {
    const a = lib.createPlaylist({ name: 'Friday' });
    const b = lib.createPlaylist({ name: 'Kids' });
    const input = { type: 'Single Choice', question: 'What is a group of crows called?', currentAnswer: 'Murder' };
    const q = lib.createQuestion({ ...input, playlistIds: [a.id, b.id] });
    lib.updateQuestion(q.id, { ...input, playlistIds: [b.id] });
    assert.equal(lib.getPlaylistGame(a.id).total, 0);
    assert.equal(lib.getPlaylistGame(b.id).total, 1);
  });

  test('deleting a question removes it from every playlist', () => {
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    const extra = lib.createPlaylist({ name: 'Animals' });
    const duck = findByText('What is a male duck called?');
    lib.addToPlaylist(extra.id, [duck.id]);
    lib.deleteQuestion(duck.id);
    assert.equal(lib.getPlaylistGame(playlist.id).total, 315);
    assert.equal(lib.getPlaylistGame(extra.id).total, 0);
  });

  test('deleting a playlist keeps its questions in the bank', () => {
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    lib.deletePlaylist(playlist.id);
    assert.equal(lib.getLibrary().questions.length, 316);
  });

  test('adding a question already in a playlist does not repeat it', () => {
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    lib.addToPlaylist(playlist.id, [findByText('What is a male duck called?').id]);
    assert.equal(lib.getPlaylistGame(playlist.id).total, 316);
  });

  test('rejects a playlist name that differs only by case', () => {
    lib.createPlaylist({ name: 'Friday' });
    assert.throws(() => lib.createPlaylist({ name: 'friday' }), (e) => e.status === 400);
  });
});

describe('ordered playlists', () => {
  test('play back in their saved order after a reorder', () => {
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    const reversed = [...playlist.questionIds].reverse();
    lib.updatePlaylist(playlist.id, { ordered: true, questionIds: reversed });
    assert.deepEqual(lib.getPlaylistGame(playlist.id).questions.map((q) => q.id), reversed);
  });

  test('a game from an ordered playlist starts with its first questions in order', async () => {
    const { store } = await import('../client/src/store.js');
    const { playlist } = lib.importCsv(CSV_PATH, CSV_NAME);
    const { questions } = lib.getPlaylistGame(playlist.id);
    store.startGame({ fileName: `playlist:${playlist.id}`, numPlayers: 1, numQuestions: 5, ordered: true }, questions);
    assert.deepEqual(store.questions.map((q) => q.id), questions.slice(0, 5).map((q) => q.id));
  });
});

describe('questions written on phones', () => {
  const AUTHOR = { name: 'Sam', token: 'player-aaaa' };
  const KOALA = { question: 'What do koalas primarily eat?', currentAnswer: 'Eucalyptus leaves', type: 'Single Choice' };

  test('are saved as public and unread, credited to the phone', () => {
    const q = lib.submitQuestion(KOALA, AUTHOR);
    assert.deepEqual(
      { source: q.source, submittedBy: q.submittedBy, authorToken: q.authorToken, seenAt: q.seenAt },
      { source: 'public', submittedBy: 'Sam', authorToken: 'player-aaaa', seenAt: null },
    );
  });

  test('get the same validation as the builder', () => {
    assert.throws(() => lib.submitQuestion({ ...KOALA, currentAnswer: '' }, AUTHOR), (e) => e.status === 400);
  });

  test('cannot attach media to options', () => {
    const q = lib.submitQuestion(
      { question: 'Pick the red one', type: 'Multiple Choice', currentAnswer: 'Rose',
        options: [{ text: 'Rose', attachment: 'https://example.com/a.png' }, { text: 'Daisy' }] },
      AUTHOR,
    );
    assert.equal(q.options[0].attachment, '');
  });

  test('reject an attachment that is not an http(s) link', () => {
    assert.throws(
      () => lib.submitQuestion({ ...KOALA, attachment: 'javascript:alert(1)' }, AUTHOR),
      (e) => e.problems[0].field === 'attachment',
    );
  });

  test('keep their public fields when the host edits them', () => {
    const q = lib.submitQuestion(KOALA, AUTHOR);
    const edited = lib.updateQuestion(q.id, { ...q, hint: 'Grey and cuddly' });
    assert.equal(edited.submittedBy, 'Sam');
  });
});

describe('duplicate check', () => {
  const bank = [{ question: 'What do koalas primarily eat?', currentAnswer: 'Eucalyptus leaves' }];
  const dupe = (question, currentAnswer = 'Something else') => !!lib.findDuplicate({ question, currentAnswer }, bank);

  test('catches the same question with different case and punctuation', () => {
    assert.ok(dupe('what do KOALAS primarily eat'));
  });

  test('catches the same question with different filler words', () => {
    assert.ok(dupe('Koalas primarily eat what?'));
  });

  test('catches a reworded question with the same answer', () => {
    assert.ok(dupe('What food do koalas eat?', 'eucalyptus leaves'));
  });

  test('allows a question on a different subject', () => {
    assert.ok(!dupe('What do pandas primarily eat?'));
  });

  test('does not treat a shared TRUE answer as a match', () => {
    const tf = [{ question: 'Koalas sleep most of the day.', currentAnswer: 'TRUE' }];
    assert.ok(!lib.findDuplicate({ question: 'Koalas are bears.', currentAnswer: 'TRUE' }, tf));
  });

  test('a submission matching the bank is rejected with a 409', () => {
    lib.submitQuestion({ question: 'What do koalas primarily eat?', currentAnswer: 'Leaves', type: 'Single Choice' }, { name: 'A', token: 'player-aaaa' });
    assert.throws(
      () => lib.submitQuestion({ question: 'Koalas primarily eat what?', currentAnswer: 'Leaves', type: 'Single Choice' }, { name: 'B', token: 'player-bbbb' }),
      (e) => e.status === 409,
    );
  });
});

describe('marking questions read', () => {
  test('sets seenAt on unread public questions', () => {
    const q = lib.submitQuestion({ question: 'Name a gas giant', currentAnswer: 'Jupiter', type: 'Single Choice' }, { name: 'A', token: 'player-aaaa' });
    assert.equal(lib.markSeen([q.id]), 1);
    assert.ok(findByText('Name a gas giant').seenAt);
  });

  test('leaves host questions alone', () => {
    const q = lib.createQuestion({ question: 'Name a gas giant', currentAnswer: 'Jupiter', type: 'Single Choice' });
    assert.equal(lib.markSeen([q.id]), 0);
    assert.equal(findByText('Name a gas giant').seenAt, undefined);
  });
});
