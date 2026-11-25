# 04: Private and public questions and playlists

Part of the [hosted Trivia Builder roadmap](00-roadmap.md). Build order: **4th**.

## Goal

Every question and playlist belongs to one account and starts private. The owner can publish it, and then every other account can play it, add it to their own playlists, or copy it into their own bank. A question written on a phone during a game lands in the host's account as private.

Done when: two accounts can share a question by publishing it, the second account plays it from its own playlist, copies it and edits the copy without changing the original, and sees it greyed out after the owner makes it private again.

## Decisions

- **Public questions are read-only references for others.** Another account adds the original to its playlists; the owner's later edits show up there. Rejected: copy-only sharing (popularity stats would split across copies).
- **Copying is also allowed, and a copy is a new question.** It gets `copied_from` for lineage only; the original owner's edits never reach it and its stats are its own.
- **Playlists have the same toggle.** A public playlist may only hold public questions. Publishing a playlist that holds the owner's private questions asks "Publish these N questions too?"; it can't hold other accounts' private questions because those can never be added in the first place.
- **Unpublished or deleted questions drop out of other people's playlists, shown as "no longer available".** They're skipped when a game starts. Rejected: blocking unpublish once used (owners lose control of their own questions), and auto-copying to every referencing account (silently creates copies the owner meant to withdraw).
- **"No longer available" rows carry no content.** The owner made it private; showing its text in someone else's playlist would undo that. The row shows only "A question that is no longer available" and a **Remove** button.
- **Exact duplicates.** "Exact" means the same `questionKey`: question, answer and attachment, trimmed and case-insensitive. So "What flag is this?" with two different flag pictures is two questions. The fuzzy `findDuplicate` check stays for phone submissions only.

  | Case | What happens | Why |
  | --- | --- | --- |
  | Saving one that matches a question in my own bank (Builder) | Blocked: "Already in your bank", with **Open it** ([01](01-database.md) step 1) | Two copies split stats and can both come up in one game |
  | Copying a public question I already have an exact match of (an unedited earlier copy, or my own) | No new copy; opens the one I have | A second identical copy has no use |
  | Publishing one that matches another account's public question | Blocked: "Sam already made this public. Add theirs to your playlists instead." | The public library would list it twice and split its popularity. Also catches copying a public question and republishing it unchanged |
  | Two accounts each have it private | Allowed | Nobody else sees either; checking would reveal that a private question exists |
  | CSV import or harvester `--to-db` | Reuses exact matches in my own bank only, never others' public ones | Imports build my bank; a reference could later turn "no longer available" |
  | Phone question matching a public question | Rejected by the existing fuzzy check, which runs against the host's bank plus public questions (step 4) | Consistent with today's phone rule |

- **Admin can unpublish anything** (`profiles.is_admin` from [03](03-site-password-and-accounts.md)), for the day someone publishes something unkind.

## Depends on / unlocks

- **Depends on:** [01](01-database.md) (`visibility`, `copied_from`, `source: 'phone'`), [03](03-site-password-and-accounts.md) (real owners, the host's account on a room).
- **Unlocks:** [05](05-stats-dashboard.md)'s public popularity board; [06](06-online-rooms.md) games built from public playlists.
- **Supersedes:** PLAN.md Phase 13 steps 2 and 3 (phone playlists, browsing the bank from a phone) were designed for one local bank. Re-plan them on top of this doc rather than building them as written.

## Data model

Changes to [01](01-database.md)'s schema, as a new migration:

- `questions.deleted_at timestamptz null`. Deleting a question that another account's playlist references sets this (a tombstone) instead of removing the row, so those playlists can show "no longer available". With no outside references it's deleted for real.
- `questions.published_at timestamptz null`, set on each publish; the public library sorts by it.
- Replace [01](01-database.md)'s `unique (owner_id, question_key)` with the same index `where deleted_at is null`, so a tombstone doesn't stop the owner writing that question again. Add an index on `(question_key) where visibility = 'public' and deleted_at is null` for the publish check.
- `playlists.published_at` the same.
- A question is **available to account A** when `deleted_at is null and (owner_id = A or visibility = 'public')`. This one rule lives in a single SQL fragment / helper in `apps/builder/server/storage/supabase.js` and its JSON twin, and every read uses it.

JSON mode has one owner (`'local'`), so visibility is stored but has no effect there.

## Steps

### Step 1: ownership rules in storage and API

- `setQuestionVisibility(ownerId, id, visibility)` and `setPlaylistVisibility(ownerId, id, visibility, { publishQuestions })` in `apps/builder/server/library.js`. Publishing a playlist with private questions and `publishQuestions` false returns 409 with the count, which the client turns into the confirm prompt.
- `addToPlaylist` and `updatePlaylist` refuse question ids that aren't available to the caller (404, not 403, so ids of other accounts' private questions can't be probed).
- `deleteQuestion`: removes the question from the owner's own playlists as today (`syncMembership`), then tombstones or deletes as above.
- `copyQuestion(ownerId, id)`: new row with `owner_id = ownerId`, `copied_from = id`, `visibility = 'private'`, `source = 'host'`, and `submitted_by`, `author_token`, `seen_at` cleared. If the caller already has a question with the same `question_key`, return that one with `existing: true` instead of inserting.
- Publishing a question (and each question published along with a playlist) is refused with 409 when another account has a public, not deleted question with the same `question_key`. The response carries that question's `publicView` (with `ownerName`) so the client can offer **Add theirs to a playlist**. `updateQuestion` on an already public question runs the same check, so an edit can't turn it into a public duplicate. For a playlist, the 409 lists every blocked question and nothing is published.
- `getPlaylistGame` (used by Game Mode) returns only available questions, plus `unavailable: N` so Game Mode can say "2 questions in this playlist are no longer available".
- API routes in `apps/builder/server/apiHandler.js`: `POST /api/library/questions/:id/publish`, `.../unpublish`, `.../copy`; `POST /api/library/playlists/:id/publish`, `.../unpublish`; `GET /api/library/public?q=&category=&type=&page=` (50 per page).
- Admin: `unpublish` succeeds on any owner's row when `req.account.isAdmin`.

### Step 2: what other accounts may see

- A shared `publicView(question)` in `library.js` is the only way a question owned by someone else leaves the server. It keeps the playable fields (`question`, `options`, `currentAnswer`, `categories`, `type`, `attachment`, `points`, `hint`, `explanation`, `delaySecs`) and adds `ownerName` from `profiles.display_name`. It drops `owner_id`, `author_token`, `seen_at`, `submitted_by` (the phone nickname of a guest at someone else's party) and `legacy_id`.
- Unavailable playlist rows go out as `{ id, unavailable: true }` and nothing else.

### Step 3: Builder UI

- Questions column gets a scope switch: **Mine** (default, today's list), **Public library** (paged, from `/api/library/public`), **Copies** (mine with `copied_from` set).
- Editor: a **Private / Public** toggle on my own questions. Someone else's public question opens read-only with **Copy to my bank** and **Add to playlist…**.
- Playlists column: the same toggle per playlist; a 🌐 marker on public ones; others' public playlists under a **Public playlists** heading, playable and copyable (copying a playlist creates a new private playlist that references the same public questions).
- Unavailable rows render greyed with **Remove**.
- Duplicate messages: "Already in your bank" with **Open it**; **Copy to my bank** on a question I already have says "You already have this one" and opens it; a refused publish shows "Sam already made this public" (with the other owner's display name) with **Add theirs to a playlist…**.
- Game Mode dropdown (`GameMode.vue`): my playlists, then **Public playlists**.

### Step 4: phone-written questions go to the host

- `GameHub.submit` passes the room's `ownerId` (set in [03](03-site-password-and-accounts.md) step 3) to `submitQuestion`. The question is saved private, `source: 'phone'`, in the host's account.
- `findDuplicate` checks only questions available to the host (their own plus public), never other accounts' private questions; a rejection based on someone else's private bank would reveal that it exists.
- The Builder's **Unread** badge and **Mark all read** (from Phase 13) keep working per account.

## Security

- Every query reading questions or playlists uses the availability rule; every write requires `owner_id = caller` (or admin for unpublish). The two-owner contract tests from [01](01-database.md) gain cases for each new method.
- 404 instead of 403 for others' private ids, so existence isn't revealed.
- `publicView` is the single exit point; a test asserts the exact key set it returns, so adding a column to `questions` can't silently leak it.
- Known limit: a player with an account could open the public library during a game and look up the answer to a public question. Acceptable among friends; [06](06-online-rooms.md) notes it for public rooms.

## Tests

- `apps/builder/test/storage-contract.js`: publish/unpublish, availability rule, refused add of another's private id (404), copy fields, tombstone versus hard delete, playlist publish with and without `publishQuestions`; duplicates: second copy returns the first, publish refused against another account's public match, an edit making a public question a duplicate refused, two private matches across accounts allowed, a tombstoned question doesn't block re-creating it.
- `apps/builder/test/library.test.js`: `publicView` key set; `findDuplicate` ignores another owner's private questions.
- `apps/builder/test/game.test.js`: a phone submission lands with the room owner's id and `visibility: 'private'`.
- Run: `npm test` (Supabase cases need `SUPABASE_DB_URL`, see [01](01-database.md)).

## Verify

1. Account A writes a question and publishes it. Account B finds it in **Public library**, adds it to a playlist, and plays it.
2. A edits the question's answer; B's playlist shows the new answer.
3. B copies it and edits the copy; A's original is unchanged.
4. A makes it private; B's playlist shows a greyed "no longer available" row with no text, and starting a game from it says one question was skipped. B's copy still works.
5. A tries to publish a playlist containing private questions: prompt, then both are public.
6. A hosts a room; a guest writes a question from a phone; it appears in A's Unread, private, and not in B's public library.
7. Admin unpublishes B's public question.
8. B copies A's public question twice: the second time opens the first copy. B publishes that copy unedited: refused with "A already made this public". B changes the answer and publishes: allowed.
9. A writes, in the Builder, a question identical to one already in A's bank apart from letter case: "Already in your bank".

## Docs to update

- `README.md`: *Question Builder* (scopes, publish toggle, copy, unavailable rows) and *Storage* (visibility fields).
- `SCOPE.md`: new feature row for shared questions and playlists.
- `PLAN.md`: tick Phase 19; mark Phase 13 steps 2-3 as superseded by this doc.

## Open questions

- Should publishing need a confirmation the first time ("Everyone with an account can see this question and its answer")?
- Should **Public library** hide questions already in my bank (by `copied_from` or duplicate check), or show everything?

## Left out

- Ratings, comments and reporting on public questions. The popularity board in [05](05-stats-dashboard.md) is the only ranking for now; admin unpublish covers abuse.
- Sharing with specific accounts only (a "friends" visibility). Two levels keep every query to one rule.
