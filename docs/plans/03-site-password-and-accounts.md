# 03: Site password and accounts

Part of the [hosted Trivia Builder roadmap](00-roadmap.md). Build order: **2nd**. Read the threat model in [02](02-security-and-hosting.md) first.

## Goal

Friends and family only. Every visitor to `trivia.je-ng.ca` enters the site password, except a guest who scans a room's QR code, whose link carries a ticket that works for that room only. Past the gate, anyone can create an account (email + password) and sign in to build questions and host games.

Done when: a browser with no cookies sees only the password page; the right password leads to sign-in; a QR link opens `/play` for its room and nothing else; a signed-in account hosts a room; offline JSON mode behaves exactly as today.

## Decisions

- **Site password for everyone; the QR link carries a ticket instead.** Rejected: hosts-only gate (any stranger who guesses a 4-letter room code could join), and asking every party guest for the password.
- **Supabase Auth, email + password, self sign-up past the gate.** Rejected: own users table (password hashing, resets and lockout are ours to get right), Google sign-in (an OAuth client and consent screen for a family site), magic links (needs an email sender).
- **Email confirmation off.** Supabase's built-in email sender only delivers to the project's own team members, so confirmation and reset emails would never reach friends without a custom SMTP provider. The site password already keeps strangers out. Password resets are done by Jess as admin (step 4). A custom SMTP provider is an open question.
- **The server issues its own session cookie** after Supabase confirms the password, and drops Supabase's tokens. Rejected: keeping Supabase's access/refresh tokens in the browser, which puts a bearer token in JavaScript reach and needs refresh handling in the client.
- **Offline JSON mode has no gate and no accounts.** It keeps today's loopback rules: the computer running the app hosts, phones on the LAN join by code. Every gate and account check sits behind `if (hosted)`.

## Depends on / unlocks

- **Depends on:** [01](01-database.md) (the `profiles` table and `ownerId` on every library call).
- **Unlocks:** [02](02-security-and-hosting.md)'s deploy (never deploy without the gate), [04](04-question-visibility.md) (real owners), [06](06-online-rooms.md) (one room per host account).

## Data model

- `profiles` (from [01](01-database.md)) gains `session_version int default 0`. Bumping it signs that account out everywhere.
- No other tables. Sessions are stateless signed cookies.

## How the cookies work

All cookies are `HttpOnly; Secure; SameSite=Lax; Path=/`, values signed with HMAC-SHA256 and compared with `crypto.timingSafeEqual`.

| Cookie | Value | Lifetime | Grants |
| --- | --- | --- | --- |
| `tb_site` | `exp` + a fingerprint of `SITE_PASSWORD_HASH` | 30 days | Past the gate: the sign-in page, sign-up, the app shell |
| `tb_room` | room code + `exp` | Until the room closes, at most 12 hours | `/play`, static assets, and `join` on that room's socket only |
| `tb_session` | profile id + `session_version` + `exp` | 14 days | The API as that account, hosting a room |

Including the password fingerprint in `tb_site` means changing the site password signs out every gate cookie at once. Without it, a guest who once knew the old password keeps access for 30 days.

## Steps

### Step 1: the site gate

- `SITE_PASSWORD_HASH` env var in the form `scrypt$<N>$<saltBase64>$<hashBase64>`, made by a new script `npm run hash-password` (`tools/hash-password.js`, reads the password from stdin so it never lands in shell history). Uses `crypto.scrypt` from `node:crypto`, no dependency.
- `apps/builder/server/gate.js`: middleware mounted in `apps/builder/server/index.js` and `apps/builder/client/vite.config.js` ahead of `apiMiddleware`, hosted mode only.
  - Allowed with no cookie: `GET /gate`, `POST /gate`, `GET /healthz`, and `GET /play?t=<ticket>` (step 2).
  - `GET /gate` serves a small server-rendered HTML form (no Vue bundle, so nothing of the app loads before the password).
  - `POST /gate` checks the password, rate-limited 5/minute per IP with the helper from [02](02-security-and-hosting.md), sets `tb_site`, redirects to `/`.
  - Everything else without a valid cookie: `/api/*` gets 401 JSON, pages redirect to `/gate`, socket upgrades are refused.
- Optional hardening: Cloudflare Turnstile on the gate form. Free, invisible for most visitors, and stops scripted guessing before the rate limit is even reached.

### Step 2: room tickets for QR links

- `makeTicket(code, exp)` and `readTicket(t)` in `gate.js`: `base64url(code.exp).base64url(hmac(TICKET_SECRET, code.exp))`.
- `joinUrl()` in `apps/builder/client/src/multiplayer.js` (shown and QR-encoded by `JoinPanel.vue`) builds the URL from a new `ticket` field the hub sends with the room code. Today it points at the LAN address with the code; hosted, it's `https://trivia.je-ng.ca/play?t=<ticket>`.
- `GET /play?t=...`: if valid and the room is still open, set `tb_room` and redirect to `/play?code=<code>` so the ticket leaves the address bar and browser history.
- `GameHub.join` in `apps/builder/server/game.js`: in hosted mode, a connection authorized only by `tb_room` may join only the room in that cookie. The upgrade handler in `attachGameSocket` reads the cookies and puts `{ room, accountId, gate }` on the connection object next to today's `local`.
- A player who also has `tb_site` (knows the password) can join any room by typing its code, as today.

### Step 3: accounts

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (the server-side key; Supabase called it `service_role` in older projects). Server only.
- `apps/builder/server/auth.js`, all behind `tb_site`:
  - `POST /auth/signup { email, password, displayName }`: password at least 10 characters, display name 1-24 characters (matches `MAX_NAME` in `game.js`). Calls `supabase.auth.admin.createUser({ email, password, email_confirm: true })`, inserts the `profiles` row, sets `tb_session`. Rate-limited 3/hour per IP.
  - `POST /auth/signin { email, password }`: `supabase.auth.signInWithPassword`; on success sets `tb_session`. Same error message for unknown email and wrong password. 5/minute per IP.
  - `POST /auth/signout`: clears `tb_session`.
  - `GET /auth/me`: `{ id, displayName, isAdmin }` or 401.
- `apiMiddleware` in `apps/builder/server/apiHandler.js`: in hosted mode, replace the `isLoopback` 403 with "valid `tb_session` or 401", and pass `req.account.id` as `ownerId` to every library call. JSON mode keeps the loopback check and `ownerId = 'local'`.
- `GameHub.attachHost`: in hosted mode the host must have an `accountId`; the room remembers its `ownerId` so phone-written questions land in the host's account ([04](04-question-visibility.md)).
- Client: a sign-in / sign-up screen in `App.vue` shown when `/auth/me` returns 401; `apps/builder/client/src/api.js` sends the user there on any 401. The toolbar (`Toolbar.vue`) shows the display name and **Sign out**.
- Rerun the [01](01-database.md) migration with `--owner <Jess's profile id>`, then mark Jess admin: `update profiles set is_admin = true where id = '<id>';` in the Supabase SQL editor.

### Step 4: admin basics

- `GET /admin/accounts` (admin only): display name, email, created date, question count.
- `POST /admin/accounts/:id/reset-password`: sets a temporary password through `auth.admin.updateUserById` and bumps `session_version`; Jess passes the temporary password to the friend directly.
- `POST /admin/accounts/:id/disable`: bans the Supabase user and bumps `session_version`.
- A small **Accounts** tab in the Builder for admins.

## Security

- Every comparison of a secret or signature uses `crypto.timingSafeEqual` on equal-length buffers.
- Secrets are separate per purpose (`SESSION_SECRET`, `TICKET_SECRET`), at least 32 random bytes each (`openssl rand -base64 32`), so a leaked ticket secret can't forge sessions.
- Changing the site password: run `npm run hash-password`, `fly secrets set SITE_PASSWORD_HASH=...`. Every `tb_site` cookie dies because of the fingerprint.
- `SameSite=Lax` blocks cross-site `POST`s carrying the cookies; the API also rejects state-changing requests whose `Origin` header isn't `PUBLIC_ORIGIN`, covering older browsers.
- Error messages never say whether an email has an account.

## Tests

- `apps/builder/test/gate.test.js`: password hash verify (right, wrong, malformed hash); cookie sign/verify, expiry and tampering; fingerprint change invalidates `tb_site`; ticket round trip, expiry, wrong room; which paths are open without cookies.
- `apps/builder/test/game.test.js`: new cases for a ticket-only connection joining its own room, being refused another room, and being refused `host`; hosted host without an account refused.
- `apps/builder/test/auth.test.js`: sign-up validation and the same-message rule, with Supabase Auth faked by passing a stub client (the real call is covered by Verify).
- Run: `npm test`.

## Verify

1. Hosted mode locally (`TRIVIA_STORAGE=supabase` plus the env vars, `npx supabase start`): a private window sees only `/gate`; `curl -i localhost:5173/api/library` returns 401.
2. Wrong password six times: 429. Right password: sign-in page.
3. Sign up two accounts in two browsers; each sees only its own (empty) bank. Jess's account sees the migrated 321 questions.
4. Host a room, scan the QR code on a phone in a private tab: lands on `/play` with no `t=` in the address bar, joins, answers. Opening `/` on that phone redirects to `/gate`.
5. Close the room; reloading the old QR link shows "This room has ended".
6. Offline: `npm run party` with no env vars works exactly as before, with no gate.

## Docs to update

- `README.md`: *Accounts and the site password* section (how to set and change the password, sign up, admin reset); the *Security* paragraph under *Phone play*.
- `SCOPE.md`: §5 row 4 "Multi-user / auth" moves in scope as a new feature row.
- `PLAN.md`: tick Phase 18.

## Open questions

- Add a custom SMTP provider (for example Resend's free tier) for self-service password resets later, or keep admin resets?
- Should sign-up need a second shared "invite code" on top of the site password, in case the password gets passed around?

## Left out

- Social login and multi-factor authentication. Friends-and-family scale; can be added through Supabase Auth later without schema changes.
- Player accounts. Phone players stay nickname-only, as today; an account is for building and hosting.
