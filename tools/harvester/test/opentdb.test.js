import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import opentdb, { parseResults } from '../src/sources/opentdb.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/opentdb.json', import.meta.url)));
const CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-harvester-opentdb-'));
after(() => fs.rmSync(CACHE, { recursive: true, force: true }));

describe('parseResults', () => {
  const [mc, bool, unknown] = parseResults(fixture.results);

  test('decodes URL-encoded Multiple Choice fields', () => {
    assert.equal(mc.question, 'Who voiced the character Joel in "The Last of Us"?');
    assert.equal(mc.type, 'Multiple Choice');
    assert.equal(mc.answer, 'Troy Baker');
    assert.deepEqual(mc.distractors, ['Nolan North', 'John DiMaggio', 'Steve Blum']);
  });

  test('maps OpenTDB categories onto known ones', () => {
    assert.deepEqual(mc.categories, ['Games']);
    assert.deepEqual(bool.categories, ['Animal']);
  });

  test('unknown categories fall back to General Knowledge', () => {
    assert.deepEqual(unknown.categories, ['General Knowledge']);
  });

  test('boolean questions become True or False with no distractors', () => {
    assert.equal(bool.type, 'True or False');
    assert.equal(bool.answer, 'False');
    assert.deepEqual(bool.distractors, []);
  });
});

describe('harvest', () => {
  const run = (responses, opts = {}) => {
    const calls = [];
    const fetchJson = async (url) => {
      calls.push(url);
      return url.includes('api_token') ? { response_code: 0, token: 'tok' } : responses.shift();
    };
    const logs = [];
    const result = opentdb.harvest({
      amount: 2,
      cacheDir: CACHE,
      log: (m) => logs.push(m),
      fetchJson,
      sleep: async () => {},
      ...opts,
    });
    return result.then((r) => ({ ...r, calls, logs }));
  };

  test('asks for 1.5x the amount with the session token', async () => {
    const { questions, calls } = await run([fixture]);
    assert.equal(questions.length, 3);
    assert.match(calls.at(-1), /amount=3&encode=url3986&token=tok/);
  });

  test('stops and explains when the token has seen everything', async () => {
    const { questions, logs } = await run([{ response_code: 4, results: [] }]);
    assert.equal(questions.length, 0);
    assert.match(logs[0], /no unseen questions/);
  });

  test('rejects a non-numeric category', async () => {
    await assert.rejects(run([], { category: 'Animals' }), /numeric id/);
  });
});
