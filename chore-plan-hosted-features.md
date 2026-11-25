## Context

Trivia Builder runs on localhost only: JSON files for storage, one game room per server, and an API that refuses every device but the computer running it. I want it online at `trivia.je-ng.ca` for friends and family, with a database, a site password, accounts, shared questions, stats and online rooms. This PR adds the plans only, no code: one doc per feature in `docs/plans/` plus `00-roadmap.md`, which sets the build order and how the features connect. Each doc is written so a Claude Code session can build one step per PR from it.

| Doc | Feature | Build order |
| --- | --- | --- |
| `01-database.md` | Supabase Postgres behind an async storage interface; JSON kept for offline | 1 |
| `03-site-password-and-accounts.md` | Site password for everyone, QR room tickets, Supabase Auth accounts | 2 |
| `02-security-and-hosting.md` | Threat model, hosting comparison (Fly.io behind Cloudflare), pre-deploy checklist | 3 |
| `04-question-visibility.md` | Private/public questions and playlists, copy, "no longer available" | 4 |
| `05-stats-dashboard.md` | Play events, owner dashboard, public popularity board | 5 |
| `06-online-rooms.md` | Many rooms at once, remote play with a server-owned timer | 6 |

Accounts come before deploying because today's only protection, the loopback check in `server/game.js`, means nothing on a hosted server.

## Road not taken

- **SQLite or Turso** instead of Supabase: SQLite needs a disk on the app host, and Supabase also gives us Auth.
- **Supabase-only, dropping JSON mode:** party play on home Wi-Fi with no internet must keep working.
- **Cloudflare Workers + Durable Objects:** keeps everything on `je-ng.ca` and is free, but Express and `ws` don't run there, so the relay and API would be rewritten. Revisit if rooms outgrow one machine.
- **Render free tier:** sleeps after 15 minutes idle and drops open WebSockets, so a slow question could kick every phone.
- **Moving the game engine to the server:** the host browser keeps owning game state; only the remote-mode timer moves server-side.
- **An open list of rooms:** rooms are found by code, link or QR only.

## Known worst case to check

- **Plans drifting from the code.** The docs name real functions and files as of `98c3dd1`. If a later PR renames one, the doc is wrong; the roadmap tells the implementing session to follow the code and fix the doc in the same PR.
- **The first build step is the riskiest.** `01-database.md` step 1 makes every `library.js` export async. A missed `await` makes an endpoint return `{}` with a 200, so that step's tests must hit every endpoint.
- **Prices and free-tier limits** were checked on 2026-11-24 and will change. `02-security-and-hosting.md` says to recheck before signing up.

## Decisions to review

These were my calls, not ones we discussed. Each is listed in the roadmap:
- The browser never queries Supabase; the server sets its own `HttpOnly` session cookie.
- Email confirmation off and admin-only password resets, because Supabase's built-in mailer only delivers to project team members.
- Stats recorded when the host leaves the Answer Reveal, upserted per game and question, so BACK never double-counts.
- Popularity ranked by distinct host accounts over 30 days; miss rate shown only after 10 answers.
- Remote-mode pictures go through a media proxy, because harvested URLs like `Flag_of_France.svg` give the answer away.
- Exactly one app machine, since rooms live in memory.
- `source: 'public'` (phone-written) renamed to `source: 'phone'` so it can't be confused with the new public visibility.

Added after review: **exact duplicates** (same question, answer and attachment, trimmed and case-insensitive) are blocked in your own bank and among public questions, allowed between two accounts' private banks, and enforced by a `unique (owner_id, question_key)` index. The full case table is in `04-question-visibility.md` under *Decisions*. The current bank has 0 exact duplicates, so the migration won't trip on it.

## Manual testing

1. Open `docs/plans/00-roadmap.md` on GitHub; the mermaid diagram renders and every link to `01`-`06` opens.
2. The `PLAN.md` Phases 16-21 links and the new README line open the right docs.

## Automated testing

N/A: docs only. Checked by script instead: every function and file the docs name exists in `apps/` or `tools/` (or is marked new), and there are no em-dashes or US spellings.

## Where this is documented

- **The plans:** `docs/plans/`.
- **Their place in the build history:** `PLAN.md` Phases 16-21, and the README links to the roadmap.
- **The decisions behind them:** the roadmap's two decision tables and each doc's *Decisions* section.

## Interoperability and impact

- `PLAN.md` Phase 13 steps 2-3 (phone playlists, browsing the bank) are marked as superseded by `04-question-visibility.md`.
- No code, config or dependency changes.

## Deployment

None.

## `/personal-pragmatic-review` and `/security-review`

N/A: no code changed. Security is covered in the plans themselves (the threat model and pre-deploy checklist in `02-security-and-hosting.md`, and a *Security* section in every doc); both reviews run on each build PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
