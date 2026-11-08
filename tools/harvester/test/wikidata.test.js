import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, buildQuestions } from '../src/sources/wikidata.js';

// SPARQL JSON bindings, shaped like query.wikidata.org results.
const b = (fields) => Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { type: 'literal', value }]));
const capitals = [
  b({ country: 'wd:Q16', countryLabel: 'Canada', capitalLabel: 'Ottawa' }),
  b({ country: 'wd:Q17', countryLabel: 'Japan', capitalLabel: 'Tokyo' }),
  b({ country: 'wd:Q183', countryLabel: 'Germany', capitalLabel: 'Berlin' }),
  b({ country: 'wd:Q96', countryLabel: 'Mexico', capitalLabel: 'Mexico City' }),
  b({ country: 'wd:Q258', countryLabel: 'South Africa', capitalLabel: 'Pretoria' }),
  b({ country: 'wd:Q258', countryLabel: 'South Africa', capitalLabel: 'Cape Town' }),
  b({ country: 'wd:Q999', countryLabel: 'Q999', capitalLabel: 'Nowhere' }),
];

describe('wikidata capitals', () => {
  const { questions, skipped } = buildQuestions(RECIPES.capitals, capitals);
  const canada = questions.find((q) => q.answer === 'Ottawa');

  test('builds Multiple Choice with other capitals as distractors', () => {
    assert.equal(canada.question, 'What is the capital of Canada?');
    assert.equal(canada.type, 'Multiple Choice');
    assert.deepEqual([...canada.distractors].sort(), ['Berlin', 'Tokyo']);
    assert.deepEqual(canada.categories, ['Geography']);
  });

  test('skips countries with more than one capital', () => {
    assert.ok(skipped.some((s) => s.question.includes('South Africa') && s.reason === 'more than one answer'));
  });

  test('skips capitals that give the answer away', () => {
    assert.ok(skipped.some((s) => s.question.includes('Mexico') && s.reason === 'answer is in the question'));
  });

  test('skips items without an English label', () => {
    assert.ok(skipped.some((s) => s.reason === 'no English label'));
    assert.equal(questions.length, 3);
  });
});

describe('wikidata flags', () => {
  test('puts the flag image in the attachment over https', () => {
    const { questions } = buildQuestions(RECIPES.flags, [
      b({ country: 'wd:Q16', countryLabel: 'Canada', flag: 'http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Canada.svg' }),
      b({ country: 'wd:Q17', countryLabel: 'Japan', flag: 'http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg' }),
    ]);
    const canada = questions.find((q) => q.answer === 'Canada');
    assert.equal(canada.attachment, 'https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Canada.svg');
    assert.deepEqual(canada.distractors, ['Japan']);
  });
});

describe('wikidata elements', () => {
  test('capitalises the lowercase element label', () => {
    const { questions } = buildQuestions(RECIPES.elements, [
      b({ element: 'wd:Q1801', elementLabel: 'lanthanum', symbol: 'La' }),
      b({ element: 'wd:Q1809', elementLabel: 'promethium', symbol: 'Pm' }),
    ]);
    assert.equal(questions[0].question, 'What is the chemical symbol for Lanthanum?');
    assert.deepEqual(questions[0].categories, ['Chemistry']);
  });
});
