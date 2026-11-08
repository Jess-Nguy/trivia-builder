## Context

The game runs on questions I write by hand or players write on their phones, and the bank has 318. This adds a tool that pulls questions from open sources on the internet and writes them as a normal `import/` CSV, so they show up in Game Mode and the Builder's **Import a CSV** with no app changes. It's also the first package of a monorepo of trivia tools: `tools/` is an npm workspace, and the app stays at the root for now.

```bash
npm install
npm run harvest -- opentdb --amount 50
```

What it adds:
- **Four sources:**
  - `opentdb`: the Open Trivia DB API. A cached session token means reruns only get unseen questions.
  - `wikidata`: SPARQL recipes for capitals, flag pictures and element symbols.
  - `opentriviaqa`: a local clone of the GitHub repo.
  - `jeopardy`: a local TSV from jwolle1/jeopardy_clue_dataset, for personal use only.
- **One pipeline for all of them:**
  1. Map source categories onto the 22 known ones.
  2. Drop anything already in the bank or `import/` with the Builder's `findDuplicate`.
  3. Credit the source in `Explanation`.
  4. Run every row through the app's own `parseCsv` before writing.

Results from real runs:

| Source | Run | Result |
| --- | --- | --- |
| `opentdb` | `--amount 5` | 8 fetched, 0 rejected |
| `wikidata` | all recipes | 482 written: 197 flags, 167 capitals, 118 elements. 21 skipped as ambiguous or giveaways, 9 already in the bank |
| `opentriviaqa` | `animals` file | 1,366 parsed, 0 skipped, 1 already in the bank |
| `jeopardy` | full 544k-line TSV | 100 sampled in 1.9 s, peak memory 245 MB |

## Road not taken

- **Scraping HTML quiz sites.** Most forbid it in their terms, and their markup changes without notice. APIs and open datasets only.
- **The old jService Jeopardy JSON dump.** It's no longer maintained. jwolle1/jeopardy_clue_dataset has 554,131 clues, was updated in October 2026, and already removes clues that need images or audio.
- **Moving the app into `apps/builder/` in this PR.** It would bury the new code under hundreds of renames. It's PLAN.md Phase 14 step 2, a rename-only PR next.
- **A new `Source` column for attribution.** `importCsv` would drop it, so the credit goes in `Explanation` when that's empty.
- **CSV formula escaping (`escapeFormulae`).** It would prefix `'` to any cell starting with `=`, `+`, `-` or `@`, and that text would then show in the game.
- **Writing hints with an LLM.** A hint makes a question worth 2 points, but it needs an API key and costs per question. Better as its own tool.

## Known worst case to check

- **Big batches are slow.** `findDuplicate` re-tokenises every existing question for each candidate, so time grows with batch size times bank size. Jeopardy dry runs: 500 questions in 4.1 s, 2,000 in 17.5 s. 10,000 in one run would take minutes. For game-night batches it doesn't matter; if it starts to, cache the tokenised words in `dedupe.js`.
- **Jeopardy categories.** They're puns, so a keyword list maps them, and about 60% end up as General Knowledge.
- **Countries with several capitals** (South Africa, Bolivia, ...) are skipped, so there are no capital questions for them.
- **Not played in a browser yet.** Every row passes the same `parseCsv` Game Mode uses, and a Builder import was checked in code, but no harvested question has been played on screen.

## Manual testing

1. `npm install` at the root, then `npm run harvest -- opentdb --amount 20`. The summary lists fetched, skipped, duplicate and invalid counts and the file it wrote to `import/`.
2. `npm run dev`, pick the new `Harvest - opentdb - <date>` file in Game Mode, and play two questions. Options and grading behave like any CSV.
3. In the Builder, **Import a CSV** with that file: 20 added. Import it again: 0 added.
4. `npm run harvest -- wikidata --category flags --amount 5`, then play one. The flag shows as the question image.
5. Rerun step 1 with `--dry-run`: questions from the first run show up as duplicates.

## Automated testing

`npm test` passes 131 tests, 44 of them new, from `tools/harvester/test/`. They use fixtures and make no network calls; the Jeopardy fixture is made-up rows in the dataset's format.
- `row.test.js`: option shuffling and the 5-option cap, TRUE/FALSE casing, Points, the credit, and `validateRows` rejecting bad rows.
- `dedupe.test.js`: reworded copies, repeats within a batch, picture questions told apart by attachment, and the limit. `loadExisting` reads the bank and CSVs and leaves the CSVs unchanged.
- One file per source covering parsing, category mapping and skip rules. The OpenTDB tests use a stubbed `fetchJson` to check the token and response codes.

End to end on the real repo: a wikidata harvest into `import/`, a rerun reported all 20 as duplicates, and `importCsv` into a temp bank added 20, then 0. The test file was deleted afterwards.

## Where this is documented

- **How to run it, sources, licences, options:** [tools/harvester/README.md](tools/harvester/README.md).
- **The repo layout and how to harvest:** the root README, near the top and in *Harvesting questions from the internet*.
- **Acceptance criteria:** SCOPE §4 Feature 31. HTML scraping is listed as out of scope (#11).
- **Next step (the move to `apps/`):** PLAN.md Phase 14.
- **Why each choice was made:** this description and the commit bodies.

## Interoperability and impact

- The root `package.json` gains `"workspaces": ["tools/*"]`. Run `npm install` once after pulling to link it. `client/` is still installed with `npm --prefix client install`.
- `npm test` now also runs `tools/*/test/*.test.js`.
- No app code changes. The harvester imports `server/csv.js` and `server/library.js` by relative path; step 2 turns that into a workspace import.
- The harvester never writes to `data/`. It only reads it, and only writes new files into `import/`.
- **Licences:** Open Trivia DB and OpenTriviaQA are CC BY-SA 4.0, credited in each row. Wikidata is CC0. The Jeopardy dataset is for personal use only, so don't commit harvested Jeopardy CSVs to a public repo.

## Deployment

None. This is a local tool; pull and run `npm install`.

## `/personal-pragmatic-review`

**Verdict:** ✅ Clean, after two fixes made during the review (commit `3933e6e`).

Good: each piece of knowledge is in its natural home. The "why" is in commit bodies, how-to is in the harvester README, and the code has short what-comments. Every commit is one concern with a conventional title. Docs were updated in the same branch.

Fixed during the review:
- `tools/harvester/test/dedupe.test.js` (one concern per test): the `loadExisting` test checked both reading the files and not changing them. It's now two tests.
- `tools/harvester/src/sources/jeopardy.js:58` (no volatile metrics in comments): removed "80 MB" from a comment.

Non-blocking:
- `tools/harvester/src/*.js` import `../../../server/...` by relative path. This is temporary until step 2 makes the app a workspace package; don't copy the pattern into new tools.
- `dedupe.js`: the duplicate check grows quadratically with batch size, as covered under *Known worst case*.

## `/security-review`

No vulnerabilities at confidence 8/10 or higher.

Checked and found sound:
- No `child_process`, `eval` or shell calls in the harvester.
- Outbound requests only go to hardcoded HTTPS hosts (`opentdb.com`, `query.wikidata.org`). The OpenTDB `--category` must be numeric, and SPARQL comes from fixed `.rq` files, so there is no query injection.
- Cache and output file names are built from fixed strings, the source key and the date.
- Harvested text reaches the browser only through Vue's escaped bindings. The app's only `v-html` is the locally generated QR SVG.
- The only harvested attachments are Wikidata P41 Commons links, upgraded to https. `Media.vue` binds them to `<img>`/`<video>`/`<audio>` `src`, where `javascript:` doesn't run.
- The OpenTDB session token is anonymous and kept in the gitignored `tools/harvester/.cache/`.

Low-severity notes, below the reporting threshold. Neither is fixed in this PR:
- **CSV formula injection (3/10).** A source cell starting with `=` would act as a formula if the harvested CSV were opened in Excel instead of imported. The `playlistCsv` export already has the same property. See *Road not taken* for why `escapeFormulae` isn't used.
- **Attachment schemes (existing gap).** `parseCsv` doesn't apply the http(s) check that `submitQuestion` does. The harvester only writes Commons https links, so it isn't a new way in.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
