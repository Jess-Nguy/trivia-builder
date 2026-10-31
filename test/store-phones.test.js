// Phone play in the game store: which phone answers lock in, how they're
// graded, and the points pre-awarded on the way to the Scoreboard.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../client/src/store.js';

const MC = {
  question: 'Which planet is red?',
  type: 'Multiple Choice',
  options: [{ text: 'Venus' }, { text: 'Mars' }, { text: 'Jupiter' }],
  currentAnswer: 'Mars',
  points: 2,
  categories: [],
};
const OPEN = { question: 'Capital of Canada?', type: 'Single Choice', options: [], currentAnswer: 'Ottawa', points: 1, categories: [] };

const SETTINGS = {
  fileName: 'test.csv',
  numPlayers: 2,
  numQuestions: 1,
  timer: 0,
  mode: 'competition',
  recordPoints: true,
  recordHints: false,
  hintsSubtract: false,
  phones: true,
  ordered: true,
  categories: [],
};

function startWith(question, settings = SETTINGS) {
  store.playedByFile = {};
  store.startGame(settings, [question]);
  store.setShownOptions(question.options);
  store.openAnswers();
}

describe('locking in', () => {
  beforeEach(() => startWith(MC));

  test('a choice is graded against the shown option\'s text', () => {
    store.receiveAnswer(0, { n: 0, choice: 1 });
    assert.deepEqual({ ...store.teamAnswers[0] }, { choice: 1, text: 'Mars', correct: true });
  });

  test('the first answer from a team wins', () => {
    store.receiveAnswer(0, { n: 0, choice: 0 });
    assert.equal(store.receiveAnswer(0, { n: 0, choice: 1 }), false);
    assert.equal(store.teamAnswers[0].text, 'Venus');
  });

  test('an answer for another question is dropped', () => {
    assert.equal(store.receiveAnswer(0, { n: 1, choice: 1 }), false);
  });

  test('an answer after the reveal is dropped', () => {
    store.submitQuestion();
    assert.equal(store.receiveAnswer(0, { n: 0, choice: 1 }), false);
  });

  test('an option index past the shown options is dropped', () => {
    assert.equal(store.receiveAnswer(0, { n: 0, choice: 9 }), false);
  });

  test('a typed answer is dropped on a choice question', () => {
    assert.equal(store.receiveAnswer(0, { n: 0, text: 'Mars' }), false);
  });
});

describe('typed answers', () => {
  beforeEach(() => startWith(OPEN));

  test('an exact match ignoring case and spaces is pre-marked right', () => {
    store.receiveAnswer(0, { n: 0, text: '  ottawa ' });
    assert.equal(store.teamAnswers[0].correct, true);
  });

  test('anything else is pre-marked wrong for the host to check', () => {
    store.receiveAnswer(0, { n: 0, text: 'Ottowa' });
    assert.equal(store.teamAnswers[0].correct, false);
  });
});

describe('going to the Scoreboard', () => {
  beforeEach(() => {
    startWith(MC);
    store.receiveAnswer(0, { n: 0, choice: 1 });
    store.receiveAnswer(1, { n: 0, choice: 2 });
    store.submitQuestion();
  });

  test('teams marked right get the question\'s points', () => {
    store.afterAnswer();
    assert.deepEqual(store.players.map((p) => p.points), [2, 0]);
  });

  test('a host override changes who gets the points', () => {
    store.setTeamCorrect(0, false);
    store.setTeamCorrect(1, true);
    store.afterAnswer();
    assert.deepEqual(store.players.map((p) => p.points), [0, 2]);
  });

  test('nothing is pre-awarded when points aren\'t recorded', () => {
    startWith(MC, { ...SETTINGS, recordPoints: false, recordHints: true });
    store.receiveAnswer(0, { n: 0, choice: 1 });
    store.submitQuestion();
    store.afterAnswer();
    assert.deepEqual(store.players.map((p) => p.points), [0, 0]);
  });

  test('a wrong team doesn\'t lock everyone\'s points', () => {
    assert.equal(store.pointsLocked, false);
  });

  test('the room-wide streak record is skipped', () => {
    assert.equal(store.record.graded, 0);
  });
});
