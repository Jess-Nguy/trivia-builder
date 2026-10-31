import { reactive, watch } from 'vue';
import { store, PLAYER_COLORS } from './store.js';

// Host side of phone play. The host browser stays the source of truth: it
// sends a snapshot of what phones may see to the relay (server/game.js) and
// takes phone answers back into the store. The correct answer is only in the
// snapshot once the Answer Reveal is showing.

const LETTERS = 'ABCDE';
const RETRY_MS = 1500;

export const party = reactive({
  status: 'off', // off | connecting | live | error
  error: '',
  code: '',
  phonesByTeam: {}, // playerId -> phones joined
  totalPhones: 0,
  lan: { enabled: false, addresses: [] },
});

let ws = null;
let wanted = false;
let lastSent = '';

export function startParty() {
  wanted = true;
  if (!ws) connect();
  loadLan();
}

export function stopParty() {
  wanted = false;
  ws?.close();
  ws = null;
  Object.assign(party, { status: 'off', error: '', phonesByTeam: {}, totalPhones: 0 });
}

// The address phones open, for the QR code: the first LAN address on the port
// this page was served from.
export function joinUrl() {
  const ip = party.lan.addresses[0];
  if (!ip || !party.code) return '';
  return `${location.protocol}//${ip}${location.port ? `:${location.port}` : ''}/play?code=${party.code}`;
}

async function loadLan() {
  try {
    const res = await fetch('/api/lan');
    if (res.ok) party.lan = await res.json();
  } catch {
    /* no LAN info — the panel says phones can't reach this machine */
  }
}

function connect() {
  party.status = 'connecting';
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/game`);
  ws = sock;
  sock.onopen = () => {
    lastSent = '';
    sock.send(JSON.stringify({ t: 'host' }));
  };
  sock.onmessage = (e) => onMessage(JSON.parse(e.data));
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (!wanted) return;
    party.status = 'connecting';
    setTimeout(() => wanted && !ws && connect(), RETRY_MS);
  };
}

function onMessage(msg) {
  if (msg.t === 'room') {
    party.code = msg.code;
    party.status = 'live';
    party.error = '';
    publish();
  } else if (msg.t === 'roster') {
    party.phonesByTeam = msg.teams;
    party.totalPhones = msg.total;
  } else if (msg.t === 'answer') {
    store.receiveAnswer(msg.team, msg);
  } else if (msg.t === 'error') {
    party.status = 'error';
    party.error = msg.error;
  }
}

const optionLabel = (i) => LETTERS[i] ?? String(i + 1);

// How a team's locked answer reads on a phone and on the TV: the option letter
// (plus its text) or the typed answer.
export function answerLabel(a) {
  if (!a) return '';
  if (a.choice == null) return a.text;
  return a.text ? `${optionLabel(a.choice)}: ${a.text}` : optionLabel(a.choice);
}

function teams() {
  if (store.screen === 'gameMode' || store.screen === 'builder') {
    return store.playerNames.map((_, i) => ({
      id: i,
      name: store.effectiveName(i),
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    }));
  }
  return store.players.map(({ id, name, color }) => ({ id, name, color }));
}

function standings() {
  return [...store.totals]
    .sort((a, b) => b.total - a.total)
    .map(({ id, name, total }) => ({ id, name, total }));
}

// What phones may see right now. `answers` is stripped by the relay to the
// phone's own team, so locked picks stay private until the reveal.
export function snapshot() {
  const s = store.screen;
  const base = { teams: teams() };
  if (s === 'gameMode' || s === 'builder') return { ...base, phase: 'lobby' };
  if (s === 'final') return { ...base, phase: 'final', standings: standings(), winners: store.winners.map((w) => w.id) };

  const q = store.currentQuestion;
  const answers = Object.fromEntries(
    Object.entries(store.teamAnswers).map(([id, a]) => [id, { label: answerLabel(a), correct: a.correct }]),
  );
  const question = {
    n: store.index,
    total: store.questions.length,
    text: q?.question ?? '',
    options: store.shownOptions.map((o, i) => ({ label: optionLabel(i), text: o.text, picture: !!o.attachment })),
  };
  if (s === 'question') {
    // Hide whether the answer was right until the reveal.
    const locked = Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, { label: a.label }]));
    return { ...base, phase: 'question', open: store.answersOpen, question, answers: locked };
  }
  return {
    ...base,
    phase: s === 'answer' ? 'reveal' : 'scores',
    question: { ...question, answer: q?.currentAnswer ?? '' },
    answers,
    standings: standings(),
  };
}

function publish() {
  if (party.status !== 'live' || ws?.readyState !== WebSocket.OPEN) return;
  const json = JSON.stringify({ t: 'state', state: snapshot() });
  if (json === lastSent) return;
  lastSent = json;
  ws.send(json);
}

watch(snapshot, publish, { deep: true });
