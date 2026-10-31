import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { COLUMNS, TYPES, parseCsv } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// TRIVIA_DATA_DIR lets tests point the bank at a temp folder.
export const DATA_DIR = path.resolve(process.env.TRIVIA_DATA_DIR || path.join(__dirname, '..', 'data'));
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');

// Offered in the builder's category picker even before any question uses them.
// Users can type their own; those appear once a saved question carries them.
export const KNOWN_CATEGORIES = [
  'Animal', 'Arts & Literature', 'Biology', 'Chemistry', 'Entertainment',
  'Finance/Economic', 'Games', 'General Knowledge', 'General Science', 'Geography',
  'Geology', 'History', 'Language', 'Math/Numbers', 'Meme/Trends', 'Physics',
  'Pokemon', 'Politics/Laws', 'Religion & Mythology', 'Space', 'Sports', 'Technology',
];

const clean = (v) => (v == null ? '' : String(v).trim());
const norm = (s) => clean(s).toLowerCase();

// Same identity the client uses for played history (store.js questionKey), so an
// imported CSV row and its bank copy dedupe against each other.
const questionKey = (q) => [norm(q.question), norm(q.currentAnswer), norm(q.attachment)].join(' :: ');

function readJson(file) {
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(data) ? data : [];
}

// Write to a temp file and rename, so a crash mid-write can't leave half a file.
function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

const loadQuestions = () => readJson(QUESTIONS_FILE);
const loadPlaylists = () => readJson(PLAYLISTS_FILE);
const saveQuestions = (qs) => writeJson(QUESTIONS_FILE, qs);
const savePlaylists = (ps) => writeJson(PLAYLISTS_FILE, ps);

export class LibraryError extends Error {
  constructor(status, message, problems = []) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

/**
 * Validate builder input and return it in the same shape parseCsv produces, so
 * the game screens play bank questions and CSV rows alike. Throws a 400
 * LibraryError listing every field problem.
 */
export function normalizeQuestion(input) {
  const problems = [];
  const question = clean(input.question);
  const currentAnswer = clean(input.currentAnswer);
  const type = TYPES[norm(input.type)];
  const hint = clean(input.hint);

  if (!question) problems.push({ field: 'question', message: 'Question is required.' });
  if (!currentAnswer) problems.push({ field: 'currentAnswer', message: 'Answer is required.' });
  if (!type) {
    problems.push({ field: 'type', message: `Type must be one of: ${Object.values(TYPES).join(', ')}.` });
  }

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  let options;
  if (type === 'True or False') {
    options = ['TRUE', 'FALSE'].map((text, i) => ({ text, attachment: clean(rawOptions[i]?.attachment) }));
    if (!['TRUE', 'FALSE'].includes(currentAnswer.toUpperCase())) {
      problems.push({ field: 'currentAnswer', message: 'True or False answers must be TRUE or FALSE.' });
    }
  } else if (type === 'Multiple Choice') {
    options = rawOptions
      .slice(0, 5)
      .map((o) => ({ text: clean(o?.text), attachment: clean(o?.attachment) }))
      .filter((o) => o.text || o.attachment);
    if (options.length < 2) {
      problems.push({ field: 'options', message: 'Multiple Choice questions need at least 2 options.' });
    }
  } else {
    options = [];
  }

  // Blank points follow the CSV default: 2 with a hint, 1 without.
  let points = hint ? 2 : 1;
  if (clean(input.points) !== '') {
    points = Number(input.points);
    if (!Number.isFinite(points)) problems.push({ field: 'points', message: 'Points must be a number.' });
  }

  let delaySecs = 0;
  if (clean(input.delaySecs) !== '') {
    delaySecs = Number(input.delaySecs);
    if (!Number.isFinite(delaySecs) || delaySecs < 0) {
      problems.push({ field: 'delaySecs', message: 'Reading delay must be a non-negative number.' });
    }
  }

  if (problems.length) throw new LibraryError(400, 'Question has validation problems.', problems);

  const seen = new Set();
  const categories = (Array.isArray(input.categories) ? input.categories : [])
    .map(clean)
    .filter((c) => c && !seen.has(norm(c)) && seen.add(norm(c)));

  return {
    question,
    options,
    currentAnswer: type === 'True or False' ? currentAnswer.toUpperCase() : currentAnswer,
    categories,
    type,
    attachment: clean(input.attachment),
    points,
    hint,
    explanation: clean(input.explanation),
    delaySecs,
  };
}

/** Categories offered in the picker: the known list plus any used in the bank. */
function allCategories(questions) {
  const byKey = new Map(KNOWN_CATEGORIES.map((c) => [norm(c), c]));
  for (const q of questions) for (const c of q.categories) if (!byKey.has(norm(c))) byKey.set(norm(c), c);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export function getLibrary() {
  const questions = loadQuestions();
  return { questions, playlists: loadPlaylists(), categories: allCategories(questions) };
}

// Make each listed playlist contain the question iff its id is in playlistIds.
// New memberships append to the end, so ordered playlists keep their order.
function syncMembership(playlists, questionId, playlistIds) {
  const want = new Set(playlistIds);
  for (const p of playlists) {
    const has = p.questionIds.includes(questionId);
    if (want.has(p.id) && !has) p.questionIds.push(questionId);
    if (!want.has(p.id) && has) p.questionIds = p.questionIds.filter((id) => id !== questionId);
  }
}

export function createQuestion(input) {
  const fields = normalizeQuestion(input);
  const now = new Date().toISOString();
  const q = { id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now };
  const questions = loadQuestions();
  questions.push(q);
  saveQuestions(questions);
  if (Array.isArray(input.playlistIds)) {
    const playlists = loadPlaylists();
    syncMembership(playlists, q.id, input.playlistIds);
    savePlaylists(playlists);
  }
  return q;
}

// Words too common to tell two questions apart.
const FILLER = new Set(
  ('a an and are as by called did do does for how in is it its known many much name of on or ' +
    'the that these this those to was were what which who whom whose with').split(' '),
);

function contentWords(s) {
  const plain = clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return new Set(plain.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)));
}

// Jaccard similarity: shared words over all distinct words.
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * The first bank question a phone submission looks like a copy of, or undefined.
 * Deliberately strict: rewording a question or swapping a few words still
 * matches, at the cost of rejecting some genuinely different questions.
 */
export function findDuplicate(input, questions) {
  const words = contentWords(input.question);
  const key = [...words].sort().join(' ');
  const answer = [...contentWords(input.currentAnswer)].sort().join(' ');
  // TRUE/FALSE answers match half the bank, so they don't count as a shared answer.
  const answerCounts = answer && !['true', 'false'].includes(answer);
  return questions.find((q) => {
    const other = contentWords(q.question);
    if ([...other].sort().join(' ') === key) return true;
    const score = overlap(words, other);
    const sameAnswer = answerCounts && [...contentWords(q.currentAnswer)].sort().join(' ') === answer;
    return score >= 0.6 || (sameAnswer && score >= 0.4);
  });
}

const HTTP_URL = /^https?:\/\/\S+$/i;

/**
 * Save a question written on a player's phone straight into the bank, tagged
 * public and unread. Phones send text-only options; the only media a phone can
 * attach is the question attachment, which it previewed before sending.
 */
export function submitQuestion(input, { name, token }) {
  const fields = normalizeQuestion({
    question: input.question,
    type: input.type,
    currentAnswer: input.currentAnswer,
    options: Array.isArray(input.options) ? input.options.map((o) => ({ text: o?.text })) : [],
    categories: input.categories,
    hint: input.hint,
    explanation: input.explanation,
    attachment: input.attachment,
  });
  if (fields.attachment && !HTTP_URL.test(fields.attachment)) {
    throw new LibraryError(400, 'Question has validation problems.', [
      { field: 'attachment', message: 'Attachment must be an http:// or https:// link.' },
    ]);
  }
  const questions = loadQuestions();
  if (findDuplicate(fields, questions)) {
    throw new LibraryError(409, 'Too close to a question already in the bank.');
  }
  const now = new Date().toISOString();
  const q = {
    id: crypto.randomUUID(),
    ...fields,
    source: 'public',
    submittedBy: name,
    authorToken: token,
    seenAt: null,
    createdAt: now,
    updatedAt: now,
  };
  questions.push(q);
  saveQuestions(questions);
  return q;
}

/** Mark public questions as read. Returns how many changed. */
export function markSeen(ids) {
  const want = new Set(ids);
  const questions = loadQuestions();
  const now = new Date().toISOString();
  let changed = 0;
  for (const q of questions) {
    if (want.has(q.id) && q.source === 'public' && !q.seenAt) {
      q.seenAt = now;
      changed += 1;
    }
  }
  if (changed) saveQuestions(questions);
  return changed;
}

export function updateQuestion(id, input) {
  const questions = loadQuestions();
  const i = questions.findIndex((q) => q.id === id);
  if (i === -1) throw new LibraryError(404, 'Question not found.');
  questions[i] = { ...questions[i], ...normalizeQuestion(input), updatedAt: new Date().toISOString() };
  saveQuestions(questions);
  if (Array.isArray(input.playlistIds)) {
    const playlists = loadPlaylists();
    syncMembership(playlists, id, input.playlistIds);
    savePlaylists(playlists);
  }
  return questions[i];
}

/** Delete from the bank and from every playlist that referenced it. */
export function deleteQuestion(id) {
  const questions = loadQuestions();
  if (!questions.some((q) => q.id === id)) throw new LibraryError(404, 'Question not found.');
  saveQuestions(questions.filter((q) => q.id !== id));
  const playlists = loadPlaylists();
  syncMembership(playlists, id, []);
  savePlaylists(playlists);
}

function playlistName(name, playlists, selfId = null) {
  const n = clean(name);
  if (!n) throw new LibraryError(400, 'Playlist name is required.');
  if (playlists.some((p) => p.id !== selfId && norm(p.name) === norm(n))) {
    throw new LibraryError(400, `A playlist named "${n}" already exists.`);
  }
  return n;
}

export function createPlaylist({ name, ordered = false, questionIds = [] }) {
  const playlists = loadPlaylists();
  const now = new Date().toISOString();
  const p = {
    id: crypto.randomUUID(),
    name: playlistName(name, playlists),
    ordered: !!ordered,
    questionIds: [...new Set(questionIds)],
    createdAt: now,
    updatedAt: now,
  };
  playlists.push(p);
  savePlaylists(playlists);
  return p;
}

/** Rename, toggle ordered, or replace the question list (used for reorder and remove). */
export function updatePlaylist(id, { name, ordered, questionIds }) {
  const playlists = loadPlaylists();
  const p = playlists.find((x) => x.id === id);
  if (!p) throw new LibraryError(404, 'Playlist not found.');
  if (name !== undefined) p.name = playlistName(name, playlists, id);
  if (ordered !== undefined) p.ordered = !!ordered;
  if (questionIds !== undefined) {
    const known = new Set(loadQuestions().map((q) => q.id));
    p.questionIds = [...new Set(questionIds)].filter((qid) => known.has(qid));
  }
  p.updatedAt = new Date().toISOString();
  savePlaylists(playlists);
  return p;
}

/** Append questions to a playlist, skipping ones already in it. */
export function addToPlaylist(id, questionIds) {
  const p = loadPlaylists().find((x) => x.id === id);
  if (!p) throw new LibraryError(404, 'Playlist not found.');
  return updatePlaylist(id, { questionIds: [...p.questionIds, ...questionIds] });
}

/** Removes the playlist only; its questions stay in the bank. */
export function deletePlaylist(id) {
  const playlists = loadPlaylists();
  if (!playlists.some((p) => p.id === id)) throw new LibraryError(404, 'Playlist not found.');
  savePlaylists(playlists.filter((p) => p.id !== id));
}

/** A playlist's questions, in its stored order, in the shape Game Mode expects. */
export function getPlaylistGame(id) {
  const p = loadPlaylists().find((x) => x.id === id);
  if (!p) throw new LibraryError(404, 'Playlist not found.');
  const byId = new Map(loadQuestions().map((q) => [q.id, q]));
  const questions = p.questionIds.map((qid) => byId.get(qid)).filter(Boolean);
  return { name: p.name, ordered: p.ordered, questions, problems: [], total: questions.length };
}

/**
 * Import a CSV from /import into the bank and create a playlist named after it.
 * Rows already in the bank (same question + answer + attachment) are reused, not
 * duplicated, so they join the new playlist without a second copy.
 */
export function importCsv(filePath, fileName) {
  const { questions: rows, problems } = parseCsv(filePath);
  const questions = loadQuestions();
  const byKey = new Map(questions.map((q) => [questionKey(q), q]));
  const now = new Date().toISOString();
  const ids = [];
  let added = 0;
  for (const row of rows) {
    const { id: _rowIndex, ...fields } = row;
    let q = byKey.get(questionKey(fields));
    if (!q) {
      q = { id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now };
      questions.push(q);
      byKey.set(questionKey(q), q);
      added += 1;
    }
    ids.push(q.id);
  }
  saveQuestions(questions);

  const playlists = loadPlaylists();
  const base = fileName.replace(/\.csv$/i, '');
  let name = base;
  for (let n = 2; playlists.some((p) => norm(p.name) === norm(name)); n++) name = `${base} (${n})`;
  const playlist = createPlaylist({ name, ordered: false, questionIds: ids });
  return { playlist, added, reused: ids.length - added, skipped: problems.length };
}

/** A playlist as CSV text in the /import column layout, so it can be shared or played as a file. */
export function playlistCsv(id) {
  const { name, questions } = getPlaylistGame(id);
  const rows = questions.map((q) => {
    const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
    row['Question'] = q.question;
    row['Current Answer'] = q.currentAnswer;
    row['Categories'] = q.categories.join(', ');
    row['Type'] = q.type;
    row['Question Attachments'] = q.attachment;
    row['Points'] = String(q.points);
    row['Hint 1'] = q.hint;
    row['Explanation'] = q.explanation;
    row['question timer delay by secs'] = q.delaySecs ? String(q.delaySecs) : '';
    q.options.forEach((o, i) => {
      if (q.type !== 'True or False') row[`Option ${i + 1}`] = o.text;
      row[`Option ${i + 1} Attachment`] = o.attachment;
    });
    return row;
  });
  return { name, csv: Papa.unparse(rows, { columns: COLUMNS }) + '\n' };
}
