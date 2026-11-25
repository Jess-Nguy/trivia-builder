# 06: Online game rooms

Part of the [hosted Trivia Builder roadmap](00-roadmap.md). Build order: **6th (last)**.

## Goal

Two things on the hosted site:

1. **Many rooms at once.** Several accounts host their own games at the same time. Today `GameHub` in `apps/builder/server/game.js` holds one room per server.
2. **Remote mode.** Players in different houses, with no shared TV. Each player's phone or laptop shows the full question, options and media, and the countdown comes from the server so everyone gets the same time.

Rooms are found by code, link or QR only; there is no list of open rooms. "Public" here means "over the internet", still behind the site password or a room ticket ([03](03-site-password-and-accounts.md)).

Done when: two accounts run games at the same time without seeing each other's rooms; a remote game with players on mobile data shows pictures and YouTube on every phone, with countdowns within a second of each other and late answers refused.

## Decisions

- **A room registry, one `Room` per code.** The current `GameHub` class becomes `Room`; a new `RoomRegistry` owns the `Map` of code to room and routes each socket message. The relay logic (state stripping, chat, submissions) moves unchanged.
- **The host browser keeps owning game state**, as today, in both modes. Rejected: moving the whole game engine (`store.js`) to the server. It's a rewrite of the app's core for one benefit (a host can't cheat), and among friends the host is trusted.
- **The server owns the clock in remote mode.** The host sends "open answers for N seconds"; the server stamps a deadline, broadcasts it, refuses answers after it, and tells the host when time is up. Rejected: each phone running its own timer from when the message arrived, which drifts by network latency and lets a slow phone answer late.
- **Pictures go through a media proxy in remote mode; YouTube doesn't.** The harvester's flag questions use Wikimedia Commons URLs such as `.../Flag_of_France.svg`: on a TV nobody sees the URL, but on a phone a long-press or "open image in new tab" shows the answer. The proxy serves `/media/<room>/<n>` with no hint of the original URL. YouTube can't be proxied (its terms and the IFrame API both need the real video id), so a determined player could look up a video's title; accepted, and `#audio` questions still hide the video on screen.
- **Room code discovery only.** Rejected: an open-rooms lobby. Codes are 4 letters from 24 (`CODE_LETTERS`, 331,776 combinations) plus the gate, plus a join rate limit, which is enough when nothing lists them.

## Depends on / unlocks

- **Depends on:** [03](03-site-password-and-accounts.md) (tickets, host accounts), [02](02-security-and-hosting.md) (deployed with the Origin check and rate limiter). Uses [04](04-question-visibility.md)'s public playlists and reports into [05](05-stats-dashboard.md) with `mode: 'remote'`.
- **Unlocks:** nothing further in this roadmap.

## Steps

### Step 1: room registry (works in offline mode too)

- Rename `GameHub` to `Room` and add `RoomRegistry` in `apps/builder/server/game.js` (or split into `rooms.js` if `game.js` passes about 400 lines). The registry handles `host` (create or reattach) and `join` (look up by code), then hands the connection to its room for every later message.
- A connection belongs to at most one room; `close` removes it from that room.
- Offline JSON mode: the registry allows one room, hosted by the loopback connection, so behaviour matches today and the existing `game.test.js` cases pass with `new RoomRegistry()` in place of `new GameHub()`.
- Hosted: a room is keyed to its host's account, so a host reload (or a second tab) reattaches to the same room and phones stay in.

### Step 2: limits and expiry (hosted)

| Limit | Value | Why |
| --- | --- | --- |
| Open rooms per account | 2 | A host with two TVs; more is a bug or abuse |
| Rooms on the server | 25 | One 256 MB machine ([02](02-security-and-hosting.md)) |
| Phones per room | 40 | Each phone gets every state update; 40 × a few KB per update stays small |
| Room closes after | 30 minutes with no host and no phones connected, or 12 hours in total | Frees memory; matches the 12-hour cap on `tb_room` tickets |
| Wrong room codes | 10 per minute per IP, then 429 | Stops guessing codes |

- Closing a room tells its phones ("This room has ended"), clears its chat history, and invalidates its tickets.
- Constants at the top of the room module, next to today's `MAX_TEAMS`, `MAX_CHAT` and friends.

### Step 3: remote mode, what phones see

- Game Mode (`GameMode.vue`): a **Where are the players?** choice when phone play is on: **In the room (TV)**, today's behaviour, or **Remote (each on their own screen)**. Saved in `settings.remote`.
- `snapshot()` in `apps/builder/client/src/multiplayer.js`: in remote mode, the question phase also includes the question `attachment`, option attachments, `hint` only after the host reveals it, and `delaySecs`. The correct answer and `explanation` stay out until the reveal, exactly as today.
- `Room.setState` already strips other teams' answers per phone; it now also swaps every non-YouTube attachment URL for `/media/<code>/<n>` before sending (step 5).
- Phone (`apps/builder/client/src/phone/PhoneApp.vue`): in remote mode the question card renders the question and media with `Media.vue`, the options with their pictures, the hint when revealed, the reveal with the answer and explanation, and the scoreboard standings. Reuse the TV screens' components where they take props; don't fork them.
- Autoplay: phones block sound until the user taps. The phone shows a one-time **Tap to join with sound** button after joining, which starts and pauses a silent media element to unlock audio for the session. YouTube embeds need `playsinline=1` on iOS, or they open fullscreen.
- Host screen in remote mode is a console: same screens as today, plus the roster and the server countdown. The host sees answers, so the host doesn't play.

### Step 4: server-owned timer

- New host messages: `{ t: 'open', secs, delaySecs }` and `{ t: 'close' }`. The room sets `readingUntil` and `deadline` from its own clock and broadcasts them with `serverNow`.
- Each phone computes `offset = serverNow - Date.now()` on every message and counts down to `deadline - offset`, so a phone with a wrong clock still shows the right time.
- `Room.answer` refuses answers before `readingUntil` or after `deadline` (500 ms grace for network jitter). At the deadline the room sends `{ t: 'timeUp' }` to the host, which reveals as if the timer had run out.
- Pause (`P` on the host) sends `{ t: 'pause' }`; the room stores the remaining time and clears the deadline; resume sets a new one.
- In-room (TV) mode keeps today's host-side timer in `Question.vue`; only remote mode uses this.

### Step 5: media proxy

- `GET /media/:code/:n`, allowed for a connection in that room (cookie check as in [03](03-site-password-and-accounts.md)). The room keeps `n → original URL` for the current question only.
- The server fetches the original and streams it back. Guards, because this makes the server fetch URLs that players typed:
  - `https:` only; resolve the hostname and refuse private, loopback and link-local addresses (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`) so a question can't make the server fetch Fly's internal network (server-side request forgery). Check again after each redirect, max 3 redirects.
  - `Content-Type` must be `image/*`, `video/*` or `audio/*`; 10 MB cap; 10-second timeout.
  - `Cache-Control: private, max-age=600` so each phone fetches once.
- TV mode doesn't use the proxy; the TV loads URLs directly as today.

### Step 6: load check

- `tools/load-rooms/` script: open 3 rooms with 30 fake phones each over WebSocket against a local server, play 10 questions, report memory (`process.memoryUsage().rss`) and the slowest state broadcast. Run it before the first public game night; the result goes in the PR description, not the docs.

## Security

- The server is now the only thing between a player and the answer: the per-phone state built in `Room.setState` must never include `answer`, `explanation` or other teams' picks before the reveal. A test asserts this per phase.
- Each connection can act only in its own room; a message naming another room is ignored.
- Room limits and the code-guess limit above.
- The media proxy's SSRF guards (step 5) are the riskiest new code; review them with [02](02-security-and-hosting.md)'s checklist.
- Known limits: YouTube titles can reveal answers in remote mode; a player with an account can look up public questions in the library during a game ([04](04-question-visibility.md)).

## Tests

- `apps/builder/test/game.test.js`: two rooms isolated (answers, chat, state); per-account room cap; idle expiry with a fake clock (the hub already takes `now`); code-guess limit; host reattach by account; offline single-room behaviour unchanged.
- `apps/builder/test/timer.test.js`: deadline stamping, answers refused before `readingUntil` and after `deadline + grace`, pause and resume, `timeUp` sent once.
- `apps/builder/test/media-proxy.test.js`: private and loopback addresses refused (including after a redirect), wrong content type refused, size cap, URL never appears in the state sent to phones. Uses a local HTTP server as the origin; no internet.
- `apps/builder/test/remote-state.test.js`: for each phase, the keys a phone receives in remote mode.
- Run: `npm test`.

## Verify

1. Two accounts each host a room at the same time; phones in each see only their room's questions and chat.
2. Remote game on the deployed site: three phones on mobile data, one Wi-Fi laptop. A flag picture question shows the picture, and long-pressing it shows a `/media/...` address, not the Commons URL. A YouTube question plays after the one-time tap.
3. Countdowns on the phones agree within a second; an answer tapped after zero is refused with "Time's up".
4. Pause on the host freezes every phone's countdown.
5. Leave a room idle for 30 minutes (or use a shortened limit in a dev build); phones see "This room has ended".
6. Run the step 6 load script; memory stays well under 256 MB.

## Docs to update

- `README.md`: *Phone play* becomes *Playing with phones* with *In the room* and *Remote* subsections; *Security* paragraph.
- `SCOPE.md`: §5 row 4 "remote play over the internet is still out" moves in scope as a feature row.
- `PLAN.md`: tick Phase 21.

## Open questions

- In remote mode, should the host be allowed to play as a team (the console would hide answers until the reveal)? Proposed: no, keep the host as host.
- Should remote players hear background music? Today it plays only on the TV. Proposed: no, the host can share music on a call.

## Left out

- Video or voice between players. Players use whatever call they already use.
- An open-rooms list, and rooms for strangers without the site password (decided against).
- Server-authoritative game engine and anti-cheat for hosts (see Decisions).
- Scaling past one machine ([02](02-security-and-hosting.md), *Left out*).
