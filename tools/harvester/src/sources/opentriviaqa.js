import fs from 'node:fs';
import path from 'node:path';
import { toKnownCategory } from '../categories.js';
import { shuffle } from '../row.js';

// File name in the repo's categories/ folder -> Builder category.
const CATEGORIES = {
  animals: 'Animal',
  'brain-teasers': 'General Knowledge',
  celebrities: 'Entertainment',
  entertainment: 'Entertainment',
  'for-kids': 'General Knowledge',
  general: 'General Knowledge',
  geography: 'Geography',
  history: 'History',
  hobbies: 'General Knowledge',
  humanities: 'Arts & Literature',
  literature: 'Arts & Literature',
  movies: 'Entertainment',
  music: 'Entertainment',
  newest: 'General Knowledge',
  people: 'General Knowledge',
  rated: 'General Knowledge',
  'religion-faith': 'Religion & Mythology',
  'science-technology': 'General Science',
  sports: 'Sports',
  television: 'Entertainment',
  'video-games': 'Games',
  world: 'Geography',
};

const OPTION = /^([A-E]) (.*)$/;

/**
 * Parse one OpenTriviaQA category file. Blocks look like:
 *   #Q question text (may continue over several lines, even past blank lines)
 *   ^ answer
 *   A option ... D option
 * Returns { questions, skipped } where skipped rows carry a reason.
 */
export function parseFile(text, category) {
  const blocks = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#Q ')) {
      current = { question: [line.slice(3).trim()], answer: null, options: [] };
      blocks.push(current);
    } else if (!current || !line) {
      continue;
    } else if (line.startsWith('^ ')) {
      current.answer = line.slice(2).trim();
    } else if (OPTION.test(line) && current.answer !== null) {
      current.options.push(line.match(OPTION)[2].trim());
    } else if (current.answer === null) {
      current.question.push(line);
    }
  }

  const questions = [];
  const skipped = [];
  for (const b of blocks) {
    const question = b.question.join(' ');
    if (!b.answer || !b.options.includes(b.answer)) {
      skipped.push({ question, reason: 'answer does not match any option' });
      continue;
    }
    const isBoolean = b.options.length === 2 && b.options.includes('True') && b.options.includes('False');
    questions.push({
      question,
      type: isBoolean ? 'True or False' : 'Multiple Choice',
      answer: b.answer,
      distractors: isBoolean ? [] : b.options.filter((o) => o !== b.answer),
      categories: [toKnownCategory(category, CATEGORIES)],
    });
  }
  return { questions, skipped };
}

/** Category files under `p`: a single file, a clone's categories/ folder, or a folder of files. */
function categoryFiles(p) {
  if (fs.statSync(p).isFile()) return [p];
  const dir = fs.existsSync(path.join(p, 'categories')) ? path.join(p, 'categories') : p;
  return fs
    .readdirSync(dir)
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile() && !path.basename(f).startsWith('.'));
}

export default {
  credit: 'Source: OpenTriviaQA (github.com/uberspot/OpenTriviaQA), CC BY-SA 4.0',

  async harvest({ path: p, category }) {
    if (!p) throw new Error('opentriviaqa needs --path to a clone of github.com/uberspot/OpenTriviaQA');
    if (!fs.existsSync(p)) throw new Error(`opentriviaqa --path not found: ${p}`);
    let files = categoryFiles(p);
    if (category) files = files.filter((f) => path.basename(f) === category);
    if (!files.length) throw new Error(`No OpenTriviaQA category files found for ${category || p}`);

    const questions = [];
    const skipped = [];
    for (const f of files) {
      const parsed = parseFile(fs.readFileSync(f, 'utf8'), path.basename(f));
      questions.push(...parsed.questions);
      skipped.push(...parsed.skipped);
    }
    return { questions: shuffle(questions), skipped };
  },
};
