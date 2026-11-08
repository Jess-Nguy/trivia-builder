import { toKnownCategory } from '../categories.js';
import { readCache, writeCache } from '../cache.js';
import { getJson, sleep as realSleep } from '../http.js';

const API = 'https://opentdb.com';
const PER_CALL = 50;
// OpenTDB allows one call per IP every 5 seconds.
const WAIT_MS = 5100;
// Tokens expire after 6 hours unused; the API answers code 3 and we fetch a new one.
const TOKEN_CACHE = 'opentdb-token';

const CATEGORIES = {
  'General Knowledge': 'General Knowledge',
  'Entertainment: Books': 'Arts & Literature',
  'Entertainment: Film': 'Entertainment',
  'Entertainment: Music': 'Entertainment',
  'Entertainment: Musicals & Theatres': 'Entertainment',
  'Entertainment: Television': 'Entertainment',
  'Entertainment: Video Games': 'Games',
  'Entertainment: Board Games': 'Games',
  'Science & Nature': 'General Science',
  'Science: Computers': 'Technology',
  'Science: Mathematics': 'Math/Numbers',
  Mythology: 'Religion & Mythology',
  Politics: 'Politics/Laws',
  Art: 'Arts & Literature',
  Celebrities: 'Entertainment',
  Animals: 'Animal',
  Vehicles: 'Technology',
  'Entertainment: Comics': 'Entertainment',
  'Science: Gadgets': 'Technology',
  'Entertainment: Japanese Anime & Manga': 'Entertainment',
  'Entertainment: Cartoon & Animations': 'Entertainment',
};

const decode = (s) => decodeURIComponent(s);

/** Turn OpenTDB results (requested with encode=url3986) into harvested questions. */
export function parseResults(results) {
  return results.map((r) => {
    const isBoolean = decode(r.type) === 'boolean';
    return {
      question: decode(r.question),
      type: isBoolean ? 'True or False' : 'Multiple Choice',
      answer: decode(r.correct_answer),
      distractors: isBoolean ? [] : r.incorrect_answers.map(decode),
      categories: [toKnownCategory(decode(r.category), CATEGORIES)],
    };
  });
}

async function newToken(fetchJson) {
  const { token } = await fetchJson(`${API}/api_token.php?command=request`);
  return token;
}

export default {
  credit: 'Source: Open Trivia DB (opentdb.com), CC BY-SA 4.0',

  /**
   * Fetch about 1.5x `amount` so duplicates can be dropped and still leave
   * `amount`. A cached session token means repeat runs get unseen questions.
   * `fetchJson` and `sleep` are injectable for tests.
   */
  async harvest({ amount, category, cacheDir, log, fetchJson = getJson, sleep = realSleep }) {
    if (category !== undefined && !/^\d+$/.test(category)) {
      throw new Error('opentdb --category takes a numeric id from https://opentdb.com/api_category.php');
    }
    let token = readCache(cacheDir, TOKEN_CACHE)?.token;
    if (!token) {
      token = await newToken(fetchJson);
      writeCache(cacheDir, TOKEN_CACHE, { token });
      await sleep(WAIT_MS);
    }

    const want = Math.ceil(amount * 1.5);
    const questions = [];
    let perCall = Math.min(PER_CALL, want);
    while (questions.length < want) {
      const n = Math.min(perCall, want - questions.length);
      const url = `${API}/api.php?amount=${n}&encode=url3986&token=${token}${category ? `&category=${category}` : ''}`;
      const { response_code: code, results } = await fetchJson(url);
      if (code === 0) {
        questions.push(...parseResults(results));
      } else if (code === 1 && n > 1) {
        // Fewer than n questions left for this token/category: ask for fewer.
        perCall = Math.ceil(n / 2);
      } else if (code === 1 || code === 4) {
        log(`Open Trivia DB has no unseen questions left here. Delete ${cacheDir}/${TOKEN_CACHE}.json to start over.`);
        break;
      } else if (code === 3) {
        token = await newToken(fetchJson);
        writeCache(cacheDir, TOKEN_CACHE, { token });
      } else if (code !== 5) {
        // 5 is rate limited: wait and retry. Anything else (2 = bad parameter) is our bug.
        throw new Error(`Open Trivia DB answered code ${code} for ${url}`);
      }
      if (questions.length < want) await sleep(WAIT_MS);
    }
    return { questions, skipped: [] };
  },
};
