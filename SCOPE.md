# Scope Lock Document — Trivia Builder

> Project Agreement 2026 — single-builder edition (no second-person review).

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| **Project Name** | Trivia Builder |
| **Builder** | Jess Nguyen |
| **Client (Reviewer)** | N/A — personal project, self-reviewed |
| **Start Date** | 02 / 06 / 2026 |
| **Target Done Date** | TBD (realistic estimate, not binding) |
| **Project #** | trivia-builder-v1 |
| **One-line description** | A localhost web app that imports trivia questions from a CSV and runs a host-controlled couch-party trivia night with manual scoring. |

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| **Language(s)** | JavaScript (Node.js + browser) |
| **Framework(s)** | Express (backend API) · Vue 3 + Vite (frontend) |
| **Database** | None — CSV files only, stored in `/import`. Files are either overwritten or created new. |
| **External APIs / Services** | None required. Media questions may reference external image/video/audio URLs. |
| **Hosting / Deploy** | Localhost only (`npm run dev`). Not deployed publicly — single-user personal use. |
| **Other tools** | A CSV parser (e.g. `papaparse` or `csv-parse`) on the backend. No auth, no login. |

---

## 3. New Skills

Core skills to implement and be able to explain in plain English. These make the project worthwhile beyond a CRUD app.

| # | Skill Name | How it is used as a core part of this project |
|---|-----------|------------------------------------------------|
| 1 | **CSV-as-datastore parsing & validation** | Reading the `/import` folder, parsing a flexible trivia schema (multi-value categories, four question types, conditional-required fields), and validating each row against type-specific rules instead of relying on a database. |
| 2 | **A keyboard-driven game state machine** | A front-end flow engine that moves Game Mode → Question → Answer Reveal → (Manual Scoreboard) → … → Final Scores, driven by both mouse and number-key/Enter keybindings, with per-question timers and conditional screen-skipping. Keybindings cover both answering and fast manual scoring. |

---

## 4. Feature List (In Scope)

Every feature that must be complete. Be specific — vague features cause disputes.

| # | Feature Name | Description | Passed review when... |
|---|-------------|-------------|------------------------|
| 1 | **CSV import & schema parse** | Backend reads CSV files from `/import`. Columns: `Question, Option 1..5, Current Answer, Categories, Type, Question Attachments, Points, Hint 1, Option 1..5 Attachment, Explanation, question timer delay by secs`. `Categories` may be comma-separated. The older `Attachments` header is still read as a fallback. | A valid CSV loads and every row is parsed into a question object with its type, options (each `{text, attachment}`), categories (as a list), points, hint, question attachment, explanation, and reading delay. |
| 2 | **Row validation** | Required fields: `Question`, `Current Answer`, `Type`. `Points` is optional — when blank it defaults by hint presence (hint → 2, none → 1) and is written back to the CSV; when present it must be numeric. `Type` ∈ {`Single Choice`, `Multiple Choice`, `True or False`} (legacy `… w/ Media` names are accepted and folded into the base type). Options required **only** for `Multiple Choice` (≥2). `True or False` ignores options (front-end hardcodes TRUE/FALSE). `Single Choice` needs only `Current Answer`. An option counts as present when **either** its text or its `Option N Attachment` is filled. | Invalid rows are reported clearly (which row, which rule) and don't crash the app; valid rows are accepted. |
| 3 | **Game Mode setup screen** | Form with: number of teams/users (number, min 1, max 8); CSV file dropdown (lists all files in `/import`); number of questions (number, default 1, min 1, max = total rows in selected file; **disabled until a file is selected**); per-question timer (number seconds, default 0 = no timer, max 300); checkboxes "record points", "record how many hints taken", "hints subtracts points"; START GAME button. | All constraints enforced in the UI; the question-count field is disabled/uninteractable until a file is chosen, then clamps to the file's row count. |
| 4 | **Team/user setup** | Based on the number entered (1–8), create that many teams/users with default names ("Team/User 1"…) and a default avatar/color each. | Starting a game produces exactly N players carried through to scoreboard and final score. |
| 5 | **Question selection** | On START GAME, pick the requested number of questions from the chosen CSV (random sample by default). | Exactly the requested count is played, drawn from the selected file with no duplicates. |
| 6 | **Question screen — common** | Shows the question's `Categories`, a question number/counter, and an optional timer in the corner. A "HINT?" button appears **only if** `Hint 1` is non-empty; clicking reveals the hint (and counts a hint if hint-recording is on). Advance via SUBMIT button (mouse) or a keybinding (Enter). | Categories render; hint button is present only when a hint exists; both mouse and keyboard advance the question. |
| 7 | **Multiple Choice rendering** | Render `Option 1..5` (only non-empty ones) as numbered choices `1)…5)`. Each option is selectable by clicking or pressing its number key. Option order **may be randomized** (Multiple Choice only). | All present options show, are number-keyed, and a selection is visually indicated; randomization applies only to Multiple Choice. |
| 8 | **True or False rendering** | Front-end hardcodes TRUE / FALSE as the two numbered options regardless of the CSV option columns. | TRUE/FALSE always show and are selectable by key/click. |
| 9 | **Single Choice rendering** | No clickable options. Show the question (and media, if any). Host reads aloud, players answer verbally; SUBMIT (mouse) or Enter proceeds to the Answer Reveal screen. | The question (and media) renders with no options; SUBMIT/Enter advances to Answer Reveal. |
| 10 | **Media rendering** | Render the `Question Attachments` value as an image, video (≤1 min), or audio (≤1 min) based on its type — for **any** question type, not just a dedicated media type. YouTube URLs (watch/youtu.be/embed/shorts, optional start time) embed via the privacy-enhanced host; other URLs resolve to image/video/audio by extension. Video/YouTube **autoplays** and the YouTube title bar is masked so a thumbnail/title can't leak the answer; images load with `referrerpolicy="no-referrer"`. | A question with an image attachment renders its image; a video/audio/YouTube URL renders the appropriate player and autoplays. |
| 11 | **Per-question timer** | If timer > 0, count down from that value each question; reset per question. On reaching 0, auto-advance to the Answer Reveal screen. Timer = 0 means no timer shown. | With a timer set, each question counts down and auto-advances at 0; with 0, no timer appears. |
| 12 | **Answer Reveal screen** | After SUBMIT (or timer expiry) on **any** question type, a dedicated screen shows the `Categories`, the question, "Answer was: " + the full `Current Answer` (including any explanation text), and — for choice types — re-lists the options. NEXT (mouse or Enter) proceeds to the Manual Scoreboard, or straight to the next question if the scoreboard is skipped. | Every question type shows an answer screen with the full `Current Answer`; choice types re-list their options; NEXT advances correctly. |
| 13 | **Manual Scoreboard screen** | Appears after the Answer Reveal to award points. Header shows two labels: `Award points: <the question's Points>` and `Hint assignment: <number of hints to distribute this question>` (i.e. how many hints were taken on this question, available to assign to players). Per player: `+/-` points control (default award = the question's `Points`) and `+/-` hint-count control. "record points" toggles the points control; "record how many hints taken" toggles the hint control. **If both are unchecked, this screen is skipped entirely** (flow goes straight to the next question). **Keyboard scoring** for speed: number keys `1–8` select the active player; up/down (or `+`/`-`) adjust that player's points by the question's point value; a separate key pair adjusts their hint count; Enter = NEXT. | Adjusting points/hints by **mouse or keyboard** persists into the final tally; both header labels render with the correct numbers; the screen is skipped when both record toggles are off. |
| 14 | **Final Scores screen** | Table of every player with: points, number of hints taken, total score. If "hints subtracts points" is on, total = points − hints (one point per hint, per current rule). Declares the winner (highest total). NEXT returns to the Game Mode screen. | Totals compute correctly with and without hint subtraction; the highest total is named the winner; NEXT returns to Game Mode. |
| 15 | **Early exit / End Game** | An "End Game" button is available on every play screen (Question, Answer Reveal, Manual Scoreboard). Clicking it asks for confirmation, then ends the game immediately and jumps to Final Scores with the tally so far. | The button shows on all play screens (not on Game Mode / Final Scores); confirming ends the game and shows current scores; cancelling stays in place. |

> Add more rows as needed.

| 16 | **Correct/wrong announcement + conditional scoreboard** | On the Answer Reveal page, announce whether the selected option was correct or wrong, highlight the correct option (and strike the chosen-wrong one), and show the `Explanation`. Then: **wrong + no hint taken → skip the Manual Scoreboard** (no one scores, nothing to record); **wrong + a hint was taken → show the scoreboard but lock points** (only the hint counter is active); **correct → scoreboard as normal**. Grading is **auto-detected per row**: a Multiple Choice / True or False question is graded only when `Current Answer` exactly matches one of its options (or is `TRUE`/`FALSE`). Open-answer types, and messy rows whose answer doesn't exactly match, fall back to the normal manual scoreboard. | Verdict + explanation + option highlighting show for gradable choice questions; skip/lock logic behaves per the rules above; messy/open-answer rows are unaffected. |

**CSV convention for full grading (`Explanation` column):** add an optional `Explanation` column and keep `Current Answer` as the *exact* answer only — for Multiple Choice it should exactly equal one of the option strings; for True or False it is `TRUE`/`FALSE`; for open-answer types it is the short exact answer. Move the long prose from `Current Answer` into `Explanation` (shown on the Answer Reveal page). The app reads `Explanation` when present and grades any row whose `Current Answer` is an exact match — so a cleaned CSV grades every choice question, while the current file keeps working (ungraded rows just go to the manual scoreboard).

### Features added after the initial v1 build

These shipped after the original scope was locked. Listed here so the document tracks the app as built.

| # | Feature Name | Description | Passed review when... |
|---|-------------|-------------|------------------------|
| 17 | **Universal + per-option attachments** | `Single Choice w/ Media` was retired: a media question is just a `Single Choice` (or any type) with a `Question Attachments` value, so Multiple Choice and True or False can also carry question media. New `Option 1..5 Attachment` columns attach media to individual options (Multiple Choice / True or False); an option is valid with text, an attachment, or both. Legacy `… w/ Media` type names are accepted for backward compatibility. | Any type renders its question attachment; options render their per-option media; an image-only option is selectable. |
| 18 | **Points backfill** | `Points` is optional. A blank value defaults by hint presence (hint → 2, none → 1) and the defaulted value is written back into the CSV so it persists. | A row with blank Points loads with the defaulted value and the file is updated on disk. |
| 19 | **Category filter (Game Mode)** | The selected file's categories render as checkboxes with a "Select all"; the play pool is narrowed to the chosen categories. Questions with no category fall into an `Uncategorized` bucket. The question-count clamps to the filtered pool. | Picking categories changes the pool size and the count cap; deselecting all blocks START; uncategorized questions stay playable. |
| 20 | **Custom team/user names** | Each team slot has an editable name (blank = default `Team/User N`), persisted to localStorage across reloads and rounds. Duplicate names (case-insensitive) are blocked before starting. | Names persist across reload, carry into Scoreboard/Final Scores, and a duplicate name prevents START. |
| 21 | **Per-question reading delay** | A `question timer delay by secs` column opens the question in a reading phase (question + media shown, options/buttons hidden) counting down that many seconds before answering begins. `Space` skips it. The answer timer starts only after the delay. | A row with a delay shows the reading countdown first, then reveals options; Space skips straight to answering. |
| 22 | **Fullscreen toggle & autoplay media** | A fullscreen toggle is available on every screen. Video/YouTube media autoplays and the YouTube title bar is masked so a paused thumbnail or title can't reveal the answer; images load with `referrerpolicy="no-referrer"`. | The toggle enters/exits fullscreen on any screen; YouTube media autoplays with its title hidden. |
| 23 | **Background music** | A **Background music** picker on Game Mode lists YouTube tracks from `import/background audio.csv` (`link,title`; excluded from the questions-file list). The chosen track loops and plays across all screens via the YouTube IFrame API; a bottom-right control offers mute + volume, and the choice/volume/mute persist to localStorage. The music **auto-pauses** while a question's own YouTube/video/audio media is on screen and resumes afterward. | A track loops and survives screen changes; mute/volume work; selecting *None* stops it; question video pauses the music and it resumes after. |
| 24 | **Audio-only YouTube media** | For "name this song" questions where the video would spoil the answer, a YouTube link tagged with `#audio` (or `&audio=1`) plays as audio only: the video runs hidden via the IFrame API while the screen shows a compact audio player (play/pause, progress bar, elapsed/total time). Works for question and per-option attachments, honours an optional start time, and counts as sound media so background music auto-pauses for it. Autoplays on landing where the browser allows; the play button always works as a direct user action. | A `…#audio` YouTube attachment renders the audio player with no visible video; play/pause and the progress/time work; background music pauses while it's on screen. |

---

## 5. Out of Scope

Explicitly NOT required for v1. Protects against scope creep.

| # | Feature Name | Description |
|---|-------------|-------------|
| 1 | Multiple hints per question | Support for more than one hint column per question. |
| 2 | Dynamic points / hint subtraction | Configurable point values or hint-penalty amounts beyond the fixed rules. |
| 3 | ~~"Multiple Choice Media" question type~~ | *Now in scope (Feature 17): any question type — including Multiple Choice — can carry question and per-option media, so a separate type isn't needed.* |
| 4 | Multi-user / auth | No login, accounts, or multiple concurrent users — single host on localhost. |
| 5 | Persistent scoreboard storage | No saving of past game results or scoreboards. |
| 6 | All-questions browse/view page | A page listing every question in a file. |
| 7 | Playlists | Building a play set from selected/manually-created questions. |
| 8 | In-app question authoring | Creating new questions inside the app (and syncing them to an all-questions view). |
| 9 | Play-from-playlist mode | Play mode reading from a saved playlist rather than a CSV. |

---

## 6. Definition of Done — Pre-Build / Pre-Ship Checklist

Complete before calling v1 finished.

- ☐ All in-scope features from Section 4 are built and working.
- ☐ Both new skills from Section 3 are implemented as core parts of the project.
- ☐ No known in-scope bugs remain.
- ☐ I can explain both new skills clearly in plain English.
- ☐ Code is pushed to a GitHub repository with real commit history (no one-shot dumps).
- ☐ App runs cleanly from a documented `npm` command on localhost.
- ☐ README documents how to add a CSV to `/import` and start a game.

---

*Trivia Builder — Scope Lock Document 2026 (single-builder edition).*
