// Phone-play relay: the room code, who may host, what each phone is allowed to
// see, and which team an answer is credited to.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GameHub } from '../server/game.js';
import { LibraryError } from '../server/library.js';

const CODE = 'ABCD';
const TOKEN_A = 'player-aaaa';
const TOKEN_B = 'player-bbbb';

function fakeConn(local = false) {
  const sent = [];
  return { local, sent, send: (obj) => sent.push(obj), last: (t) => sent.filter((m) => m.t === t).at(-1) };
}
const say = (hub, conn, msg) => hub.message(conn, JSON.stringify(msg));

const TEAMS = [{ id: 0, name: 'Owls' }, { id: 1, name: 'Foxes' }];

// A stand-in bank that records what it was asked to save.
function fakeLibrary() {
  const saved = [];
  return {
    saved,
    categories: () => ['Animal', 'Space'],
    submitQuestion(input, author) {
      if (input.question === 'dupe') throw new LibraryError(409, 'Too close to a question already in the bank.');
      saved.push({ input, author: { name: author.name, token: author.token } });
      return { id: `q${saved.length}`, ...input };
    },
  };
}

let hub;
let host;
let library;
beforeEach(() => {
  library = fakeLibrary();
  hub = new GameHub({ makeCode: () => CODE, library });
  host = fakeConn(true);
  say(hub, host, { t: 'host' });
});

describe('hosting', () => {
  test('the host gets the room code', () => {
    assert.equal(host.last('room').code, CODE);
  });

  test('a device on the LAN cannot host', () => {
    const phone = fakeConn(false);
    say(hub, phone, { t: 'host' });
    assert.equal(phone.last('room'), undefined);
    assert.match(phone.last('error').error, /Only the computer/);
  });

  test('a reconnecting host keeps the same code', () => {
    hub.disconnect(host);
    const again = fakeConn(true);
    say(hub, again, { t: 'host' });
    assert.equal(again.last('room').code, CODE);
  });

  test('only the host can broadcast state', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A });
    say(hub, phone, { t: 'state', state: { phase: 'hacked' } });
    assert.equal(hub.state, null);
  });
});

describe('joining', () => {
  test('a wrong code is refused', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: 'ZZZZ', token: TOKEN_A });
    assert.match(phone.last('error').error, /No game/);
    assert.equal(hub.phones.size, 0);
  });

  test('a phone without a nickname is refused', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: '   ', code: CODE, token: TOKEN_A });
    assert.match(phone.last('error').error, /nickname/);
    assert.equal(hub.phones.size, 0);
  });

  test('a long nickname is capped at 24 characters', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'x'.repeat(50), code: CODE, token: TOKEN_A });
    assert.equal(hub.phones.get(phone).name.length, 24);
  });

  test('a joined phone gets the bank\'s categories', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A });
    assert.deepEqual(phone.last('joined').categories, ['Animal', 'Space']);
  });

  test('the code is case-insensitive', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: ' abcd ', token: TOKEN_A });
    assert.equal(phone.last('joined').code, CODE);
  });

  test('a team past the host\'s team count is ignored', () => {
    say(hub, host, { t: 'state', state: { teams: TEAMS } });
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 5 });
    assert.equal(hub.phones.get(phone).team, null);
  });

  test('the roster counts a player with two tabs once', () => {
    const tab1 = fakeConn();
    const tab2 = fakeConn();
    say(hub, tab1, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 1 });
    say(hub, tab2, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 1 });
    assert.deepEqual(host.last('roster'), { t: 'roster', teams: { 1: 1 }, total: 1 });
  });

  test('a phone leaving updates the roster', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 0 });
    hub.disconnect(phone);
    assert.deepEqual(host.last('roster'), { t: 'roster', teams: {}, total: 0 });
  });
});

describe('what a phone sees', () => {
  const STATE = { teams: TEAMS, phase: 'question', answers: { 0: { label: 'B' }, 1: { label: 'D' } } };

  test('only its own team\'s answer', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 1 });
    say(hub, host, { t: 'state', state: STATE });
    const seen = phone.last('state').state;
    assert.deepEqual(seen.mine, { label: 'D' });
    assert.equal(seen.answers, undefined);
  });

  test('no answers before picking a team', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A });
    say(hub, host, { t: 'state', state: STATE });
    assert.equal(phone.last('state').state.mine, null);
  });

  test('the current state as soon as it joins', () => {
    say(hub, host, { t: 'state', state: STATE });
    const phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 0 });
    assert.equal(phone.last('state').state.phase, 'question');
  });
});

describe('answers', () => {
  let phone;
  beforeEach(() => {
    say(hub, host, { t: 'state', state: { teams: TEAMS } });
    phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_B, team: 1 });
  });

  test('are credited to the phone\'s team, not the team in the message', () => {
    say(hub, phone, { t: 'answer', team: 0, n: 3, choice: 2 });
    assert.deepEqual(host.last('answer'), { t: 'answer', team: 1, n: 3, choice: 2 });
  });

  test('typed answers are trimmed and capped at 80 characters', () => {
    say(hub, phone, { t: 'answer', n: 0, text: `  ${'x'.repeat(200)}  ` });
    assert.equal(host.last('answer').text.length, 80);
  });

  test('a blank typed answer is dropped', () => {
    say(hub, phone, { t: 'answer', n: 0, text: '   ' });
    assert.equal(host.last('answer'), undefined);
  });

  test('a phone without a team cannot answer', () => {
    say(hub, phone, { t: 'team', team: null });
    say(hub, phone, { t: 'answer', n: 0, choice: 0 });
    assert.equal(host.last('answer'), undefined);
  });
});

describe('player-written questions on screen', () => {
  const AUTHORED = {
    teams: TEAMS,
    phase: 'question',
    question: { n: 0, text: 'Q', author: { name: 'Sam', token: TOKEN_A } },
  };
  let author;
  let other;
  beforeEach(() => {
    author = fakeConn();
    other = fakeConn();
    say(hub, author, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 0 });
    say(hub, other, { t: 'join', name: 'Lee', code: CODE, token: TOKEN_B, team: 1 });
    say(hub, host, { t: 'state', state: AUTHORED });
  });

  test('the author\'s phone is told it wrote the question', () => {
    assert.equal(author.last('state').state.question.wrote, true);
  });

  test('other phones see the author\'s name but not that they wrote it', () => {
    const q = other.last('state').state.question;
    assert.equal(q.author, 'Sam');
    assert.equal(q.wrote, false);
  });

  test('no phone receives the author\'s token', () => {
    assert.doesNotMatch(JSON.stringify(other.sent), new RegExp(TOKEN_A));
  });

  test('the author cannot answer their own question', () => {
    say(hub, author, { t: 'answer', n: 0, choice: 1 });
    assert.equal(host.last('answer'), undefined);
  });

  test('the author\'s teammates can still answer', () => {
    const mate = fakeConn();
    say(hub, mate, { t: 'join', name: 'Kim', code: CODE, token: 'player-cccc', team: 0 });
    say(hub, mate, { t: 'answer', n: 0, choice: 1 });
    assert.equal(host.last('answer').team, 0);
  });
});

describe('submitting questions', () => {
  const QUESTION = { question: 'What colour is a polar bear\'s skin?', currentAnswer: 'Black', type: 'Single Choice' };
  let phone;
  const setPhase = (phase) => say(hub, host, { t: 'state', state: { teams: TEAMS, phase } });
  beforeEach(() => {
    phone = fakeConn();
    say(hub, phone, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 0 });
    setPhase('lobby');
  });

  for (const phase of ['lobby', 'reveal', 'scores', 'final']) {
    test(`is open during ${phase}`, () => {
      setPhase(phase);
      say(hub, phone, { t: 'submit', question: QUESTION });
      assert.equal(phone.last('submitted').question, QUESTION.question);
    });
  }

  test('is closed while a question is being answered', () => {
    setPhase('question');
    say(hub, phone, { t: 'submit', question: QUESTION });
    assert.match(phone.last('rejected').error, /after this one/);
    assert.equal(library.saved.length, 0);
  });

  test('is closed before the host has shared any state', () => {
    const fresh = new GameHub({ makeCode: () => CODE, library });
    const h = fakeConn(true);
    say(fresh, h, { t: 'host' });
    const p = fakeConn();
    say(fresh, p, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A });
    say(fresh, p, { t: 'submit', question: QUESTION });
    assert.ok(p.last('rejected'));
  });

  test('credits the phone\'s own nickname and token, not ones in the message', () => {
    say(hub, phone, { t: 'submit', question: { ...QUESTION, submittedBy: 'Mallory' }, name: 'Mallory' });
    assert.deepEqual(library.saved[0].author, { name: 'Sam', token: TOKEN_A });
  });

  test('tells the host a question arrived', () => {
    say(hub, phone, { t: 'submit', question: QUESTION });
    assert.deepEqual(host.last('submitted'), { t: 'submitted', by: 'Sam' });
  });

  test('passes the bank\'s rejection back to the phone', () => {
    say(hub, phone, { t: 'submit', question: { ...QUESTION, question: 'dupe' } });
    assert.match(phone.last('rejected').error, /Too close/);
  });

  test('stops after 20 questions from one player', () => {
    for (let i = 0; i < 21; i++) say(hub, phone, { t: 'submit', question: { ...QUESTION, question: `Q${i}` } });
    assert.equal(library.saved.length, 20);
    assert.match(phone.last('rejected').error, /20 questions/);
  });

  test('a phone that never joined cannot submit', () => {
    const stranger = fakeConn();
    say(hub, stranger, { t: 'submit', question: QUESTION });
    assert.equal(library.saved.length, 0);
  });
});

describe('chat', () => {
  let clock;
  let owl;
  let mate;
  let fox;
  const chats = (conn) => conn.sent.filter((m) => m.t === 'chat').map((m) => m.message);
  beforeEach(() => {
    clock = 0;
    hub = new GameHub({ makeCode: () => CODE, library, now: () => (clock += 1000) });
    host = fakeConn(true);
    say(hub, host, { t: 'host' });
    say(hub, host, { t: 'state', state: { teams: TEAMS, phase: 'lobby' } });
    owl = fakeConn();
    mate = fakeConn();
    fox = fakeConn();
    say(hub, owl, { t: 'join', name: 'Sam', code: CODE, token: TOKEN_A, team: 0 });
    say(hub, mate, { t: 'join', name: 'Kim', code: CODE, token: 'player-cccc', team: 0 });
    say(hub, fox, { t: 'join', name: 'Lee', code: CODE, token: TOKEN_B, team: 1 });
  });

  test('an all-players message reaches every phone', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: 'hi all' });
    assert.equal(chats(fox).at(-1).text, 'hi all');
    assert.equal(chats(mate).at(-1).text, 'hi all');
  });

  test('a team message reaches teammates only', () => {
    say(hub, owl, { t: 'chat', channel: 'team', text: 'it is B' });
    assert.equal(chats(mate).at(-1).text, 'it is B');
    assert.equal(chats(fox).length, 0);
  });

  test('the host never receives chat', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: 'hi' });
    say(hub, owl, { t: 'chat', channel: 'team', text: 'psst' });
    assert.equal(host.sent.some((m) => m.t === 'chat'), false);
  });

  test('the sender name comes from the hub, not the message', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: 'hi', name: 'Mallory' });
    assert.equal(chats(fox).at(-1).name, 'Sam');
  });

  test('only the sender sees its message as mine', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: 'hi' });
    assert.equal(chats(owl).at(-1).mine, true);
    assert.equal(chats(fox).at(-1).mine, false);
  });

  test('no phone receives another player\'s token', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: 'hi' });
    assert.doesNotMatch(JSON.stringify(fox.sent), new RegExp(TOKEN_A));
  });

  test('text is trimmed and capped at 200 characters', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: `  ${'x'.repeat(300)}  ` });
    assert.equal(chats(fox).at(-1).text.length, 200);
  });

  test('a blank message is dropped', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: '   ' });
    assert.equal(chats(fox).length, 0);
  });

  test('a phone without a team cannot use the team channel', () => {
    say(hub, owl, { t: 'team', team: null });
    say(hub, owl, { t: 'chat', channel: 'team', text: 'psst' });
    assert.equal(chats(mate).length, 0);
  });

  test('a phone that never joined cannot chat', () => {
    say(hub, fakeConn(), { t: 'chat', channel: 'all', text: 'hi' });
    assert.equal(chats(fox).length, 0);
  });

  test('messages closer together than 500ms are refused', () => {
    hub.now = () => 5000;
    say(hub, owl, { t: 'chat', channel: 'all', text: 'one' });
    say(hub, owl, { t: 'chat', channel: 'all', text: 'two' });
    assert.deepEqual(chats(fox).map((m) => m.text), ['one']);
    assert.match(owl.last('chatError').error, /Slow down/);
  });

  test('a joining phone gets the all-players history', () => {
    say(hub, owl, { t: 'chat', channel: 'all', text: 'hi' });
    const late = fakeConn();
    say(hub, late, { t: 'join', name: 'Ana', code: CODE, token: 'player-dddd', team: 1 });
    assert.deepEqual(late.last('chatHistory').all.map((m) => m.text), ['hi']);
  });

  test('switching team swaps in the new team\'s history', () => {
    say(hub, owl, { t: 'chat', channel: 'team', text: 'owls only' });
    say(hub, fox, { t: 'team', team: 0 });
    assert.deepEqual(fox.last('chatHistory').team.map((m) => m.text), ['owls only']);
  });

  test('history keeps the last 50 messages per channel', () => {
    for (let i = 0; i < 55; i++) say(hub, owl, { t: 'chat', channel: 'all', text: `m${i}` });
    const late = fakeConn();
    say(hub, late, { t: 'join', name: 'Ana', code: CODE, token: 'player-dddd' });
    const all = late.last('chatHistory').all;
    assert.equal(all.length, 50);
    assert.equal(all[0].text, 'm5');
  });
});

test('malformed messages are ignored', () => {
  assert.doesNotThrow(() => hub.message(host, 'not json'));
  assert.doesNotThrow(() => hub.message(host, 'null'));
});
