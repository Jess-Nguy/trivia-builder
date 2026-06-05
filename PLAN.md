# Trivia Builder — Build Plan

A phased timeline an AI coding agent can follow top-to-bottom. Each phase lists **tasks**, the **deliverable**, and **how to verify** before moving on. Build phases in order — each depends on the previous. Commit at the end of every phase.

**Stack:** Node + Express (backend) · Vue 3 + Vite (frontend) · CSV files in `/import`, no database.

**Reference:** [SCOPE.md](SCOPE.md) is the source of truth for features and acceptance criteria. The sample data is `import/Trivia Mix - June 2 2026.csv`.

---

## Phase 0 — Scaffolding

**Tasks**
- Init Node project (`package.json`), add `express` and a CSV parser (`papaparse` or `csv-parse`).
- Scaffold Vue 3 + Vite app in `client/`.
- Folder layout: `server/` (Express), `client/` (Vue), `import/` (CSVs — already exists).
- Serve the API as Vite dev-server middleware so dev is a single process on one port (`npm run dev`). Reuse the same handler in Express for production (`npm start`) — no proxy, no `concurrently`.
- `.gitignore` for `node_modules`, build output, `.DS_Store`.

**Deliverable:** `npm run dev` serves a blank Vue page and the API responds on its port.
**Verify:** Browser shows the Vue starter; `GET /api/health` returns 200.

---

## Phase 1 — CSV backend

**Tasks**
- `GET /api/files` → list every `.csv` filename in `/import`.
- `GET /api/files/:name` → parse that CSV and return an array of question objects:
  `{ question, options: [1..5 non-empty], currentAnswer, categories: string[], type, attachment, points, hint }`.
- Parse `Categories` by splitting on commas and trimming.
- **Validation** (per SCOPE §4 Feature 2): required `Question`, `Current Answer`, `Type`, `Points`; valid `Type` enum; options required only for `Multiple Choice`. Return parsed rows plus a list of validation problems (row index + rule), don't throw.

**Deliverable:** Working file-list and file-parse endpoints.
**Verify:** `GET /api/files` lists the June-2 file; parsing it returns ~90 questions with correct types and category arrays; a deliberately broken row surfaces a clear validation message.

---

## Phase 2 — Game state & routing skeleton

**Tasks**
- Set up Vue Router (or a simple state-driven view switch) with screens: `GameMode`, `Question`, `AnswerReveal`, `Scoreboard`, `FinalScores`.
- Central game store (Pinia or a reactive module) holding: settings, players, the selected question list, current index, per-question hints-taken count, and per-player tallies (points, hints).
- Define the flow state machine: GameMode → Question → AnswerReveal → (Scoreboard if recording) → next Question → … → FinalScores → GameMode.

**Deliverable:** Can navigate between empty screens; store holds and resets game state.
**Verify:** Manually stepping the index advances screens in the right order, including skipping Scoreboard when both record flags are off.

---

## Phase 3 — Game Mode screen

**Tasks** (per SCOPE §4 Features 3–5)
- Number of teams/users: number input, min 1 / max 8.
- CSV dropdown populated from `GET /api/files`.
- Number of questions: number input, default 1, min 1, max = parsed row count; **disabled until a file is selected**, then clamp.
- Per-question timer: number input, default 0, max 300.
- Checkboxes: record points, record hints, hints subtract points.
- START GAME: build players (1–8 with default names + avatar/color), random-sample the requested number of questions, populate the store, go to first Question.

**Deliverable:** Fully constrained setup form that launches a game.
**Verify:** Question-count field stays disabled until a file is chosen and never exceeds the row count; START GAME produces N players and the requested number of questions.

---

## Phase 4 — Question & Answer Reveal screens

**Tasks** (per SCOPE §4 Features 6–10, 12)
- Common header: categories, question counter, timer slot, HINT? button only when `hint` is non-empty (reveals hint; increments the per-question hints-taken count + the hint tally if hint-recording on).
- **Multiple Choice:** render non-empty options as `1)…5)`, selectable by click or number key; option order randomizable.
- **True or False:** hardcode TRUE/FALSE as the numbered options.
- **Single Choice:** no options.
- **Media:** render the question's `Question Attachments` as image / video / audio (for any type). See Phase 9 for per-option media and YouTube/autoplay handling added post-v1.
- SUBMIT advances to the **Answer Reveal** screen (mouse) and also bind Enter.
- **Answer Reveal screen:** show categories, the question, "Answer was: " + full `Current Answer`, and re-list options for choice types. NEXT (mouse/Enter) → Scoreboard (or next question if skipped).

**Deliverable:** Each of the three types renders, and SUBMIT leads to the answer screen.
**Verify:** Walk one question of each type from the sample file; the media question renders its image; hint button appears only where a hint exists; the Answer Reveal screen shows the full answer for every type.

---

## Phase 5 — Timer & keybindings

**Tasks** (per SCOPE §4 Feature 11)
- If timer > 0, count down per question, reset each question, auto-advance at 0 (reveal first for open-answer, then proceed). Timer 0 = hidden.
- Number keys select options; Enter submits/advances. Ensure bindings are scoped to the Question screen and cleaned up on leave.

**Deliverable:** Timed and keyboard-only play.
**Verify:** A 10s timer counts down and auto-advances; playing a full round using only the keyboard works end to end.

---

## Phase 6 — Manual Scoreboard

**Tasks** (per SCOPE §4 Feature 13)
- Header labels: `Award points: <question Points>` and `Hint assignment: <hints taken this question>`.
- After the Answer Reveal, show one card per player with `+/-` points (default award = question's `Points`) and `+/-` hint count.
- "record points" toggles the points control; "record hints" toggles the hint control.
- **Skip this screen entirely if both record flags are off.**
- **Keyboard scoring:** number keys `1–8` select the active player; up/down (or `+`/`-`) adjust their points by the question's point value; a separate key pair adjusts their hint count; Enter = NEXT.
- NEXT writes adjustments into the store and advances.

**Deliverable:** Working per-player scoring between questions, by mouse and keyboard.
**Verify:** Awards persist into totals via both mouse and keyboard; both header labels show correct numbers; screen is skipped when both flags are off; shown when either is on.

---

## Phase 7 — Final Scores

**Tasks** (per SCOPE §4 Feature 13)
- Table of all players: points, hints taken, total score.
- If "hints subtracts points" is on, total = points − hints; else total = points.
- Name the winner (highest total). NEXT returns to Game Mode (reset state).

**Deliverable:** Final tally + winner.
**Verify:** Totals correct with and without hint subtraction; correct winner; NEXT returns to a clean Game Mode.

---

## Phase 8 — Polish & docs

**Tasks**
- Edge cases: empty `/import`, malformed CSV, requesting more questions than exist (already clamped), media URL that fails to load.
- Basic styling to match the wireframe layout (cards, big readable question text for couch viewing).
- README: how to drop a CSV in `/import`, the required columns, and `npm run dev`.
- Confirm the Definition of Done checklist in SCOPE.md.

**Deliverable:** A polished, documented, runnable v1.
**Verify:** Fresh clone → `npm install` → `npm run dev` → play a full game from the sample CSV with no console errors.

---

## Phase 9 — Post-v1 enhancements

Built after the initial v1 was complete (see SCOPE §4 Features 17–23). Each shipped on its own branch/PR.

**Tasks**
- **Question-type refactor + attachments:** retire `Single Choice w/ Media`; let **any** type carry `Question Attachments`; add per-option `Option 1..5 Attachment` columns (Multiple Choice / True or False), where an option is valid with text, an attachment, or both. Keep legacy `… w/ Media` type names working.
- **Points backfill:** make `Points` optional — default a blank value by hint presence (hint → 2, none → 1) and write it back to the CSV.
- **Media hardening:** extract YouTube ids (watch/youtu.be/embed/shorts + start time) and embed via the privacy-enhanced host; autoplay video/YouTube and mask the YouTube title bar so the answer can't leak; add `referrerpolicy="no-referrer"` to images.
- **Category filter:** on Game Mode, list the file's categories as checkboxes (+ "Select all"), filter the play pool, bucket category-less questions as `Uncategorized`, and clamp the question count to the filtered pool.
- **Custom team names:** editable per-slot names persisted to localStorage, carried across rounds, with case-insensitive duplicate prevention.
- **Reading delay:** support a `question timer delay by secs` column that shows the question/media with options hidden for a countdown (Space skips) before the answer timer starts.
- **Fullscreen toggle:** a global button to enter/exit fullscreen on every screen.
- **Background music:** a Game Mode picker fed by `import/background audio.csv` (`link,title`, kept out of the questions-file list); the chosen YouTube track loops across all screens via the IFrame Player API in a persistent component (mounted in `App.vue`, off-screen iframe). Add a bottom-right mute/volume control, persist the choice to localStorage, and auto-pause the music while a question's own YouTube/video/audio is on screen (a shared `youTubeId` helper extracted from `Media.vue`; a store counter tracks sound media).

**Deliverable:** The enhancements above, each verifiable against its SCOPE acceptance row.
**Verify:** Per-feature checks in SCOPE §4 Features 17–23 pass; the sample CSVs in `/import` load and play with media, categories, custom names, and reading delays; a background track loops, mutes/adjusts volume, and pauses for question video.

---

## Suggested commit checkpoints

One commit per phase (`feat: phase N — <name>`), so the history reads as real incremental progress, not a one-shot dump.
