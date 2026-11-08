# Trivia harvester

Pulls trivia questions from open sources and writes them as a Trivia Builder import CSV. The file lands in `import/`, so it shows up in Game Mode and in the Builder's **Import a CSV** straight away. The app needs no changes to use it.

```bash
npm install                                   # once, at the repo root (links this workspace)
npm run harvest -- opentdb --amount 50        # from the repo root
npm run harvest -- --help
```

Every run prints what happened:

```
fetched:   75
skipped:   0 (source data unusable)
duplicate: 3 (already in the bank or import/)
invalid:   0 (rejected by the app's CSV rules)
written:   50 to <repo>/import/Harvest - opentdb - 2026-11-07.csv
```

## Options

| Option | Meaning |
| --- | --- |
| `--amount <n>` | Questions to keep (default 50). Sources fetch extra so duplicates can be dropped. |
| `--category <x>` | Source-specific filter, see each source below. |
| `--path <p>` | Local dataset file or folder (`jeopardy`, `opentriviaqa`). |
| `--out <file>` | Output CSV. Default `import/Harvest - <source> - <date>.csv`, with ` (2)` added if that exists. |
| `--dry-run` | Report what would be written, write nothing. |

## Sources

| Source | Type of questions | Licence | Needs |
| --- | --- | --- | --- |
| `opentdb` | Multiple Choice, True or False | CC BY-SA 4.0 | Network |
| `wikidata` | Multiple Choice: capitals, flag pictures, element symbols | CC0 | Network |
| `opentriviaqa` | Multiple Choice, True or False | CC BY-SA 4.0 | A local clone |
| `jeopardy` | Single Choice (answer out loud) | None: personal use only | A local TSV |

### `opentdb`: Open Trivia DB

[opentdb.com](https://opentdb.com). `--category` is a numeric id from [api_category.php](https://opentdb.com/api_category.php) (e.g. `27` for Animals).

- The API allows one call per IP every 5 seconds and 50 questions per call, so 100 questions (150 fetched, to allow for duplicates) take about 15 seconds.
- A session token is cached in `tools/harvester/.cache/opentdb-token.json`, so each run only gets questions you haven't fetched before. When a category runs out the tool says so; delete that file to start over.

### `wikidata`: generated from Wikidata

Queries live in [src/sources/wikidata/](src/sources/wikidata/) as `.rq` files, one per recipe. `--category` is `capitals`, `flags` or `elements`; leave it out for all three (about 490 questions before duplicates are dropped).

- Wrong options are other answers from the same query: three other capitals, three other countries, three other symbols.
- Skipped on purpose: countries with more than one capital (South Africa, Bolivia), capitals that contain the country name (Mexico City), and items with no English label.
- Flag questions use the Wikimedia Commons image as the question attachment.
- Results are cached for a week in `.cache/`. Set `HARVESTER_USER_AGENT` to add your contact details, as the [Wikimedia User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy) asks.

To add a recipe: write `src/sources/wikidata/<name>.rq` and add an entry to `RECIPES` in [src/sources/wikidata.js](src/sources/wikidata.js) naming the item variable, the answer variable, the category and the question text.

### `opentriviaqa`: OpenTriviaQA

```bash
git clone https://github.com/uberspot/OpenTriviaQA.git ~/datasets/OpenTriviaQA
npm run harvest -- opentriviaqa --path ~/datasets/OpenTriviaQA --category animals
```

`--path` takes the clone, its `categories/` folder, or a single category file. `--category` is a file name in `categories/` (`animals`, `geography`, `video-games`, ...).

### `jeopardy`: Jeopardy clue dataset

Download a TSV from [jwolle1/jeopardy_clue_dataset](https://github.com/jwolle1/jeopardy_clue_dataset/releases) (`combined_season1-42.tsv` has 554,131 clues), then:

```bash
npm run harvest -- jeopardy --path ~/datasets/combined_season1-42.tsv --category Geography
```

- **Personal use only.** The dataset's README says the data is property of Jeopardy Productions and asks that it not be used for a public-facing site, app or product. Don't commit the TSV or harvested Jeopardy CSVs to a public repo.
- Questions read `CATEGORY: clue`, because many clues only make sense with their category. The host's category comment is added in brackets when there is one.
- `--category` filters by the Builder category the tool maps it to. Jeopardy categories are puns, so keywords decide (`WORLD CAPITALS` becomes Geography). About 60% match nothing and become General Knowledge.

## What every source goes through

1. **Map categories** onto the Builder's 22 known ones, so the picker doesn't fill up with source-specific names.
2. **Drop duplicates** against `data/questions.json` and every CSV in `import/` (earlier harvests included), using the Builder's `findDuplicate`, which also catches reworded copies. Picture questions often share their text, so they match on attachment and answer instead.
3. **Credit** the source in `Explanation` when it's empty, which CC BY-SA requires.
4. **Validate** each row with the app's own `parseCsv` before writing. Rows the app would reject are listed and left out.

`Points` is always set (1, or 2 with a hint), because `parseCsv` rewrites a CSV that has blank Points.

## Tests

```bash
npm test     # from the repo root; runs the app's tests and tools/*/test
```

Tests use fixtures in `test/fixtures/` and never touch the network. The Jeopardy fixture is made-up rows in the dataset's format.

## Not included

- Scraping HTML quiz sites: most forbid it in their terms, and their markup changes without notice.
- Writing hints with an LLM: a hint makes a question worth 2 points, but it needs an API key and costs money per question.
