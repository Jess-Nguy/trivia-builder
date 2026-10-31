<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import Media from '../components/Media.vue';
import EndGameButton from '../components/EndGameButton.vue';
import GameProgress from '../components/GameProgress.vue';

const LETTERS = 'ABCDE';

const q = computed(() => store.currentQuestion);
const selected = ref(null);
const hintShown = ref(false);
const remaining = ref(0);
let timerId = null;
// Host pause (P or the Pause button) freezes the answer timer while the room argues.
const paused = ref(false);

// Reading-delay phase: when a question has `delaySecs > 0`, we first show the
// question (and media) with options/buttons hidden so the host can read it
// aloud. The answer timer only starts once the delay ends (or is skipped).
const phase = ref('answering'); // 'reading' | 'answering'
const delayRemaining = ref(0);
let delayId = null;
const isReading = computed(() => phase.value === 'reading');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The options shown for the current question, by type. Each entry is an
// { text, attachment } object; attachments render as media beside the option.
const displayOptions = ref([]);
function buildOptions() {
  const cur = q.value;
  if (!cur) return (displayOptions.value = []);
  if (cur.type === 'True or False') displayOptions.value = cur.options; // fixed TRUE/FALSE order
  else if (cur.type === 'Multiple Choice') displayOptions.value = shuffle(cur.options);
  else displayOptions.value = []; // Single Choice has no clickable options
  // Publish the exact order shown so the Answer Reveal lists options identically.
  store.setShownOptions(displayOptions.value);
}

const hasHint = computed(() => !!q.value?.hint);
// Showcasing mode is present-only: options are shown for context but not chosen,
// and the action button reveals the answer rather than submitting a guess.
const selectable = computed(() => store.isCompetition);
const submitLabel = computed(() => (store.isCompetition ? 'SUBMIT' : 'REVEAL ANSWER'));

function startTimer() {
  clearTimer();
  if (store.settings.timer > 0) {
    remaining.value = store.settings.timer;
    paused.value = false;
    timerId = setInterval(() => {
      if (paused.value) return;
      remaining.value -= 1;
      if (remaining.value <= 0) {
        clearTimer();
        submit();
      }
    }, 1000);
  }
}
function clearTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

// Start the reading delay: count down `delaySecs`, then begin answering.
function startReading() {
  clearDelay();
  phase.value = 'reading';
  delayRemaining.value = q.value.delaySecs;
  delayId = setInterval(() => {
    delayRemaining.value -= 1;
    if (delayRemaining.value <= 0) beginAnswering();
  }, 1000);
}
function clearDelay() {
  if (delayId) clearInterval(delayId);
  delayId = null;
}
// Reveal options/buttons and start the regular answer timer.
function beginAnswering() {
  clearDelay();
  phase.value = 'answering';
  startTimer();
}
// Skip the reading delay (Space) — jump straight to answering.
function skipDelay() {
  if (isReading.value) beginAnswering();
}

function resetForQuestion() {
  selected.value = null;
  // Reflect any hint already taken for this question, so stepping back from the
  // Answer Reveal re-shows the hint instead of letting it be counted twice.
  hintShown.value = store.hintsTakenThisQuestion > 0;
  buildOptions();
  if (q.value?.delaySecs > 0) startReading();
  else beginAnswering();
}

function selectOption(i) {
  if (!selectable.value) return; // showcasing mode: options aren't chosen
  if (i < displayOptions.value.length) selected.value = i;
}
function showHint() {
  if (!hintShown.value) {
    hintShown.value = true;
    store.takeHint();
  }
}
function togglePause() {
  if (store.settings.timer > 0 && !isReading.value) paused.value = !paused.value;
}

function submit() {
  clearTimer();
  const chosen = selected.value != null ? displayOptions.value[selected.value].text : null;
  store.submitQuestion(chosen);
}

function onKey(e) {
  // While reading, only Space (skip the delay) is active; ignore answer keys.
  if (isReading.value) {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      return skipDelay();
    }
    return;
  }
  if (e.key === 'Enter') return submit();
  if (e.key.toLowerCase() === 'h' && hasHint.value) return showHint();
  if (e.key.toLowerCase() === 'p') return togglePause();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && n >= 1) return selectOption(n - 1);
  const letter = LETTERS.indexOf(e.key.toUpperCase());
  if (e.key.length === 1 && letter >= 0) selectOption(letter);
}

watch(() => store.index, resetForQuestion);
onMounted(() => {
  resetForQuestion();
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  clearTimer();
  clearDelay();
  window.removeEventListener('keydown', onKey);
});

// Share of the answer timer left, for the draining bar; the last 5 seconds
// (or last quarter of a short timer) switch it to the warning look.
const timeLeft = computed(() => (store.settings.timer > 0 ? Math.max(0, remaining.value) / store.settings.timer : 1));
const timeLow = computed(() => store.settings.timer > 0 && remaining.value <= Math.min(5, store.settings.timer / 4));

const mmss = computed(() => {
  const s = Math.max(0, remaining.value);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});
</script>

<template>
  <div class="panel" v-if="q">
    <EndGameButton />
    <div class="top-row">
      <div class="plaque"><span class="plaque-main">Trivia</span> <span class="plaque-script">builder</span></div>
      <GameProgress />
      <div v-if="isReading" class="timer reading-timer">📖 Reading… {{ delayRemaining }}</div>
      <div v-else-if="store.settings.timer > 0" class="timer-wrap">
        <button class="tool-btn" :title="paused ? 'Resume timer (P)' : 'Pause timer (P)'" @click="togglePause">
          {{ paused ? '▶ Resume' : '⏸ Pause' }}
        </button>
        <div class="timer" :class="{ 'is-low': timeLow && !paused, 'is-paused': paused }">
          <span v-if="paused">⏸ Paused</span><span v-else-if="timeLow">⏰ Hurry!</span> {{ mmss }}
        </div>
      </div>
      <div v-else class="timer-spacer"></div>
    </div>
    <div v-if="!isReading && store.settings.timer > 0" class="timer-track" :class="{ 'is-low': timeLow }" aria-hidden="true">
      <div class="timer-fill" :style="{ transform: `scaleX(${timeLeft})` }"></div>
    </div>

    <div class="q-card hero-card">
      <div class="medallion" aria-hidden="true">?</div>
      <div class="category-chip">{{ q.categories.join(', ') || 'General' }}</div>
      <div class="qtext">{{ q.question }}</div>
    </div>

    <Media v-if="q.attachment" :src="q.attachment" />

    <p v-if="isReading" class="reading-hint">Reading time — press <kbd>Space</kbd> to skip</p>

    <template v-else>
      <div class="options" v-if="displayOptions.length">
        <button
          v-for="(opt, i) in displayOptions"
          :key="i"
          type="button"
          class="option hero-item"
          :style="{ '--i': i + 1 }"
          :class="{ selected: selected === i, 'not-selectable': !selectable }"
          :aria-pressed="selectable ? selected === i : undefined"
          @click="selectOption(i)"
        >
          <span class="badge">{{ LETTERS[i] }}</span>
          <span class="option-text" v-if="opt.text">{{ opt.text }}</span>
          <Media v-if="opt.attachment" :src="opt.attachment" class="option-media" />
          <span v-if="selected === i" class="locked">✓ Locked in</span>
        </button>
      </div>

      <p v-if="hintShown" class="hint-bubble">💡 {{ q.hint }}</p>

      <div class="q-actions">
        <button v-if="hasHint" class="btn btn-orange" :disabled="hintShown" @click="showHint">💡 HINT <kbd>H</kbd></button>
        <span v-else></span>
        <button class="btn btn-green btn-big" @click="submit">{{ submitLabel }} <kbd>Enter</kbd></button>
      </div>
    </template>
  </div>
</template>
