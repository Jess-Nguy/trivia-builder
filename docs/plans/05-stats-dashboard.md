# 05: Stats dashboard and popularity board

Part of the [hosted Trivia Builder roadmap](00-roadmap.md). Build order: **5th**.

## Goal

Record every question played: in which game, from which playlist, and how many teams got it right. Each account gets a dashboard for its own questions and playlists; everyone gets a popularity board of public ones. Miss rates are stored now so difficulty can be scaled later.

Done when: after two games, the dashboard shows correct play counts and miss rates for the questions played, the public board ranks a public question played by two accounts above one played twice by one account, and BACK on the Answer Reveal never double-counts.

## Decisions

- **One row per question per game, recorded when the host leaves the Answer Reveal** (`afterAnswer()` in `apps/builder/client/src/store.js`). By then the host has finished flipping team verdicts (`setTeamCorrect`), so the counts match what the room agreed. Rejected: recording on reveal (`submitQuestion`), which would need an undo for `backToQuestion()` and would miss later verdict flips.
- **Upsert on `(game_id, question_id)`.** If NEXT fires twice, or the host goes BACK and reveals again, the row is replaced, not duplicated.
- **The host browser reports the result and the server trusts it.** The host already owns game state (the relay only forwards it). A host could inflate their own stats; among friends that's an accepted limit. [06](06-online-rooms.md)'s remote mode moves grading to the server, and its events become server-recorded.
- **Popularity counts distinct host accounts and distinct games, not raw plays**, over the last 30 days. Otherwise one host replaying a playlist every night tops the board.
- **Miss rate needs at least 10 graded answers before it's shown.** With 3 answers one wrong team reads as 33%. The dashboard shows "not enough plays yet" below that.
- **No automatic difficulty scaling yet.** The numbers are collected and shown; using them to pick questions is a later feature (see *Left out*).

## Depends on / unlocks

- **Depends on:** [01](01-database.md) (storage interface), [03](03-site-password-and-accounts.md) (host account), [04](04-question-visibility.md) (which questions are public).
- **Unlocks:** a future difficulty setting in Game Mode.

## Data model

New migration, table `play_events`:

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | |
| `game_id` | uuid | One per `startGame()`, made in the browser with `crypto.randomUUID()` |
| `host_id` | uuid | The account that hosted (from the session, not the request body) |
| `question_id` | uuid | |
| `question_owner_id` | uuid | Copied at record time, so the owner dashboard doesn't need a join through tombstones |
| `playlist_id` | uuid null | Null when the game wasn't from a playlist |
| `mode` | text | `competition`, `showcasing`, later `remote` |
| `graded` | bool | False for showcasing, open-answer questions the host didn't mark, and ungradable rows |
| `answers` | int | Teams that answered (phone play), or 1 for a room-wide graded answer, or 0 |
| `correct` | int | Of those, how many were right after host overrides |
| `played_at` | timestamptz | |

Unique `(game_id, question_id)`. Indexes on `(question_id)`, `(question_owner_id, played_at)`, `(playlist_id, played_at)`.

JSON mode stores the same rows in `data/play-events.json` through the JSON adapter, with `host_id` and `question_owner_id` set to `'local'`. Questions from a raw CSV file (JSON mode only) have no id and aren't recorded.

## Steps

### Step 1: record plays

- `store.js`: `startGame()` sets `this.gameId = crypto.randomUUID()`. `afterAnswer()` calls a new `reportPlay()` before moving on, which posts to `POST /api/stats/play` with `{ gameId, questionId, playlistId, mode, graded, answers, correct }`. Fire-and-forget: a failed post logs to the console and never blocks the game.
- Counting `answers` and `correct`:
  - Phone play: teams with an entry in `teamAnswers`, and how many have `correct: true`.
  - Room-wide competition answer (no phones, gradable question): 1 and 0/1 from `isCorrect`.
  - Otherwise `graded: false`, 0 and 0.
- `apps/builder/server/apiHandler.js` route and `recordPlay(hostId, event)` in a new `apps/builder/server/stats.js`. The server sets `host_id` from the session and `question_owner_id` from the question row; it refuses question ids not available to the host ([04](04-question-visibility.md)'s rule), and clamps `correct <= answers <= 8` (`MAX_TEAMS` in `game.js`).

### Step 2: owner dashboard

- `GET /api/stats/mine?range=30d|all`: for the caller's own questions and playlists.
  - **Questions:** times played (distinct games), graded answers, miss rate (`1 - correct/answers`, shown only when `answers >= 10`), last played.
  - **Playlists:** games started from it, questions played from it, and how many other accounts played it (public playlists only).
- A **Dashboard** screen reached from a toolbar button, with two tables (sortable by plays and by miss rate) and a range switch. Clicking a question opens it in the Builder editor.
- "Most missed" and "Never played" quick filters, since those are the lists a host acts on: fix a confusing question, or play the forgotten ones.

### Step 3: public popularity board

- `GET /api/stats/popular?range=30d`: public, not deleted questions and playlists only, ranked by distinct host accounts, then distinct games. Each row shows title, owner display name, accounts, games, and miss rate when it clears the minimum.
- Rows go through `publicView` from [04](04-question-visibility.md); the board never shows private questions, even as counts.
- A **Popular** tab on the Dashboard screen, with **Add to playlist…** on each question row.

### Step 4: difficulty signal (data only)

- `difficulty(question)` in `stats.js` returns `easy` (miss rate below 30%), `medium`, `hard` (70% or more), or `null` under 10 answers. Shown as a chip in the Builder list. Thresholds are constants at the top of the file.

## Security

- `host_id` always comes from the session, never the body, so an account can't record plays under someone else's name.
- The owner dashboard filters by `question_owner_id = caller`. A friend who played my private question as a guest in my room doesn't see it on their dashboard: guests have no account in the room, and hosts only see their own questions.
- Rate-limit `POST /api/stats/play` to 120/minute per account; a real game posts one per question.

## Tests

- `apps/builder/test/store-phones.test.js`: `afterAnswer()` reports the right `answers`/`correct` after a `setTeamCorrect` flip; `backToQuestion()` then a second reveal reports once per `gameId` (fake `fetch`).
- `apps/builder/test/stats.test.js`: upsert replaces; clamping; refused unavailable question; popularity ordering (two hosts beat one host twice); miss rate hidden under 10; `difficulty()` thresholds; private questions never in `popular`.
- Run: `npm test`.

## Verify

1. Play a 5-question phone game with 2 teams; flip one verdict on the reveal; go BACK once on another question. Dashboard: 5 questions, 1 game each, correct counts match the flips.
2. Showcasing game: plays counted, miss rate unchanged.
3. Account B plays A's public playlist once and A plays it twice. On **Popular**, a public playlist played once each by two accounts ranks above it.
4. Make a question private: it leaves **Popular**, stays on A's dashboard.

## Docs to update

- `README.md`: *Dashboard* section (what's counted, when, the 10-answer minimum).
- `SCOPE.md`: §5 row 5 "Persistent scoreboard storage" stays out (scores aren't saved, only per-question stats); add a feature row for stats.
- `PLAN.md`: tick Phase 20.

## Open questions

- Should a game's played questions also count toward stats when a game is ended early with **End game**? (Proposed: yes, each question reaches `afterAnswer()` independently.)
- Is 30 days the right default window for the public board?

## Left out

- Using difficulty to pick questions (a Game Mode "difficulty" filter). Needs a few months of data to tune; the chip in step 4 shows whether the numbers look sensible first.
- Saving final scores and team names. SCOPE §5 row 5 keeps scoreboards out, and team names are personal party data.
- Per-player stats. Phone players have no accounts.
