import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toRow, shuffle } from '../src/row.js';
import { validateRows } from '../src/write.js';

const mc = {
  question: 'What do koalas primarily eat?',
  type: 'Multiple Choice',
  answer: 'Eucalyptus Leaves',
  distractors: ['Fruits', 'Cassava', 'Olives'],
  categories: ['Animal'],
};

const options = (row) => [1, 2, 3, 4, 5].map((n) => row[`Option ${n}`]).filter(Boolean);

describe('toRow', () => {
  test('Multiple Choice puts the answer among the options', () => {
    const row = toRow(mc);
    assert.deepEqual(options(row).sort(), ['Cassava', 'Eucalyptus Leaves', 'Fruits', 'Olives']);
    assert.equal(row['Current Answer'], 'Eucalyptus Leaves');
  });

  test('Multiple Choice keeps at most five options', () => {
    const row = toRow({ ...mc, distractors: ['a', 'b', 'c', 'd', 'e', 'f'] });
    assert.equal(options(row).length, 5);
    assert.ok(options(row).includes('Eucalyptus Leaves'));
  });

  test('True or False answers are uppercased', () => {
    const row = toRow({ question: 'Koalas are bears.', type: 'True or False', answer: 'False' });
    assert.equal(row['Current Answer'], 'FALSE');
    assert.deepEqual(options(row), []);
  });

  test('Points is 1 without a hint and 2 with one', () => {
    assert.equal(toRow(mc)['Points'], '1');
    assert.equal(toRow({ ...mc, hint: 'An Australian tree.' })['Points'], '2');
  });

  test('credit fills an empty Explanation only', () => {
    assert.equal(toRow(mc, { credit: 'Source: X' })['Explanation'], 'Source: X');
    assert.equal(toRow({ ...mc, explanation: 'Own text' }, { credit: 'Source: X' })['Explanation'], 'Own text');
  });

  test('categories are comma-joined', () => {
    assert.equal(toRow({ ...mc, categories: ['Animal', 'Biology'] })['Categories'], 'Animal, Biology');
  });
});

describe('shuffle', () => {
  test('keeps every item and leaves the input untouched', () => {
    const input = [1, 2, 3, 4];
    const out = shuffle(input, () => 0);
    assert.deepEqual([...out].sort(), [1, 2, 3, 4]);
    assert.deepEqual(input, [1, 2, 3, 4]);
  });
});

describe('validateRows', () => {
  test('keeps rows the app accepts', () => {
    const { valid, invalid } = validateRows([toRow(mc)]);
    assert.equal(valid.length, 1);
    assert.deepEqual(invalid, []);
  });

  test('rejects a Multiple Choice row with fewer than two options', () => {
    const bad = toRow({ ...mc, question: 'Lonely option?', distractors: [] });
    const { valid, invalid } = validateRows([toRow(mc), bad]);
    assert.equal(valid.length, 1);
    assert.equal(invalid[0].question, 'Lonely option?');
    assert.match(invalid[0].messages[0], /at least 2 options/);
  });

  test('rejects a row with a blank answer', () => {
    const { invalid } = validateRows([toRow({ ...mc, answer: '' })]);
    assert.match(invalid[0].messages.join(' '), /Current Answer is required/);
  });
});
