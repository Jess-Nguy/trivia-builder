# 01: Database (Supabase Postgres, JSON kept for offline)

Part of the [hosted Trivia Builder roadmap](00-roadmap.md). Build order: **1st**.

## Goal

Questions, playlists, played history and play stats live in Supabase Postgres when the app is hosted, and in the existing JSON files when it runs offline on localhost. Both sit behind one async storage interface, so every later feature is written once.

Done when: `npm test` passes on the JSON adapter, the same contract tests pass against a local Supabase, and the current bank (321 questions, 4 playlists) plays from Postgres.

## Decisions

- **Supabase Postgres** for hosted mode. Rejected: SQLite (needs a persistent disk on the app host), Turso (one more vendor for no gain once Supabase Auth is in, see [03](03-site-password-and-accounts.md)).
- **Keep JSON offline mode** behind the same interface, picked by `TRIVIA_STORAGE=json|supabase` (default `json`). Rejected: Supabase-only, because party play on home Wi-Fi with no internet must keep working.
- **The server talks to Postgres directly** with the [`postgres`](https://github.com/porsager/postgres) package (tagged-template queries are always parameterized, and it supports transactions). `@supabase/supabase-js` is used only for Auth in [03](03-site-password-and-accounts.md). Rejected: querying tables through supabase-js/PostgREST, because playlist reorder and CSV import need multi-row transactions that PostgREST can only do through hand-written RPC functions.
- **The browser never queries Supabase.** No Supabase URL or key ships in the client bundle. RLS is enabled on every table with no policies, so the public Data API returns nothing even if a key leaks. The server's direct connection uses a database role that bypasses RLS, so owner scoping is enforced in the storage code (see *Security*).
- **One-time migration** of `data/questions.json` and `data/playlists.json` into Jess's account, and a harvester `--to-db` flag. In hosted mode the app stops reading `import/`; CSVs come in through an upload in the Builder.

## Depends on / unlocks

- **Depends on:** nothing.
- **Unlocks:** every other doc. [03](03-site-password-and-accounts.md) adds real owners, [04](04-question-visibility.md) uses `visibility`, [05](05-stats-dashboard.md) uses `play_events`, [06](06-online-rooms.md) reads questions per room owner.

## Data model

All tables get `created_at timestamptz default now()`; editable ones also get `updated_at`. IDs are `uuid default gen_random_uuid()`, except `questions.legacy_id` which keeps the JSON id so the migration is re-runnable.

| Table | Columns (beyond timestamps) | Notes |
| --- | --- | --- |
| `profiles` | `id uuid` (= `auth.users.id`), `display_name text`, `is_admin bool default false` | Created in step 1 with no rows; [03](03-site-password-and-accounts.md) fills it on sign-up. |
| `questions` | `id`, `owner_id uuid → profiles`, `legacy_id text unique`, `question`, `options jsonb` (array of `{text, attachment}`), `current_answer`, `categories text[]`, `type`, `attachment`, `points int`, `hint`, `explanation`, `delay_secs int`, `visibility text check in ('private','public') default 'private'`, `copied_from uuid null`, `source text check in ('host','phone') default 'host'`, `submitted_by text`, `author_token text`, `seen_at timestamptz`, `question_key text not null` | Same fields `normalizeQuestion` in `apps/builder/server/library.js` produces, snake-cased. `source` is renamed from today's `'public'` value; see *Watch out*. `question_key` is `questionKey()` from `library.js`, set by the server on every write; `unique (owner_id, question_key)` makes the exact-duplicate rule hold even when two saves race. |
| `playlists` | `id`, `owner_id`, `legacy_id`, `name`, `ordered bool`, `visibility` | `unique (owner_id, lower(name))`, matching `playlistName()`'s clash rule. |
| `playlist_items` | `playlist_id`, `question_id`, `position int` | PK `(playlist_id, question_id)`. Order lives in `position`, not an array, so a reorder is one transaction. |
| `played_history` | `owner_id`, `source_key text` (`playlist:<id>` or a CSV name), `question_key text` | Replaces the `trivia-played-questions` localStorage key in hosted mode. `question_key` is `questionKey()` from `apps/builder/client/src/store.js`. |
| `play_events` | Defined in [05](05-stats-dashboard.md) | Created there, not here. |

`owner_id` is `not null`. In JSON mode the adapter fills every owner with the constant `'local'`, so the same scoping code runs.

## Steps

Each step is its own branch and PR.

### Step 1: async storage interface on the JSON adapter (no Supabase yet)

- Move the file I/O out of `apps/builder/server/library.js` into `apps/builder/server/storage/json.js`. `library.js` keeps validation (`normalizeQuestion`, `findDuplicate`, `submitQuestion`'s checks) and calls the adapter.
- `apps/builder/server/storage/index.js` exports `getStorage()`, choosing the adapter from `TRIVIA_STORAGE`.
- Every exported library function becomes `async` and takes an `ownerId` first argument (`'local'` for now): `getLibrary`, `createQuestion`, `updateQuestion`, `deleteQuestion`, `markSeen`, `submitQuestion`, `createPlaylist`, `updatePlaylist`, `addToPlaylist`, `deletePlaylist`, `getPlaylistGame`, `importCsv`, `playlistCsv`.
- Update callers: every branch of `apiMiddleware` in `apps/builder/server/apiHandler.js` awaits; `GameHub.submit` in `apps/builder/server/game.js` awaits `this.library.submitQuestion` and the `bank` object's `categories()` becomes async. The fake bank in `apps/builder/test/game.test.js` returns promises.
- **Exact duplicates in the Builder.** `createQuestion` and `updateQuestion` refuse a question whose `questionKey` (question, answer and attachment, trimmed and case-insensitive; already in `library.js`) matches another question in the same owner's bank. They throw `LibraryError(409)` with `duplicateId`, and `QuestionEditor.vue` shows "Already in your bank" with an **Open it** button. Only exact matches: the fuzzy `findDuplicate` stays for phone submissions, because near-matches written in the Builder are often deliberate (the same prompt with a different picture). Today the Builder has no check; CSV import already reuses exact matches. See [04](04-question-visibility.md) *Duplicates* for the cross-account cases.
- This is the riskiest step: a missed `await` returns a Promise that `JSON.stringify` turns into `{}`, so the API answers 200 with an empty body. Grep every call site; the tests in step 1 must hit each endpoint.
- Rename the phone-written marker from `source: 'public'` to `source: 'phone'`. Today it appears in `submitQuestion` and `markSeen` (`apps/builder/server/library.js`), `isPublic` in `apps/builder/client/src/screens/Builder.vue`, the "Written by" line in `apps/builder/client/src/screens/AnswerReveal.vue`, the author check in `apps/builder/client/src/multiplayer.js`, and a fixture in `apps/builder/test/library.test.js`. Rename `isPublic` to `isPhone` and the Builder's "Public" filter label to "Phone" while there. `json.js` maps old `'public'` values to `'phone'` on read, so `data/questions.json` needs no hand edit.

### Step 2: schema and the Supabase adapter

- Add the Supabase CLI config: `supabase/config.toml` (from `supabase init`) and `supabase/migrations/<timestamp>_init.sql` with the tables above, `alter table ... enable row level security` on each, and indexes on `questions(owner_id)`, `questions(visibility)`, `playlist_items(question_id)`.
- `apps/builder/server/storage/supabase.js` implements the same interface with `postgres` tagged templates. Every query that reads or writes owned rows has `where owner_id = ${ownerId}`.
- Env: `SUPABASE_DB_URL` (the pooler connection string, session mode), read only on the server. Add `.env.example` with placeholder values; `.env` is already in `.gitignore`.
- Local development: `npx supabase start` (Docker) gives a local Postgres on port 54322; `npx supabase db reset` reapplies migrations.

### Step 3: migration script

- `tools/migrate-json/` as a new workspace (`npm run migrate-json -- --owner <profile-uuid>`). Reads `data/questions.json` and `data/playlists.json`, upserts on `legacy_id`, so running it twice changes nothing.
- Until [03](03-site-password-and-accounts.md) exists there is no real account; the script accepts `--owner` and step 3 of [03](03-site-password-and-accounts.md) reruns it with Jess's real profile id.
- Prints counts: `321 questions, 4 playlists, N playlist items`. Fails loudly if any row fails `normalizeQuestion` or collides on `(owner_id, question_key)`. The bank had 0 exact duplicates on 2026-11-24, so a collision means something changed since.

### Step 4: CSV in hosted mode, harvester `--to-db`

- Builder: an **Upload CSV** button posting the file body to a new `POST /api/library/import-upload` (text body, capped by the existing 1 MB `MAX_BODY`). Parsing reuses `parseCsv`, which today takes a file path; split it into `parseCsvText(text)` plus the existing path wrapper in `apps/builder/server/csv.js`.
- In hosted mode `/api/files` and `/api/files/:name` return 404, and the Game Mode dropdown shows playlists only. JSON mode is unchanged.
- `tools/harvester/src/cli.js` gets `--to-db --owner <uuid>`: same pipeline, but `write.js` inserts through the storage interface into a new playlist named like the CSV it would have written. Duplicate checks (`findDuplicate`) then run against that owner's bank instead of `import/`. Exact matches in the owner's bank are reused, as `importCsv` does; other accounts' public questions are never matched, so an import always builds the owner's own bank.

## Security

- **Owner scoping is the main control.** The direct connection bypasses RLS, so a missing `owner_id` filter leaks every account's questions. Rule for every adapter method: `ownerId` is a required argument and appears in the `where` clause. The contract tests include a two-owner test per method.
- No secrets in the client bundle: grep `apps/builder/client/dist` for `supabase` after `npm run build`.
- `SUPABASE_DB_URL` and the Supabase secret key stay in env vars, never in the repo. See [02](02-security-and-hosting.md) for where they live in production.

## Tests

- `apps/builder/test/storage-contract.js` (not a `*.test.js`, so it isn't run directly): one suite of behaviours every adapter must pass, exported as `runContract(makeStorage)`. Covers create/read/update/delete, playlist order, membership sync, duplicate import, exact duplicates refused on create and on an edit that makes two questions match (but allowed across two owners), and owner isolation (owner A cannot read, update or delete owner B's rows).
- `apps/builder/test/storage-json.test.js`: runs the contract on the JSON adapter in a temp `TRIVIA_DATA_DIR`.
- `apps/builder/test/storage-supabase.test.js`: runs the contract against `SUPABASE_DB_URL`. When the variable is unset it skips with the message `Set SUPABASE_DB_URL (run "npx supabase start", then use the DB URL it prints) to run the Supabase storage tests.`
- Existing `library.test.js`, `game.test.js` and `store-phones.test.js` keep passing after step 1, with `await` added.
- Run: `npm test`, or `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test` for both adapters.

## Verify

1. After step 1: `npm run dev`, create, edit, reorder and delete a question and a playlist in the Builder; play a game from a playlist; write a question from a phone (`npm run party`) and see it under Unread.
2. After step 2: `npx supabase start`, `TRIVIA_STORAGE=supabase SUPABASE_DB_URL=... npm run dev`, repeat step 1's checks; open Supabase Studio (`http://127.0.0.1:54323`) and see the rows.
3. After step 3: run the migration twice; counts match and the second run reports 0 new rows.
4. After step 4: upload `import/316 - Total Trivia Mix w_ hints - ALL.csv` in the Builder; a second upload adds 0 questions.

## Docs to update

- `README.md`: *Storage* section (two modes, env vars, `supabase start`), *Run it* (env setup), *Tests* (the Supabase skip and how to enable it).
- `PLAN.md`: tick Phase 16 when built.
- `SCOPE.md`: §2 Tech Stack (Supabase Postgres) and §5 row 5 stays out of scope until [05](05-stats-dashboard.md).
- `tools/harvester/README.md`: `--to-db`.

## Watch out

- `source: 'public'` means "written on a phone" today. [04](04-question-visibility.md) adds a `visibility` of `public`, so leaving the old value would make every phone question look published. Step 1 renames it.
- Supabase free projects pause after a week of low database activity ([Supabase docs](https://supabase.com/docs/guides/platform/free-project-pausing), checked 2026-11-24). A friends-only app can easily go a week without a game. [02](02-security-and-hosting.md) covers the keep-alive.

## Left out

- Media uploads to Supabase Storage. SCOPE §5 row 10 keeps media as URLs, and storing user uploads adds moderation and copyright work.
- Realtime subscriptions. The game relay already pushes state over its own WebSocket.
