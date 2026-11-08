import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFile } from '../src/sources/opentriviaqa.js';

const text = fs.readFileSync(new URL('./fixtures/opentriviaqa-animals.txt', import.meta.url), 'utf8');
const { questions, skipped } = parseFile(text, 'animals');
const byStart = (s) => questions.find((q) => q.question.startsWith(s));

describe('OpenTriviaQA parseFile', () => {
  test('reads a Multiple Choice block', () => {
    assert.deepEqual(byStart('Three of these animals hibernate'), {
      question: 'Three of these animals hibernate. Which one does not?',
      type: 'Multiple Choice',
      answer: 'Sloth',
      distractors: ['Mouse', 'Frog', 'Snake'],
      categories: ['Animal'],
    });
  });

  test('True/False options become a True or False question', () => {
    const q = byStart('Snakes are deaf.');
    assert.equal(q.type, 'True or False');
    assert.equal(q.answer, 'True');
    assert.deepEqual(q.distractors, []);
  });

  test('joins a question that runs over several lines and blank lines', () => {
    const q = byStart('Which band recorded');
    assert.match(q.question, /following verse: Now her daddys getting old And he seemed/);
    assert.equal(q.answer, 'ELO');
  });

  test('skips a block whose answer is not one of the options', () => {
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].question, /^Broken block/);
    assert.equal(byStart('Broken block'), undefined);
  });

  test('unknown file names fall back to General Knowledge', () => {
    const [q] = parseFile('#Q Q?\n^ A\nA A\nB B\n', 'not-a-category').questions;
    assert.deepEqual(q.categories, ['General Knowledge']);
  });
});
