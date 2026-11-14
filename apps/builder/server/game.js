import crypto from 'node:crypto';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { LibraryError, getLibrary, submitQuestion } from './library.js';

// WebSocket path for phone play. Every other upgrade (e.g. Vite's HMR socket on
// the same dev server) is left alone.
export const GAME_PATH = '/ws/game';

const MAX_TEAMS = 8;
const MAX_TEXT = 80;
const MAX_NAME = 24;
// Questions one phone may write per room, so a stuck button can't flood the bank.
const MAX_SUBMISSIONS = 20;
// Phones may write questions whenever nobody is answering one.
const SUBMIT_PHASES = new Set(['lobby', 'reveal', 'scores', 'final']);
const MAX_CHAT = 200;
// Messages kept per channel, sent to a phone when it joins or switches team.
const CHAT_HISTORY = 50;
// Shortest gap between one player's chat messages.
const CHAT_GAP_MS = 500;
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

const bank = { submitQuestion, categories: () => getLibrary().categories };

// One room per server: the host browser (on this machine) owns the game state
// and broadcasts it; phones join with the room code and send answers back. The
// hub only relays, and trims each phone's copy of the state to its own team's
// answer so teams can't read each other's picks before the reveal.
//
// A connection is `{ local, send(obj) }`, so tests can drive the hub without
// real sockets, and `library` can be swapped for a fake bank.
export class GameHub {
  constructor({ makeCode = randomCode, library = bank, now = Date.now } = {}) {
    this.makeCode = makeCode;
    this.library = library;
    this.code = null;
    this.host = null;
    this.state = null;
    this.phones = new Map(); // conn -> { token, name, team }
    this.submissions = new Map(); // token -> questions written this room
    this.now = now;
    this.chatId = 0;
    this.chatLog = { all: [], teams: new Map() }; // team -> messages
    this.lastChat = new Map(); // token -> time of last message
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
      case 'submit': return this.submit(conn, msg.question);
      case 'chat': return this.chat(conn, msg);
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
    for (const [phone, p] of this.phones) phone.send({ t: 'state', state: this.stateFor(p) });
  }

  join(conn, { code, token, name, team }) {
    if (!this.code || String(code ?? '').trim().toUpperCase() !== this.code) {
      return conn.send({ t: 'error', error: 'No game with that code.' });
    }
    if (!TOKEN_RE.test(String(token ?? ''))) return conn.send({ t: 'error', error: 'Bad player token.' });
    const nickname = typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '';
    if (!nickname) return conn.send({ t: 'error', error: 'Pick a nickname first.' });
    const p = { token, name: nickname, team: this.validTeam(team) };
    this.phones.set(conn, p);
    conn.send({ t: 'joined', code: this.code, categories: this.library.categories() });
    conn.send({ t: 'state', state: this.stateFor(p) });
    this.sendChatHistory(conn, p);
    this.sendRoster();
  }

  pickTeam(conn, team) {
    const p = this.phones.get(conn);
    if (!p) return;
    p.team = this.validTeam(team);
    conn.send({ t: 'state', state: this.stateFor(p) });
    this.sendChatHistory(conn, p);
    this.sendRoster();
  }

  // Chat between phones on the `all` channel or the sender's own team channel.
  // The sender's name and team come from the hub's record, never the message.
  // The host gets nothing, so team talk never reaches the TV.
  chat(conn, { channel, text }) {
    const p = this.phones.get(conn);
    if (!p || (channel !== 'all' && channel !== 'team')) return;
    if (channel === 'team' && p.team == null) return;
    const body = typeof text === 'string' ? text.trim().slice(0, MAX_CHAT) : '';
    if (!body) return;
    const at = this.now();
    if (at - (this.lastChat.get(p.token) ?? -Infinity) < CHAT_GAP_MS) {
      return conn.send({ t: 'chatError', error: 'Slow down a little.' });
    }
    this.lastChat.set(p.token, at);
    const entry = { id: ++this.chatId, channel, name: p.name, token: p.token, text: body, at };
    let log = this.chatLog.all;
    if (channel === 'team') {
      log = this.chatLog.teams.get(p.team) ?? [];
      this.chatLog.teams.set(p.team, log);
    }
    log.push(entry);
    if (log.length > CHAT_HISTORY) log.shift();
    for (const [phone, other] of this.phones) {
      if (channel === 'team' && other.team !== p.team) continue;
      phone.send({ t: 'chat', message: chatFor(entry, other) });
    }
  }

  sendChatHistory(conn, p) {
    const team = p.team == null ? [] : this.chatLog.teams.get(p.team) ?? [];
    conn.send({
      t: 'chatHistory',
      all: this.chatLog.all.map((m) => chatFor(m, p)),
      team: team.map((m) => chatFor(m, p)),
    });
  }

  // The team comes from the hub's record of this phone, never from the message,
  // so a phone can only answer for the team it joined.
  answer(conn, { n, choice, text }) {
    const p = this.phones.get(conn);
    if (!p || p.team == null || !this.host) return;
    if (this.state?.question?.author?.token === p.token) return;
    const out = { t: 'answer', team: p.team, n };
    if (Number.isInteger(choice)) out.choice = choice;
    else if (typeof text === 'string' && text.trim()) out.text = text.trim().slice(0, MAX_TEXT);
    else return;
    this.host.send(out);
  }

  // Save a question written on this phone. The author is the hub's record of
  // the phone, never a name or token from the message.
  submit(conn, question) {
    const p = this.phones.get(conn);
    if (!p) return;
    const reject = (error, problems = []) => conn.send({ t: 'rejected', error, problems });
    if (!SUBMIT_PHASES.has(this.state?.phase)) return reject('Questions open again after this one.');
    const count = this.submissions.get(p.token) ?? 0;
    if (count >= MAX_SUBMISSIONS) return reject(`That's ${MAX_SUBMISSIONS} questions from you tonight. Thank you!`);
    try {
      const q = this.library.submitQuestion(question && typeof question === 'object' ? question : {}, p);
      this.submissions.set(p.token, count + 1);
      conn.send({ t: 'submitted', question: q.question });
      this.host?.send({ t: 'submitted', by: p.name });
    } catch (err) {
      if (err instanceof LibraryError) return reject(err.message, err.problems);
      reject('Could not save the question.');
    }
  }

  validTeam(team) {
    const count = Array.isArray(this.state?.teams) ? this.state.teams.length : MAX_TEAMS;
    return Number.isInteger(team) && team >= 0 && team < count ? team : null;
  }

  // The state a phone may see: the shared view plus its own team's locked
  // answer (`mine`), with every other team's answer removed. A player-written
  // question carries its author's name; only the author's phone learns it
  // `wrote` it, and no phone gets the author's token.
  stateFor({ team, token }) {
    if (!this.state) return null;
    const { answers, question, ...shared } = this.state;
    const out = { ...shared, mine: team != null ? answers?.[team] ?? null : null };
    if (question) {
      const { author, ...rest } = question;
      out.question = author ? { ...rest, author: author.name, wrote: author.token === token } : rest;
    }
    return out;
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

// A chat message as one phone sees it: `mine` instead of the sender's token.
function chatFor({ token, ...rest }, viewer) {
  return { ...rest, mine: token === viewer.token };
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
