// Phone-play relay: the room code, who may host, what each phone is allowed to
// see, and which team an answer is credited to.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GameHub } from '../server/game.js';

const CODE = 'ABCD';
const TOKEN_A = 'player-aaaa';
const TOKEN_B = 'player-bbbb';

function fakeConn(local = false) {
  const sent = [];
  return { local, sent, send: (obj) => sent.push(obj), last: (t) => sent.filter((m) => m.t === t).at(-1) };
}
const say = (hub, conn, msg) => hub.message(conn, JSON.stringify(msg));

const TEAMS = [{ id: 0, name: 'Owls' }, { id: 1, name: 'Foxes' }];

let hub;
let host;
beforeEach(() => {
  hub = new GameHub({ makeCode: () => CODE });
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
    say(hub, phone, { t: 'join', code: CODE, token: TOKEN_A });
    say(hub, phone, { t: 'state', state: { phase: 'hacked' } });
    assert.equal(hub.state, null);
  });
});

describe('joining', () => {
  test('a wrong code is refused', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', code: 'ZZZZ', token: TOKEN_A });
    assert.match(phone.last('error').error, /No game/);
    assert.equal(hub.phones.size, 0);
  });

  test('the code is case-insensitive', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', code: ' abcd ', token: TOKEN_A });
    assert.equal(phone.last('joined').code, CODE);
  });

  test('a team past the host\'s team count is ignored', () => {
    say(hub, host, { t: 'state', state: { teams: TEAMS } });
    const phone = fakeConn();
    say(hub, phone, { t: 'join', code: CODE, token: TOKEN_A, team: 5 });
    assert.equal(hub.phones.get(phone).team, null);
  });

  test('the roster counts a player with two tabs once', () => {
    const tab1 = fakeConn();
    const tab2 = fakeConn();
    say(hub, tab1, { t: 'join', code: CODE, token: TOKEN_A, team: 1 });
    say(hub, tab2, { t: 'join', code: CODE, token: TOKEN_A, team: 1 });
    assert.deepEqual(host.last('roster'), { t: 'roster', teams: { 1: 1 }, total: 1 });
  });

  test('a phone leaving updates the roster', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', code: CODE, token: TOKEN_A, team: 0 });
    hub.disconnect(phone);
    assert.deepEqual(host.last('roster'), { t: 'roster', teams: {}, total: 0 });
  });
});

describe('what a phone sees', () => {
  const STATE = { teams: TEAMS, phase: 'question', answers: { 0: { label: 'B' }, 1: { label: 'D' } } };

  test('only its own team\'s answer', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', code: CODE, token: TOKEN_A, team: 1 });
    say(hub, host, { t: 'state', state: STATE });
    const seen = phone.last('state').state;
    assert.deepEqual(seen.mine, { label: 'D' });
    assert.equal(seen.answers, undefined);
  });

  test('no answers before picking a team', () => {
    const phone = fakeConn();
    say(hub, phone, { t: 'join', code: CODE, token: TOKEN_A });
    say(hub, host, { t: 'state', state: STATE });
    assert.equal(phone.last('state').state.mine, null);
  });

  test('the current state as soon as it joins', () => {
    say(hub, host, { t: 'state', state: STATE });
    const phone = fakeConn();
    say(hub, phone, { t: 'join', code: CODE, token: TOKEN_A, team: 0 });
    assert.equal(phone.last('state').state.phase, 'question');
  });
});

describe('answers', () => {
  let phone;
  beforeEach(() => {
    say(hub, host, { t: 'state', state: { teams: TEAMS } });
    phone = fakeConn();
    say(hub, phone, { t: 'join', code: CODE, token: TOKEN_B, team: 1 });
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

test('malformed messages are ignored', () => {
  assert.doesNotThrow(() => hub.message(host, 'not json'));
  assert.doesNotThrow(() => hub.message(host, 'null'));
});
