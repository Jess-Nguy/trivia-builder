import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const IMPORT_DIR = path.resolve(__dirname, '..', 'import');

// Reserved CSV that holds background-music tracks (link,title), not questions.
// Excluded from the question-file list and read separately (see listAudioTracks).
const AUDIO_FILE = 'background audio.csv';

// Canonical question types. Keys are lowercased for matching; values are display labels.
const TYPES = {
  'single choice': 'Single Choice',
  'multiple choice': 'Multiple Choice',
  'true or false': 'True or False',
};

// Legacy type names accepted for backward compatibility and folded into a
// canonical type. `Single Choice w/ Media` was retired: any question can now
// carry a `Question Attachments` value (shown regardless of type), so a media
// question is just a Single Choice with an attachment.
const TYPE_ALIASES = {
  'single choice w/ media': 'Single Choice',
  'multiple choice w/ media': 'Multiple Choice',
};

const resolveType = (raw) => TYPES[raw] || TYPE_ALIASES[raw];

const COLUMNS = [
  'Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5',
  'Current Answer', 'Categories', 'Type', 'Question Attachments', 'Points', 'Hint 1',
  // Per-option media: a URL shown next to the matching option (Multiple Choice
  // and True or False). An option is valid with text, an attachment, or both.
  'Option 1 Attachment', 'Option 2 Attachment', 'Option 3 Attachment',
  'Option 4 Attachment', 'Option 5 Attachment',
  // Optional: prose shown on the Answer Reveal page. Keeping it separate lets
  // `Current Answer` stay an exact answer for grading.
  'Explanation',
  // Optional: seconds to pause before the question is "live" — the host reads it
  // aloud while options stay hidden. 0 or blank means no delay.
  'question timer delay by secs',
];

/** List every .csv filename in the import directory. */
export function listFiles() {
  if (!fs.existsSync(IMPORT_DIR)) return [];
  return fs
    .readdirSync(IMPORT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .filter((f) => f.toLowerCase() !== AUDIO_FILE)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Read the background-audio track list from `background audio.csv` (columns
 * `link,title`). Returns [{ link, title }] for rows with a non-blank link, or an
 * empty array when the file is absent — so the picker simply offers "None".
 */
export function listAudioTracks() {
  const filePath = path.resolve(IMPORT_DIR, AUDIO_FILE);
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });
  return data
    .map((row) => ({ link: clean(row.link), title: clean(row.title) }))
    .filter((t) => t.link);
}

/** Resolve a requested filename to a safe path inside IMPORT_DIR, or null if it escapes. */
export function resolveImportPath(name) {
  const resolved = path.resolve(IMPORT_DIR, name);
  if (resolved !== IMPORT_DIR && !resolved.startsWith(IMPORT_DIR + path.sep)) return null;
  return resolved;
}

const clean = (v) => (v == null ? '' : String(v).trim());

/**
 * Parse and validate a CSV file.
 * Returns { questions, problems, total } — valid rows become question objects,
 * invalid rows are reported in `problems` (with the 1-based CSV row number) and skipped.
 *
 * Rows with a blank `Points` get a default (see below). When that happens the
 * defaulted value is written back into the CSV so the data is persisted for next time.
 */
export function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { data, meta } = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });

  const questions = [];
  const problems = [];
  let backfilled = false; // set when we default a blank Points and need to rewrite the file

  data.forEach((raw, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based
    const get = (col) => clean(raw[col]);

    const question = get('Question');
    const currentAnswer = get('Current Answer');
    const rawType = get('Type');
    const rawPoints = get('Points');
    const hint = get('Hint 1');
    const type = resolveType(rawType.toLowerCase());

    const rowProblems = [];
    if (!question) rowProblems.push({ field: 'Question', message: 'Question is required.' });
    if (!currentAnswer) rowProblems.push({ field: 'Current Answer', message: 'Current Answer is required.' });
    if (!rawType) {
      rowProblems.push({ field: 'Type', message: 'Type is required.' });
    } else if (!type) {
      rowProblems.push({
        field: 'Type',
        message: `Invalid Type "${rawType}". Must be one of: ${Object.values(TYPES).join(', ')}.`,
      });
    }
    // Points are optional: when blank, default by hint presence — a question with
    // a hint is easier to guess, so it's worth 2; one without is worth 1. The
    // defaulted value is written back into the row so it persists to the file.
    let points;
    if (!rawPoints) {
      points = hint ? 2 : 1;
      raw['Points'] = String(points);
      backfilled = true;
    } else {
      points = Number(rawPoints);
      if (!Number.isFinite(points)) {
        rowProblems.push({ field: 'Points', message: `Points must be a number (got "${rawPoints}").` });
      }
    }

    // Reading delay (seconds): a non-negative number the host can use to read
    // the question aloud before options appear. Invalid/blank values are a
    // problem only when present and non-numeric; otherwise they default to 0.
    const rawDelay = get('question timer delay by secs');
    let delaySecs = 0;
    if (rawDelay) {
      const n = Number(rawDelay);
      if (!Number.isFinite(n) || n < 0) {
        rowProblems.push({
          field: 'question timer delay by secs',
          message: `Timer delay must be a non-negative number (got "${rawDelay}").`,
        });
      } else {
        delaySecs = n;
      }
    }

    // Each option carries optional text and an optional media attachment. An
    // option "exists" when either is filled — so an image-only option (no text)
    // is still a valid, selectable choice.
    let options;
    if (type === 'True or False') {
      // The two choices are fixed; attachments map positionally to TRUE/FALSE.
      options = [
        { text: 'TRUE', attachment: get('Option 1 Attachment') },
        { text: 'FALSE', attachment: get('Option 2 Attachment') },
      ];
    } else {
      options = [1, 2, 3, 4, 5]
        .map((n) => ({ text: get(`Option ${n}`), attachment: get(`Option ${n} Attachment`) }))
        .filter((o) => o.text || o.attachment);
    }

    // Options are required only for Multiple Choice.
    if (type === 'Multiple Choice' && options.length < 2) {
      rowProblems.push({
        field: 'Options',
        message: 'Multiple Choice questions need at least 2 options.',
      });
    }

    if (rowProblems.length > 0) {
      rowProblems.forEach((p) => problems.push({ row: rowNum, ...p }));
      return;
    }

    const categories = get('Categories')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    questions.push({
      id: i,
      question,
      options,
      currentAnswer,
      categories,
      type,
      // `Question Attachments` is the current header; older files used `Attachments`.
      attachment: get('Question Attachments') || get('Attachments'),
      points,
      hint,
      explanation: get('Explanation'), // optional column; '' when absent
      delaySecs, // reading-delay seconds before options appear (0 = none)
    });
  });

  // Persist any defaulted Points back to the CSV so the data is there next time.
  if (backfilled) {
    const csv = Papa.unparse(data, { columns: meta.fields });
    fs.writeFileSync(filePath, csv + '\n');
  }

  return { questions, problems, total: questions.length };
}

export { COLUMNS, TYPES };
