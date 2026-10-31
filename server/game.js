import crypto from 'node:crypto';
import os from 'node:os';
import { WebSocketServer } from 'ws';

// WebSocket path for phone play. Every other upgrade (e.g. Vite's HMR socket on
// the same dev server) is left alone.
export const GAME_PATH = '/ws/game';

const MAX_TEAMS = 8;
const MAX_TEXT = 80;
// No I or O, so a code read off the TV can't be mistaken for 1 or 0.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TOKEN_RE = /^[A-Za-z0-9-]{8,64}$/;

// Whether the server accepts connections from other devices. Set by the dev
// server (only with `--host`) and the production server, which listens on every
// interface.
export const network = { lanEnabled: false };

export function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// The machine's LAN IPv4 addresses, for the join URL shown on the TV.
export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

function randomCode() {
  return Array.from({ length: 4 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join('');
}

// One room per server: the host browser (on this machine) owns the game state
// and broadcasts it; phones join with the room code and send answers back. The
// hub only relays, and trims each phone's copy of the state to its own team's
// answer so teams can't read each other's picks before the reveal.
//
// A connection is `{ local, send(obj) }`, so tests can drive the hub without
// real sockets.
export class GameHub {
  constructor({ makeCode = randomCode } = {}) {
    this.makeCode = makeCode;
    this.code = null;
    this.host = null;
    this.state = null;
    this.phones = new Map(); // conn -> { token, team }
  }

  message(conn, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'host': return this.attachHost(conn);
      case 'state': return this.setState(conn, msg.state);
      case 'join': return this.join(conn, msg);
      case 'team': return this.pickTeam(conn, msg.team);
      case 'answer': return this.answer(conn, msg);
    }
  }

  disconnect(conn) {
    // The room and its code outlive the host tab, so a reload reattaches and
    // phones don't need to rejoin.
    if (conn === this.host) this.host = null;
    if (this.phones.delete(conn)) this.sendRoster();
  }

  attachHost(conn) {
    if (!conn.local) return conn.send({ t: 'error', error: 'Only the computer running the game can host.' });
    this.host = conn;
    this.code ??= this.makeCode();
    conn.send({ t: 'room', code: this.code });
    this.sendRoster();
  }

  setState(conn, state) {
    if (conn !== this.host || !state || typeof state !== 'object') return;
    this.state = state;
    for (const [phone, p] of this.phones) phone.send({ t: 'state', state: this.stateFor(p.team) });
  }

  join(conn, { code, token, team }) {
    if (!this.code || String(code ?? '').trim().toUpperCase() !== this.code) {
      return conn.send({ t: 'error', error: 'No game with that code.' });
    }
    if (!TOKEN_RE.test(String(token ?? ''))) return conn.send({ t: 'error', error: 'Bad player token.' });
    const p = { token, team: this.validTeam(team) };
    this.phones.set(conn, p);
    conn.send({ t: 'joined', code: this.code });
    conn.send({ t: 'state', state: this.stateFor(p.team) });
    this.sendRoster();
  }

  pickTeam(conn, team) {
    const p = this.phones.get(conn);
    if (!p) return;
    p.team = this.validTeam(team);
    conn.send({ t: 'state', state: this.stateFor(p.team) });
    this.sendRoster();
  }

  // The team comes from the hub's record of this phone, never from the message,
  // so a phone can only answer for the team it joined.
  answer(conn, { n, choice, text }) {
    const p = this.phones.get(conn);
    if (!p || p.team == null || !this.host) return;
    const out = { t: 'answer', team: p.team, n };
    if (Number.isInteger(choice)) out.choice = choice;
    else if (typeof text === 'string' && text.trim()) out.text = text.trim().slice(0, MAX_TEXT);
    else return;
    this.host.send(out);
  }

  validTeam(team) {
    const count = Array.isArray(this.state?.teams) ? this.state.teams.length : MAX_TEAMS;
    return Number.isInteger(team) && team >= 0 && team < count ? team : null;
  }

  // The state a phone on `team` may see: the shared view plus its own team's
  // locked answer (`mine`), with every other team's answer removed.
  stateFor(team) {
    if (!this.state) return null;
    const { answers, ...shared } = this.state;
    return { ...shared, mine: team != null ? answers?.[team] ?? null : null };
  }

  // Phones per team, counting a player once even with two tabs open.
  sendRoster() {
    if (!this.host) return;
    const byTeam = {};
    const seen = new Set();
    for (const { token, team } of this.phones.values()) {
      if (team == null || seen.has(token)) continue;
      seen.add(token);
      byTeam[team] = (byTeam[team] || 0) + 1;
    }
    const total = new Set([...this.phones.values()].map((p) => p.token)).size;
    this.host.send({ t: 'roster', teams: byTeam, total });
  }
}

// Serve the phone-play socket on an existing HTTP server (Vite's in dev,
// Express's in production).
export function attachGameSocket(httpServer) {
  const hub = new GameHub();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  httpServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== GAME_PATH) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = {
        local: isLoopback(req.socket.remoteAddress),
        send: (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj)),
      };
      ws.on('message', (data) => hub.message(conn, data.toString()));
      ws.on('close', () => hub.disconnect(conn));
      ws.on('error', () => ws.close());
    });
  });
  return hub;
}
