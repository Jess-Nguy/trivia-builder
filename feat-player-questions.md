## Context

I've been finding every question myself. With this change, players at a party add questions on topics they know best from their phones, on the same Wi-Fi they already use for phone play. Their questions go straight into the bank, tagged so I can tell them apart from mine, and they play in regular games. This is step 1 of PLAN.md Phase 13. Step 2 (phone playlists), step 3 (browsing the bank behind a host setting) and step 4 (Stump the room) are written up but not built.

What it adds:
- **Phone:** players enter a nickname when they join. They can write Single Choice, Multiple Choice or True or False questions, with up to 5 categories, in the lobby, on the reveal and on the scores, but not while a question is being answered. The draft is kept when the form closes.
- **Bank:** submissions get the builder's validation, a strict duplicate check, and an optional question attachment that must load in a preview before it can be submitted. They're saved as `source: "public"`, `submittedBy`, `authorToken`, `seenAt: null`.
- **Builder:** an **Unread (N)** button, *New* and *by Sam* tags, a host/public filter and **Mark all read**.
- **TV and phones during play:** the TV shows *Written by Sam*. The author's phone shows "You wrote this one!", and the relay ignores answers from it.

## Road not taken

- **An approval queue** (a separate `submissions.json` that the host approves into the bank). Dropped because I want questions in the bank right away. The *Unread* tag replaces review.
- **Submitting through `/api/library`.** It would have meant opening the host-only API to phones. Submissions go over the existing game socket instead, and the API stays loopback-only.
- **A loose duplicate check.** The check is strict on purpose, since the players are friends and a false rejection costs little.
- **Media on options from phones.** Left out. Only the question attachment is allowed, and it has to preview first.

## Known worst case to check

- **False duplicates.** The bank already holds 316 questions, so a new question on a common topic can be rejected. For example, "Which planet has the most known moons?" is rejected against "Which planet in our solar system has the most moons? / Saturn". A rejection is cheap, but if it happens too often the overlap thresholds (0.6, or 0.4 with the same answer) are in `findDuplicate` in `server/library.js`.
- **Phones that joined before this change** have no saved nickname, so they'll see the join screen once.

## Manual testing

1. Run `npm run party`, tick **📱 teams answer on their phones**, and join from a phone with a nickname.
2. In the lobby, tap **✍️ Write a question** and submit a new question. Open the Builder: **Unread (1)** shows, and the row has *New* and *by <nickname>*. Open the question and the *New* tag clears.
3. Submit the same question reworded. The phone says it's too close to an existing question.
4. Type a broken image link. **ADD TO THE BANK** stays disabled. Use a working link, tick *Preview looks right*, and submit.
5. Start a game and open the form on the phone between questions. When the next question starts, the form closes, and reopening it later still has the draft.
6. Put the phone question in a playlist and play it. The phone that wrote it shows "You wrote this one!" and can't answer, a teammate's phone can answer, and the reveal shows *Written by <nickname>* on the TV and the other phones.

## Automated testing

`npm test` passes 87 tests, 35 of them new:
- `test/game.test.js`: nickname on join; the submission window by phase; credit going to the phone's own name and token; the 20-question cap; the bank's rejection passed back to the phone; the author's token never reaching other phones; the author unable to answer while teammates can.
- `test/library.test.js`: public fields; validation; multiple categories kept and capped at 5; option media dropped; non-http attachments rejected; public fields kept through a host edit; duplicates (case, punctuation, accents, filler words, rewording with the same answer); a TRUE/FALSE answer not counting as a match; `markSeen`.

I also ran the real server against a scratch copy of `data/` (`TRIVIA_DATA_DIR`) and drove a host and a phone over the socket. Results: accepted, reworded copy rejected, bank copy rejected, refused mid-question, host notified, marked read. I haven't yet looked at the screens in a browser; that's what the manual steps cover.

## Where this is documented

- **How it works for players and the host:** README, in *Writing questions on phones* under *Phone play*, and *Question Builder*.
- **The new bank fields:** README, *Storage*.
- **Acceptance criteria:** SCOPE §4 Feature 30.
- **Steps 2 to 4:** PLAN.md Phase 13.
- **Why the design choices were made:** this description and the commit bodies.

## Interoperability and impact

- Existing questions have no `source` field, so they count as host questions. No migration is needed.
- Editing a public question in the Builder keeps its author fields.
- The phone protocol changes: `join` now needs `name`, and there are new `submit`, `submitted` and `rejected` messages. Phone and host ship together, so nothing else depends on the old protocol.

## Deployment

None. This is a local app; pull and restart `npm run party` or `npm start`.

## `/personal-pragmatic-review`

**Verdict:** ✅ Clean, after two fixes made during the review (commit `fe73506`).

Good: the author's name and token come from the relay's record of the phone, never from the message, and a test locks that in. The new bank fields need no migration. Docs were updated in the same branch.

Fixed during the review:
- `client/src/phone/WriteQuestion.vue` (tests rule, bug): after a successful submit, tapping **Done** reopened the saved question as a draft. The draft now resets once the relay confirms the save.
- `server/library.js:175` (readability): the accent-stripping range was written as literal combining characters. It's now `̀-ͯ`, with a test for accented questions.
- `server/game.js:42`: the `bank` constant had split the `GameHub` comment from its class.

Non-blocking:
- `server/game.js` `submit()`: the per-player cap is keyed on the phone token, which a player can reset by clearing site data. That's acceptable among friends.

## `/security-review`

No vulnerabilities at confidence 8/10 or higher.

Checked and found sound:
- `/api/library/seen` is behind the loopback 403.
- Author identity comes from the relay's record of the phone, not the message.
- `authorToken` never reaches a phone, because `stateFor` replaces it with a per-phone `wrote` flag.
- Attachments must be `http(s)`, which blocks `javascript:` and `data:`.
- Nicknames and question text render through Vue's escaped `{{ }}`, with no new `v-html`.
- Phone tokens are 12 random bytes.

Low-severity notes, below the reporting threshold. None is fixed in this PR:
- **CSV formula injection.** Exported playlist CSVs don't escape formulas. Phone-written text starting with `=` could run as a formula if the host exports the playlist and opens it in Excel. Possible follow-up: `escapeFormulae: true` in `playlistCsv`.
- **Probing the bank.** Rejected submissions don't count toward the 20-question cap, so a player could test guessed wordings against the bank to learn what's in it. They'd need to guess the wording closely already.
- **Nickname spoofing.** A player can pick someone else's nickname. It only affects the name shown, not who the question is credited to.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
