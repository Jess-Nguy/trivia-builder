import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { toQuestion, categoryFor, sampleTsv } from '../src/sources/jeopardy.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/jeopardy.tsv', import.meta.url));

describe('jeopardy toQuestion', () => {
  test('puts the category before the clue and uses the response as the answer', () => {
    const q = toQuestion({ category: 'FAKE LAKES & RIVERS', answer: 'A test clue', question: 'the Testwater' });
    assert.deepEqual(q, {
      question: 'FAKE LAKES & RIVERS: A test clue',
      type: 'Single Choice',
      answer: 'the Testwater',
      categories: ['Geography'],
    });
  });

  test('adds host comments without their outer brackets', () => {
    const q = toQuestion({ category: 'X', comments: '(Host: a comment.)', answer: 'clue', question: 'r' });
    assert.equal(q.question, 'X (Host: a comment.): clue');
  });

  test('unescapes quotes and drops a trailing backslash', () => {
    const q = toQuestion({ category: 'X', answer: 'say \\"hi\\" it\\\'s\\', question: '\\"Hit\\"' });
    assert.equal(q.question, 'X: say "hi" it\'s');
    assert.equal(q.answer, '"Hit"');
  });

  test('returns null without a clue or response', () => {
    assert.equal(toQuestion({ category: 'X', answer: 'clue', question: '' }), null);
    assert.equal(toQuestion({ category: 'X', answer: '', question: 'r' }), null);
  });
});

describe('jeopardy categoryFor', () => {
  test('maps keywords onto Builder categories', () => {
    assert.equal(categoryFor('WORLD CAPITALS'), 'Geography');
    assert.equal(categoryFor('Potent Potables'), 'General Knowledge');
    assert.equal(categoryFor('4-LETTER WORDS'), 'Language');
  });

  test('does not match a keyword inside another word', () => {
    // "PARTY" contains "ART" but is not Arts & Literature.
    assert.equal(categoryFor('PARTY TIME'), 'General Knowledge');
  });
});

describe('jeopardy sampleTsv', () => {
  test('reads usable rows and counts unusable ones', async () => {
    const { sample, unusable } = await sampleTsv(FIXTURE, 10);
    assert.equal(sample.length, 3);
    assert.equal(unusable, 1);
    assert.ok(sample.some((q) => q.answer === '"Fake Hit"'));
  });

  test('keeps at most size rows', async () => {
    const { sample } = await sampleTsv(FIXTURE, 1, { random: () => 0.99 });
    assert.equal(sample.length, 1);
  });

  test('filters by mapped Builder category', async () => {
    const { sample } = await sampleTsv(FIXTURE, 10, { category: 'entertainment' });
    assert.deepEqual(sample.map((q) => q.answer), ['"Fake Hit"']);
  });
});
