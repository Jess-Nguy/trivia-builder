import { COLUMNS } from '../../../server/csv.js';

// The app shows at most five options (Option 1..5).
const MAX_DISTRACTORS = 4;

export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Turn a harvested question into a CSV row in the /import column layout.
 *
 * Input: { question, type, answer, distractors?, categories?, attachment?, hint?, explanation? }
 * where type is 'Single Choice', 'Multiple Choice' or 'True or False'. `credit`
 * fills Explanation when the source gave none (CC BY-SA attribution).
 */
export function toRow(q, { credit = '', random = Math.random } = {}) {
  const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
  row['Question'] = q.question;
  row['Type'] = q.type;
  row['Categories'] = (q.categories || []).join(', ');
  row['Question Attachments'] = q.attachment || '';
  row['Hint 1'] = q.hint || '';
  row['Explanation'] = q.explanation || credit;
  // Set explicitly: parseCsv rewrites the file when Points is blank.
  row['Points'] = String(q.hint ? 2 : 1);

  if (q.type === 'True or False') {
    row['Current Answer'] = String(q.answer).toUpperCase();
  } else {
    row['Current Answer'] = q.answer;
  }
  if (q.type === 'Multiple Choice') {
    const options = shuffle([q.answer, ...(q.distractors || []).slice(0, MAX_DISTRACTORS)], random);
    options.forEach((text, i) => {
      row[`Option ${i + 1}`] = text;
    });
  }
  return row;
}
