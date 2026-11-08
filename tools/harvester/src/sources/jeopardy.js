import fs from 'node:fs';
import readline from 'node:readline';
import { shuffle } from '../row.js';

// Jeopardy categories are puns and themes, so match on keywords. First match wins.
const KEYWORDS = [
  [/\bANIMAL|\bBIRDS?\b|\bDOGS?\b|\bCATS?\b|\bFISH|\bINSECT|\bZOO/, 'Animal'],
  [/\bBIOLOG|\bANATOMY|\bHUMAN BODY|\bMEDIC/, 'Biology'],
  [/\bCHEMI|\bELEMENT/, 'Chemistry'],
  [/\bPHYSIC/, 'Physics'],
  [/\bSPACE\b|\bASTRONOM|\bPLANET|\bSTARS?\b/, 'Space'],
  [/\bGEOLOG|\bROCKS?\b|\bVOLCANO|\bMINERAL/, 'Geology'],
  [/\bSCIENCE|\bSCIENTIST/, 'General Science'],
  [/\bTECH|\bCOMPUTER|\bINVENT|\bINTERNET/, 'Technology'],
  [/\bMATH|\bNUMBER/, 'Math/Numbers'],
  [/\bBIBLE|\bBIBLICAL|\bMYTH|\bRELIGIO|\bGODS?\b|\bSAINTS?\b/, 'Religion & Mythology'],
  [/\bPRESIDENT|\bPOLITIC|\bLAWS?\b|\bCONGRESS|\bGOVERNMENT|\bSUPREME COURT/, 'Politics/Laws'],
  [/\bHISTOR|\bWAR\b|\bWARS\b|\bCENTURY|\bANCIENT|\bEMPIRE/, 'History'],
  [/\bGEOGRAPH|\bCAPITALS?\b|\bCOUNTR|\bLAKES?\b|\bRIVERS?\b|\bISLANDS?\b|\bCITIES|\bSTATES?\b|\bMOUNTAIN/, 'Geography'],
  [/\bSPORT|\bOLYMPI|\bBASEBALL|\bFOOTBALL|\bBASKETBALL|\bHOCKEY|\bGOLF|\bTENNIS|\bNFL\b|\bNBA\b/, 'Sports'],
  [/\bWORDS?\b|\bVOCAB|\bLANGUAGE|\bLETTER|\bSPELL|\bRHYME|\bHOMONYM|\bLATIN|\bFRENCH|\bABBREV/, 'Language'],
  [/\bBUSINESS|\bECONOM|\bMONEY|\bCOMPANIES|\bBRAND/, 'Finance/Economic'],
  [/\bGAMES?\b|\bTOYS?\b|\bVIDEO GAME/, 'Games'],
  [/\bLITERA|\bBOOKS?\b|\bAUTHOR|\bNOVEL|\bPOET|\bPOEM|\bSHAKESPEARE|\bART\b|\bARTISTS?\b|\bPAINT/, 'Arts & Literature'],
  [/\bMOVIE|\bFILM|\bTV\b|\bTELEVISION|\bMUSIC|\bSONG|\bSINGER|\bBROADWAY|\bOPERA|\bACTOR|\bACTRESS|\bOSCAR|\bROCK\b|\bPOP\b|\bCELEB/, 'Entertainment'],
];

export function categoryFor(jeopardyCategory) {
  const upper = jeopardyCategory.toUpperCase();
  return KEYWORDS.find(([re]) => re.test(upper))?.[1] || 'General Knowledge';
}

// The dataset escapes quotes (\" and \') and has a few stray trailing backslashes.
const unescape = (s) => s.replace(/\\(["'/])/g, '$1').replace(/\\+$/, '').trim();

/**
 * One row of jwolle1/jeopardy_clue_dataset as a Single Choice question, or null.
 * In Jeopardy terms the dataset's `answer` column is the clue and `question` is
 * the response. The category stays in the question text because many clues only
 * make sense with it ("4-LETTER WORDS: ...").
 */
export function toQuestion(row) {
  const clue = unescape(row.answer || '');
  const response = unescape(row.question || '');
  const category = unescape(row.category || '');
  if (!clue || !response) return null;
  const comments = unescape(row.comments || '').replace(/^\((.*)\)$/, '$1');
  return {
    question: `${category}${comments ? ` (${comments})` : ''}: ${clue}`,
    type: 'Single Choice',
    answer: response,
    categories: [categoryFor(category)],
  };
}

/**
 * Stream the TSV and keep a uniform random sample of `size` usable clues
 * (reservoir sampling), so the whole file never sits in memory as objects.
 * The file has no quoting, so lines split on tabs directly.
 */
export async function sampleTsv(file, size, { category, random = Math.random } = {}) {
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null;
  let seen = 0;
  let unusable = 0;
  const sample = [];
  for await (const line of lines) {
    if (!line) continue;
    const cells = line.split('\t');
    if (!header) {
      header = cells;
      if (!header.includes('answer') || !header.includes('question')) {
        throw new Error(`${file} is not a jeopardy_clue_dataset TSV (needs answer and question columns)`);
      }
      continue;
    }
    const q = toQuestion(Object.fromEntries(header.map((h, i) => [h, cells[i]])));
    if (!q) {
      unusable += 1;
      continue;
    }
    if (category && q.categories[0].toLowerCase() !== category.toLowerCase()) continue;
    seen += 1;
    if (sample.length < size) sample.push(q);
    else {
      const j = Math.floor(random() * seen);
      if (j < size) sample[j] = q;
    }
  }
  return { sample, unusable };
}

export default {
  // No open licence: the dataset README asks that it not be used for public-facing products.
  credit: 'Source: jwolle1/jeopardy_clue_dataset, Jeopardy! data for personal use only',

  async harvest({ amount, category, path: file }) {
    if (!file) throw new Error('jeopardy needs --path to a TSV from github.com/jwolle1/jeopardy_clue_dataset');
    if (!fs.existsSync(file)) throw new Error(`jeopardy --path not found: ${file}`);
    const { sample, unusable } = await sampleTsv(file, amount * 2, { category });
    return { questions: shuffle(sample), skipped: Array.from({ length: unusable }, () => ({ reason: 'empty clue or response' })) };
  },
};
