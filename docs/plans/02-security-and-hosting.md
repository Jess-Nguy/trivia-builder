# 02: Security and hosting

Part of the [hosted Trivia Builder roadmap](00-roadmap.md). Build order: **3rd** (deploy only after [03](03-site-password-and-accounts.md)'s gate exists). The threat model and the pre-deploy checklist below apply to every other doc, so read this one before starting any of them.

## Goal

Run Trivia Builder at `https://trivia.je-ng.ca` for friends and family, with the site password, accounts and game rooms safe against strangers on the internet, for a few dollars a month.

Done when: the app is deployed, every item in the *Pre-deploy checklist* is ticked, and a request that skips Cloudflare (straight to the host's own URL) is refused.

## Threat model

Today's only control is `isLoopback()` in `apps/builder/server/game.js`: the API and hosting are refused to anything but the host computer. Hosted, every request arrives through a proxy, so that check stops meaning anything and every rule below replaces it.

| Who | What they could try | Control (doc) |
| --- | --- | --- |
| Stranger on the internet, no password | Read questions or answers, sign up, brute-force the site password | Site gate on every route, per-IP rate limit, Cloudflare WAF ([03](03-site-password-and-accounts.md), this doc) |
| Guest with a room QR link | Use the ticket beyond that room: browse the bank, host a room, sign up | Ticket scoped to `/play` and that room's socket only, expires with the room ([03](03-site-password-and-accounts.md)) |
| Player in a room | Read the answer or other teams' picks before the reveal | Server strips per-player state; in remote mode the server, not the host browser, decides what each phone sees ([06](06-online-rooms.md)) |
| Friend with an account | Read or edit another account's private questions; inflate stats | `owner_id` in every query ([01](01-database.md)); stats trusted from hosts, a known limit ([05](05-stats-dashboard.md)) |
| Anyone | Steal the Supabase secret key or DB URL | Server-only env vars, never in the client bundle or repo ([01](01-database.md)) |
| Malicious page in another tab | Open the game WebSocket with the victim's cookie (cross-site WebSocket hijacking) | `Origin` check on the upgrade (this doc) |
| Player | Post a question whose attachment URL is hostile | `http(s)` only (exists today), CSP limits what the page can load, media renders in `<img>`/`<video>`/YouTube iframe only |

## Hosting comparison

Requirements from the code: one long-lived Node process (Express plus the `ws` relay; rooms live in memory in `GameHub`), always on during a party, HTTPS, WebSockets. Supabase hosts the data, so the app host needs no disk.

Prices checked 2026-11-24; recheck before signing up.

| Option | Runs today's code? | Cost | Sleeps? | Security posture | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Fly.io** + Cloudflare proxy | Yes, as a Docker image | shared-cpu-1x 256 MB: $2.19/month ([Fly 2026 pricing update](https://fly.io/pricing-update/)) | No, with auto-stop off | Isolated VM, secrets via `fly secrets`, no machine to patch | **Recommended** |
| Railway + Cloudflare proxy | Yes | Hobby $5/month including $5 of usage ([Railway docs](https://docs.railway.com/pricing/plans)) | No | Similar to Fly | Good fallback; simpler dashboard, about twice the price |
| Render free | Yes | $0 | Yes: after 15 minutes idle, about 1 minute to wake, and open WebSockets drop ([Render docs](https://render.com/docs/free)) | Fine | Rejected: a quiet stretch mid-party (a long question read aloud) can drop every phone |
| Cloudflare Workers + Durable Objects | No: Express and `ws` don't run on Workers; the relay must be rewritten for the Workers runtime | Free plan covers 100,000 requests/day ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)) | Hibernates, wakes on message | Strongest edge posture, everything on `je-ng.ca` | Rejected for now: a rewrite of `game.js`, `apiHandler.js` and the dev server. Revisit if rooms ever outgrow one machine |
| Home machine + Cloudflare Tunnel | Yes | $0 | When the laptop sleeps | Exposes a personal machine; its other services, files and OS patching become part of the attack surface | Rejected: up only when the laptop is, and a compromise reaches personal files |
| VPS (Hetzner, DigitalOcean) | Yes | About $4-6/month | No | You patch the OS, configure the firewall and TLS | Rejected: more to maintain for the same result as Fly |

**Recommendation:** Fly.io, one machine in Toronto (`yyz`) if Fly still offers it, else the nearest region, with Supabase in `ca-central-1`. Cloudflare proxies `trivia.je-ng.ca` in front of it.

## Decisions

- **Exactly one app machine.** Rooms, chat history and rate-limit counters live in memory, so a second machine would split rooms in half. `fly launch` creates two machines by default for availability; deploy with `fly deploy --ha=false` and set `min_machines_running = 1`, `auto_stop_machines = "off"` in `fly.toml`. Scaling past one machine is out of scope (see *Left out*).
- **Cloudflare in front, and the origin refuses anything that didn't come through it.** Without this, `https://<app>.fly.dev` bypasses Cloudflare's WAF and rate limits. A Cloudflare Transform Rule adds `X-Origin-Auth: <ORIGIN_SECRET>` to every request; the app returns 403 when it's missing or wrong, except `GET /healthz` for Fly's health check. Rejected: running `cloudflared` inside the container so the app has no public ingress at all. Stronger, but it adds a second process to the image and Fly's health checks must go through the tunnel; worth revisiting if the header approach is ever bypassed.
- **Client IP comes from `CF-Connecting-IP`, trusted only after the origin header checks out.** Otherwise anyone hitting the origin directly could set it and dodge per-IP rate limits.
- **Supabase keep-alive.** Free projects pause after a week of low activity. The app server runs `select 1` against Postgres once a day from a `setInterval` in `apps/builder/server/index.js` (hosted mode only), which keeps it awake as long as the Fly machine is up. Rejected: a GitHub Actions cron, because GitHub disables scheduled workflows after 60 days without repo activity.

## Steps

### Step 1: production hardening in the server (before any deploy)

- `apps/builder/server/index.js`: in hosted mode (`TRIVIA_STORAGE=supabase`), add middleware in this order: origin-secret check, security headers, site gate from [03](03-site-password-and-accounts.md), then `apiMiddleware` and static files.
- Headers (set by hand; one dependency fewer than `helmet` and the list is short):
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; media-src https:; connect-src 'self' wss://trivia.je-ng.ca; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`. Question media are arbitrary `https:` URLs, which is why `img-src`/`media-src` allow `https:`. The YouTube hosts come from `apps/builder/client/src/youtube.js`, `Media.vue` and `BackgroundAudio.vue`; the Google Fonts link is in `apps/builder/client/index.html`. Check the browser console during a full game for CSP violations and adjust the list, not the policy's shape.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`.
- `attachGameSocket` in `game.js`: reject an upgrade whose `Origin` isn't `PUBLIC_ORIGIN` (env, `https://trivia.je-ng.ca`). Browsers send cookies on WebSocket upgrades from any site, and the socket doesn't follow CORS, so this check is the only thing stopping another page from joining as the victim.
- Rate limits in memory, keyed by client IP: site-password and sign-in attempts 5/minute, sign-ups 3/hour, socket connections 30/minute. One small `rateLimit(key, limit, windowMs)` helper in `apps/builder/server/rateLimit.js`.
- `GET /healthz` returning 200 with no body.
- Error responses: today `apiMiddleware` returns `Server error: ${err.message}` on 500s, which can leak SQL or file paths once Postgres is behind it. In hosted mode log the message and return `Server error.` only.

### Step 2: container and Fly

- `Dockerfile` at the repo root: `node:24-slim` (matches `.nvmrc`), `npm ci`, `npm run build`, run `node apps/builder/server/index.js` as the non-root `node` user. `.dockerignore` excludes `data/`, `import/`, `.env*`, `node_modules`, `tools/harvester/.cache`.
- `fly.toml` with the machine settings above and an HTTP health check on `/healthz`.
- Secrets via `fly secrets set`: `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SITE_PASSWORD_HASH`, `SESSION_SECRET`, `TICKET_SECRET`, `ORIGIN_SECRET`, `PUBLIC_ORIGIN`. Never in `fly.toml`, which is committed.

### Step 3: Cloudflare

- DNS: `trivia.je-ng.ca` CNAME to the Fly app, proxied (orange cloud). `fly certs add trivia.je-ng.ca`.
- SSL/TLS mode **Full (strict)**, *Always Use HTTPS* on, minimum TLS 1.2.
- Transform Rule adding `X-Origin-Auth`.
- WAF rate-limiting rule (the free plan includes one): `/auth/*` and `/gate` at 10 requests per 10 seconds per IP, as a second layer over the app's own limits.
- WebSockets are on by default for proxied hostnames; confirm under *Network*.

### Step 4: backups

- Supabase free projects have no downloadable backups. A weekly manual `npx supabase db dump --data-only -f backup-YYYY-MM-DD.sql` to an encrypted folder outside the repo, plus one before every migration. Write the restore command in `README.md` and test a restore into the local `supabase start` once.

## Pre-deploy checklist

Every doc's deploy step links here. Tick all before `fly deploy`:

- [ ] `npm test` passes, including the Supabase suite against a local `supabase start`.
- [ ] `grep -ri supabase apps/builder/client/dist` finds no URL or key.
- [ ] `curl -i https://<app>.fly.dev/` returns 403 (origin lock).
- [ ] `curl -i https://trivia.je-ng.ca/api/library` without cookies returns 401/redirect, never data.
- [ ] A WebSocket from a page on another origin is refused (test with `new WebSocket('wss://trivia.je-ng.ca/ws/game')` in the console of any other site).
- [ ] Six wrong site-password attempts in a minute get 429.
- [ ] Response headers include the CSP and HSTS above (`curl -sI`).
- [ ] A full game, including YouTube media, runs with no CSP errors in the console.
- [ ] Two test accounts cannot see each other's private questions (see [04](04-question-visibility.md) once built).
- [ ] RLS is enabled on every table: `select relname from pg_class where relrowsecurity = false and relnamespace = 'public'::regnamespace and relkind = 'r';` returns no rows.
- [ ] A backup was taken in the last 7 days.

## Tests

- `apps/builder/test/security.test.js`: origin-secret check (missing, wrong, right, `/healthz` exempt), header presence, the WebSocket `Origin` rejection, rate limiter window and reset, the hosted 500 message.
- Run: `npm test`.

## Verify

The checklist above, run against the live URL after the first deploy, then a real game on two phones over mobile data (not home Wi-Fi), so nothing relies on the LAN.

## Docs to update

- `README.md`: new *Deploying* section (Fly, Cloudflare, secrets list, backup and restore), and the *Security* paragraph under *Phone play* rewritten for hosted mode.
- `SCOPE.md`: §5 row 4 (remote play) moves in scope with [06](06-online-rooms.md).
- `PLAN.md`: tick Phase 17.

## Open questions

- Fly's `yyz` region: confirm it's still offered when creating the app.
- Does Jess want an uptime alert (Fly emails on failed health checks; a free external monitor is optional)?

## Left out

- More than one app machine. Rooms in memory would need a shared store (Redis or Postgres `LISTEN/NOTIFY`) and sticky routing; a friends-and-family site doesn't need it.
- Cloudflare Access (Zero Trust login in front of the whole site). It could replace the site password, but Jess chose a password plus QR tickets, and Access's email one-time codes add friction for party guests.
- Penetration testing tools and a formal audit. The checklist covers the realistic attacks for this audience.
