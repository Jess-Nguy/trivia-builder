import fs from 'node:fs';
import { readCache, writeCache } from '../cache.js';
import { getJson } from '../http.js';
import { shuffle } from '../row.js';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const DISTRACTORS = 3;

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const contains = (a, b) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

/**
 * One recipe per query in ./wikidata/<name>.rq. `key` groups rows per item;
 * `answer` is the variable holding the answer; distractors are other items' answers.
 */
export const RECIPES = {
  capitals: {
    key: 'country',
    answer: 'capitalLabel',
    category: 'Geography',
    question: (r) => `What is the capital of ${r.countryLabel}?`,
    // "Mexico City" or "Kuwait City" gives the answer away.
    usable: (r) => !contains(r.countryLabel, r.capitalLabel),
  },
  flags: {
    key: 'country',
    answer: 'countryLabel',
    category: 'Geography',
    question: () => 'Which country does this flag belong to?',
    attachment: (r) => r.flag.replace(/^http:/, 'https:'),
  },
  elements: {
    key: 'element',
    answer: 'symbol',
    category: 'Chemistry',
    question: (r) => `What is the chemical symbol for ${capitalise(r.elementLabel)}?`,
  },
};

// Wikidata falls back to the item id ("Q12345") when there is no English label.
const UNLABELLED = /^Q\d+$/;

/**
 * Turn SPARQL JSON bindings into Multiple Choice questions. Items with more
 * than one answer (South Africa has three capitals) are skipped as ambiguous.
 */
export function buildQuestions(recipe, bindings, random = Math.random) {
  const rows = bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  const byItem = new Map();
  for (const r of rows) {
    if (!byItem.has(r[recipe.key])) byItem.set(r[recipe.key], []);
    byItem.get(r[recipe.key]).push(r);
  }

  const skipped = [];
  const items = [];
  for (const group of byItem.values()) {
    const answers = new Set(group.map((r) => r[recipe.answer]));
    const r = group[0];
    if (answers.size > 1) skipped.push({ question: recipe.question(r), reason: 'more than one answer' });
    else if (Object.values(r).some((v) => UNLABELLED.test(v))) skipped.push({ question: r[recipe.key], reason: 'no English label' });
    else if (recipe.usable && !recipe.usable(r)) skipped.push({ question: recipe.question(r), reason: 'answer is in the question' });
    else items.push(r);
  }

  const pool = [...new Set(items.map((r) => r[recipe.answer]))];
  const questions = items.map((r) => ({
    question: recipe.question(r),
    type: 'Multiple Choice',
    answer: r[recipe.answer],
    distractors: shuffle(pool.filter((a) => a !== r[recipe.answer]), random).slice(0, DISTRACTORS),
    categories: [recipe.category],
    attachment: recipe.attachment ? recipe.attachment(r) : '',
  }));
  return { questions, skipped };
}

async function fetchBindings(name, cacheDir) {
  const cacheName = `wikidata-${name}`;
  const cached = readCache(cacheDir, cacheName, CACHE_MS);
  if (cached) return cached;
  const query = fs.readFileSync(new URL(`./wikidata/${name}.rq`, import.meta.url), 'utf8');
  const json = await getJson(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    Accept: 'application/sparql-results+json',
  });
  writeCache(cacheDir, cacheName, json.results.bindings);
  return json.results.bindings;
}

export default {
  credit: 'Source: Wikidata (wikidata.org), CC0',

  async harvest({ category, cacheDir }) {
    if (category && !RECIPES[category]) {
      throw new Error(`wikidata --category must be one of: ${Object.keys(RECIPES).join(', ')}`);
    }
    const names = category ? [category] : Object.keys(RECIPES);
    const questions = [];
    const skipped = [];
    for (const name of names) {
      const built = buildQuestions(RECIPES[name], await fetchBindings(name, cacheDir));
      questions.push(...built.questions);
      skipped.push(...built.skipped);
    }
    return { questions: shuffle(questions), skipped };
  },
};
