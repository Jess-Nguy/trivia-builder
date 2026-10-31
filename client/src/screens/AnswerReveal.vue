<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import Media from '../components/Media.vue';
import EndGameButton from '../components/EndGameButton.vue';
import GameProgress from '../components/GameProgress.vue';
import { answerLabel } from '../multiplayer.js';

const LETTERS = 'ABCDE';

const q = computed(() => store.currentQuestion);
const isChoice = computed(() => q.value && (q.value.type === 'Multiple Choice' || q.value.type === 'True or False'));
// Each option is an { text, attachment } object (TRUE/FALSE included for T/F).
// Use the order shown on the Question screen (Multiple Choice is shuffled) so the
// numbering matches; fall back to the question's own order if none was recorded.
const choiceOptions = computed(() =>
  store.shownOptions.length ? store.shownOptions : q.value?.options || [],
);

// Correct/wrong banner only shows for auto-gradable (competition) questions.
// With phone play each team gets its own verdict instead.
const graded = computed(() => store.isGradable && !store.phonePlay);

function toggleTeam(p) {
  const a = store.teamAnswers[p.id];
  if (a) store.setTeamCorrect(p.id, !a.correct);
}
const correct = computed(() => store.isCorrect);

const norm = (s) => String(s ?? '').trim().toLowerCase();
function optionState(opt) {
  // Highlight the correct option whenever it can be pinpointed (the answer
  // exactly matches an option) — in showcasing mode too, so the host can
  // present it. The chosen-wrong mark needs a graded selection (competition).
  if (q.value && norm(opt.text) === norm(q.value.currentAnswer)) return 'correct';
  if (graded.value && store.selectedAnswer && norm(opt.text) === norm(store.selectedAnswer)) return 'chosen-wrong';
  return '';
}

// The medallion on the card carries the verdict: ✓ / ✗ when graded, ! otherwise.
const medal = computed(() => (!graded.value ? '!' : correct.value ? '✓' : '✗'));
const verdictText = computed(() =>
  correct.value ? 'Correct!' : store.selectedAnswer ? 'Incorrect' : 'No answer selected',
);
const optionMark = { correct: '✓', 'chosen-wrong': '✗' };

// A random quip on the verdict stamp, picked once per reveal.
const GOOD = ['Nailed it!', 'Big brain!', 'Called it!', 'On the money!', 'Too easy!'];
const BAD = ['Nope!', 'So close!', 'Not even!', 'Objection!', 'Denied!'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const quip = pick(correct.value ? GOOD : BAD);

function next() {
  store.afterAnswer();
}
// Step back to the question (e.g. Enter was pressed by accident).
function back() {
  store.backToQuestion();
}
function onKey(e) {
  if (e.key === 'Enter') next();
  // 1–8 flip that team's phone answer between right and wrong.
  const n = parseInt(e.key, 10);
  if (store.phonePlay && !Number.isNaN(n) && n >= 1 && n <= store.players.length) toggleTeam(store.players[n - 1]);
  // Backspace or ArrowLeft go back to the question.
  if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
    e.preventDefault();
    back();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="panel answer" v-if="q">
    <EndGameButton />
    <div class="top-row">
      <div class="plaque"><span class="plaque-main">Trivia</span> <span class="plaque-script">builder</span></div>
      <GameProgress />
      <div class="reveal-nav">
        <button class="btn back-btn" @click="back">&lt; BACK</button>
        <button class="btn btn-yellow next-btn" @click="next">NEXT &gt;</button>
      </div>
    </div>

    <div class="q-card" :class="{ shake: graded && !correct }">
      <div
        class="medallion reveal-hero"
        :class="graded ? (correct ? 'medal-correct' : 'medal-wrong') : ''"
        aria-hidden="true"
      >{{ medal }}</div>
      <div class="category-chip">{{ q.categories.join(', ') || 'General' }}</div>
      <div class="qtext">{{ q.question }}</div>
    </div>

    <Media v-if="q.attachment" :src="q.attachment" />

    <div v-if="graded" class="verdict-row">
      <div class="stamp" role="status" :class="correct ? 'stamp-correct' : 'stamp-wrong'">
        <span class="stamp-label">{{ correct ? '✓' : '✗' }} {{ verdictText }}</span>
        <span class="stamp-quip">{{ quip }}</span>
      </div>
    </div>

    <div class="answer-banner reveal-hero" style="--i: 1">
      <span class="answer-label">Answer</span>
      <span class="answer-text">{{ q.currentAnswer }}</span>
    </div>

    <div class="answer-body explanation reveal-hero" style="--i: 2" v-if="q.explanation">{{ q.explanation }}</div>
    <p v-if="q.source === 'public'" class="written-by reveal-hero" style="--i: 2">✍️ Written by <strong>{{ q.submittedBy }}</strong></p>

    <div v-if="store.phonePlay" class="team-answers reveal-hero" style="--i: 3">
      <p class="hint-text">Phone answers · click a team or press its number to flip right/wrong</p>
      <button
        v-for="(p, i) in store.players"
        :key="p.id"
        type="button"
        class="team-answer"
        :class="store.teamAnswers[p.id] ? (store.teamAnswers[p.id].correct ? 'is-right' : 'is-wrong') : 'is-none'"
        :style="{ '--team': p.color }"
        :disabled="!store.teamAnswers[p.id]"
        :aria-pressed="store.teamAnswers[p.id] ? store.teamAnswers[p.id].correct : undefined"
        @click="toggleTeam(p)"
      >
        <span class="badge">{{ i + 1 }}</span>
        <span class="team-answer-name">{{ p.name }}</span>
        <span class="team-answer-text">{{ store.teamAnswers[p.id] ? answerLabel(store.teamAnswers[p.id]) : 'No answer' }}</span>
        <span class="team-answer-mark">{{ store.teamAnswers[p.id] ? (store.teamAnswers[p.id].correct ? '✓ Right' : '✗ Wrong') : '—' }}</span>
      </button>
    </div>

    <div class="options answer-options" v-if="isChoice">
      <div
        v-for="(opt, i) in choiceOptions"
        :key="i"
        class="option not-selectable"
        :class="optionState(opt) || 'dimmed'"
      >
        <span class="badge">{{ LETTERS[i] }}</span>
        <span class="option-text" v-if="opt.text">{{ opt.text }}</span>
        <Media v-if="opt.attachment" :src="opt.attachment" class="option-media" />
        <span v-if="optionMark[optionState(opt)]" class="mark">{{ optionMark[optionState(opt)] }}</span>
      </div>
    </div>
  </div>
</template>
