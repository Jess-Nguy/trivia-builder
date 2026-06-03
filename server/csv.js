import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const IMPORT_DIR = path.resolve(__dirname, '..', 'import');

// Canonical question types. Keys are lowercased for matching; values are display labels.
const TYPES = {
  'single choice': 'Single Choice',
  'multiple choice': 'Multiple Choice',
  'true or false': 'True or False',
  'single choice w/ media': 'Single Choice w/ Media',
};

const COLUMNS = [
  'Question', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5',
  'Current Answer', 'Categories', 'Type', 'Attachments', 'Points', 'Hint 1',
  // Optional: prose shown on the Answer Reveal page. Keeping it separate lets
  // `Current Answer` stay an exact answer for grading.
  'Explanation',
];

/** List every .csv filename in the import directory. */
export function listFiles() {
  if (!fs.existsSync(IMPORT_DIR)) return [];
  return fs
    .readdirSync(IMPORT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b));
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
 */
export function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });

  const questions = [];
  const problems = [];

  data.forEach((raw, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based
    const get = (col) => clean(raw[col]);

    const question = get('Question');
    const currentAnswer = get('Current Answer');
    const rawType = get('Type');
    const rawPoints = get('Points');
    const type = TYPES[rawType.toLowerCase()];

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
    const points = Number(rawPoints);
    if (!rawPoints) {
      rowProblems.push({ field: 'Points', message: 'Points is required.' });
    } else if (!Number.isFinite(points)) {
      rowProblems.push({ field: 'Points', message: `Points must be a number (got "${rawPoints}").` });
    }

    const options = [
      get('Option 1'), get('Option 2'), get('Option 3'), get('Option 4'), get('Option 5'),
    ].filter(Boolean);

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
      attachment: get('Attachments'),
      points,
      hint: get('Hint 1'),
      explanation: get('Explanation'), // optional column; '' when absent
    });
  });

  return { questions, problems, total: questions.length };
}

export { COLUMNS, TYPES };
