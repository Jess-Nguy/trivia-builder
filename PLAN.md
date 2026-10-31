# Trivia Builder — Build Plan

A phased timeline an AI coding agent can follow top-to-bottom. Each phase lists **tasks**, the **deliverable**, and **how to verify** before moving on. Build phases in order — each depends on the previous. Commit at the end of every phase.

**Stack:** Node + Express (backend) · Vue 3 + Vite (frontend) · CSV files in `/import` and JSON files in `data/`, no database.

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
- Common header: categories, question counter, timer slot, SHOW HINT / HIDE HINT toggle only when `hint` is non-empty (the first show counts the hint for this question; hiding and re-showing doesn't count it again).
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
- After the Answer Reveal, show one card per player with `+/-` points (default award = question's `Points`) and `+/-` hint count. Each player is capped separately (up to the question's `Points`, and up to the hints taken), so several players can get the same award or hint charge.
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
- Two themes: game-show stage (light) and neon game night (dark), with colour tokens, WCAG contrast checks, and a motion budget (inventory comment at the top of `client/src/style.css`).
- Couch-play aids: toolbar (text size, theme, `?` shortcut list, fullscreen), letter keys, question progress, timer bar, leader tag, ranked final scores, timer pause; stage backdrop, title plaque, and contestant podiums on Scoreboard and Final Scores.
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

## Phase 10 — Game modes (planned, not built)

Ideas taken from the [Halloween Heist trivia site](https://halloween-heist.vais-mahendran.workers.dev/), adapted for a host running the game on a TV. Its UI flair (verdict stamp with quips, wrong-answer shake, streak counter, rank title, missed-question review, confetti) already shipped; these are the modes still to build.

**Tasks**
- **Hard mode (type it):** a Game Mode toggle that hides the options on Multiple Choice and True or False questions, so the room has to recall the answer. The host types what the room said (or presses `No idea`) and the app grades it with forgiving matching: ignore case, punctuation and a leading "the/a/an", and accept a small typo distance. The Answer Reveal gets an **"Actually, they were right / wrong"** button that flips the grade, because typed answers will be right in other words. A flip must also flip the streak, accuracy and missed list (the store's `lastGrade` snapshot already supports undoing a grade). Single Choice questions behave as today.
- **Put-in-order question type:** a new CSV `Type` of `Order`, where `Option 1..5` hold the items in the correct order and the Question screen shows them shuffled. Pressing an item's letter (or clicking it) adds it to the next slot, clicking a placed item removes it, and `Lock it in` / `Reset` act on the whole order. The reveal shows each slot right or wrong and "3 of 4 in the right spot"; it counts as correct only when every slot matches. Validation: at least 2 items.
- **Study mode:** a third Game Mode choice next to Competition and Showcasing that pages through the selected file and categories as flashcards: question first, then `Space` flips to the answer and explanation. No scoring, no timer, and it does **not** mark questions as played, so studying never shrinks the game pool.
- **Length presets:** `10`, `20` and `All` quick buttons beside "How many questions?", clamped to the filtered pool like the number field.

**Open questions before building**
- Hard mode: should showcasing mode allow it, or is it competition-only? The reference grades every typed answer, but showcasing never grades.
- Order type: what does `Current Answer` hold, the joined order (`A → B → C`) or a copy of Option 1? It is still a required column.

**Deliverable:** Each mode behind its own Game Mode control, with SCOPE acceptance rows added when built.
**Verify:** Hard mode grades "the pacific ocean" as correct for `Pacific Ocean` and the override flips the streak; an `Order` row shuffles, locks, and reports per-slot results; Study mode pages through without changing the unplayed count.

---

## Phase 11 — Question Builder & playlists (built)

See SCOPE §4 Feature 28.

**Tasks**
- **Bank + playlists backend** (`server/library.js`): `data/questions.json` and `data/playlists.json`, atomic writes, `normalizeQuestion` validation that mirrors `parseCsv`, playlist membership by question id, CSV import with dedupe, playlist CSV export.
- **API** (`server/apiHandler.js`): `GET /api/library`; `POST/PUT/DELETE /api/library/questions[/:id]`; `POST/GET/PUT/DELETE /api/library/playlists[/:id]`, `POST …/:id/add`, `GET …/:id/csv`; `POST /api/library/import`.
- **Builder screen** (`Builder.vue`, `QuestionEditor.vue`, `CategoryPicker.vue`): playlists column, filterable question list with bulk add, type-aware editor.
- **Game Mode**: playlists in the questions dropdown (value `playlist:<id>`, so CSV names and their played history are unchanged); `store.startGame` keeps order for ordered playlists.

**Tests:** `npm test` (`test/library.test.js`, against the 316-question CSV).
**Verify:** Create a playlist, save a Multiple Choice question into it, import a CSV twice (second import adds 0), reorder an ordered playlist, start a game from it and see the first question in saved order; exported CSV parses back to identical questions.

---

## Phase 12 — Phone play (built)

See SCOPE §4 Feature 29.

**Tasks**
- **Relay** (`server/game.js`): a `GameHub` with one room per server and a 4-letter code. Only a loopback connection can host. Phones join with the code and a token and pick a team. The hub forwards answers to the host, crediting the phone's own team, and sends each phone the host's state with every other team's answer removed. `attachGameSocket` serves it on `/ws/game` on Vite's and Express's HTTP servers.
- **API guard** (`server/apiHandler.js`): `/api/...` returns 403 to non-loopback clients; `GET /api/lan` gives the LAN addresses for the join URL.
- **Host** (`client/src/multiplayer.js`): connects when phone play is ticked, publishes a snapshot of the store (answer included only from the reveal on), and feeds phone answers into `store.receiveAnswer`.
- **Store**: `settings.phones`, `teamAnswers`, `answersOpen`, `receiveAnswer`, `setTeamCorrect`; `afterAnswer` pre-awards points; phone play skips the room-wide grade.
- **Screens**: Game Mode join panel (`JoinPanel.vue`, QR from `qrcode`); Question lock-in chips and REVEAL ANSWER; Answer Reveal team verdicts with `1`–`8` override; phone app at `/play` (`client/src/phone/PhoneApp.vue`).
- `npm run party` = dev server with `--host`.

**Tests:** `test/game.test.js` (relay), `test/store-phones.test.js` (store).
**Verify:** `npm run party`, tick phone play, join from two phones on different teams, answer differently, reveal: each phone shows its own verdict; flip one with `1`; NEXT pre-fills the Scoreboard with the question's points for the team marked right.

---

## Phase 13 — Player-written questions (planned)

Players add questions from their phones on topics they know, to stump the rest of the room. Their questions go straight into the bank, tagged so the host can tell them apart, and play in regular games as well as a dedicated mode. Built in four steps; each ships on its own.

**Data model.** Phone submissions are saved to `data/questions.json` with `source: 'public'`, `submittedBy` (the player's nickname), `authorToken` (the phone's player token) and `seenAt: null`. A question without `source` is a host question, so the existing bank needs no migration. `authorToken` is never sent to any phone except its owner.

**Step 1 — Submit from a phone**
- **Nickname**: the phone join screen asks for a nickname (kept in localStorage with the token). The hub stores it on the phone's record.
- **Submit message**: a `{ t: 'submit', question }` socket message. The hub validates it with `normalizeQuestion` and replies `submitted` or `rejected` with field problems, so the phone form shows the same errors as the Builder. The library API stays loopback-only.
- **Submission window**: the hub accepts submissions only while the host's phase is `lobby`, `reveal`, `scores` or `final`. During `question` the phone hides the form and keeps the draft, so nothing typed is lost.
- **Duplicate check**: strict on purpose, since the players are friends and a false rejection costs little. Normalise text (lowercase, strip accents and punctuation, drop filler words like "the", "what", "which", "is") and reject when the normalised question matches an existing one, the content-word overlap (Jaccard) is 0.6 or more, or the answer matches and the overlap is 0.4 or more. The rejection says "Too close to a question already in the bank" without quoting it, so it can't leak bank questions.
- **Attachments with preview**: the phone form shows the attachment through `Media.vue` as soon as a URL is typed. Submit stays disabled until the preview loads (`load` for images and video, `onReady` for YouTube) and the player ticks "Preview looks right". A preview that errors blocks submission. The server only accepts `http(s)` URLs.
- **Builder**: an **Unread (N)** badge and a Host / Public / Unread filter. Opening a public question in the editor sets `seenAt`; **Mark all read** clears the badge. Public questions show "by <name>" in the list.
- **Reveal**: a public question's reveal shows "Written by <name>". The author's phone shows "You wrote this one" instead of the answer buttons.

**Step 2 — My questions and phone playlists**
- The phone lists its own questions (matched by `authorToken`) and groups them into playlists saved with `source: 'public'` and `createdBy`. Name clashes get the player's name added, e.g. "Pokémon (Sam)".

**Step 3 — Browse the bank (host setting)**
- Game Mode setting **Phones can browse the question bank**, off by default. The host sends `{ t: 'config', browse, hiddenIds }`; the hub refuses `browse` requests while it's off.
- Browse results are built on the server and carry only `id`, `question`, `categories`, `type` and `submittedBy`: never `currentAnswer`, `options`, `hint` or `explanation`.
- `hiddenIds` is the current game's question pool, left out of browse results so players can't look ahead and search for answers.
- Browsed questions can be added to the player's own playlists.

**Step 4 — Stump the room mode**
- A Game Mode choice that plays tonight's public questions, rotating between authors.
- The author's team can't answer its own question. The author's team earns the question's points when at least one team but not every team gets it right; nothing when every team gets it or nobody does. This rewards hard but fair questions over impossible ones.

**Out of this phase:** editing or deleting from the phone after submitting (do it in the Builder), and voting on questions.

**Tests:** `test/game.test.js` for the submit window, nickname, `authorToken` stripping and the browse guard; `test/library.test.js` for the duplicate check and the public fields.
**Verify:** Join from a phone with a nickname, submit a question in the lobby and see it in the Builder under Unread; submit the same question reworded and see it rejected; start a question and see the form hide with the draft kept; type a broken image URL and see Submit stay disabled; play the public question and see "Written by" on the TV and "You wrote this one" on the author's phone.

---

## Suggested commit checkpoints

One commit per phase (`feat: phase N — <name>`), so the history reads as real incremental progress, not a one-shot dump.
