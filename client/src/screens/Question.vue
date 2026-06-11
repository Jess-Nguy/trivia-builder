<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import Media from '../components/Media.vue';
import EndGameButton from '../components/EndGameButton.vue';

const q = computed(() => store.currentQuestion);
const selected = ref(null);
const hintShown = ref(false);
const remaining = ref(0);
let timerId = null;

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

function startTimer() {
  clearTimer();
  if (store.settings.timer > 0) {
    remaining.value = store.settings.timer;
    timerId = setInterval(() => {
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
  hintShown.value = false;
  buildOptions();
  if (q.value?.delaySecs > 0) startReading();
  else beginAnswering();
}

function selectOption(i) {
  if (i < displayOptions.value.length) selected.value = i;
}
function showHint() {
  if (!hintShown.value) {
    hintShown.value = true;
    store.takeHint();
  }
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
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && n >= 1) selectOption(n - 1);
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

const mmss = computed(() => {
  const s = Math.max(0, remaining.value);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});
</script>

<template>
  <div class="panel" v-if="q">
    <EndGameButton />
    <div class="brand">Trivia Builder</div>
    <div v-if="isReading" class="timer reading-timer">📖 Reading… {{ delayRemaining }}</div>
    <div v-else-if="store.settings.timer > 0" class="timer">{{ mmss }}</div>

    <div class="category">Category: {{ q.categories.join(', ') || '—' }}</div>
    <div class="qnum">Question #{{ store.index + 1 }} of {{ store.questions.length }}:</div>
    <div class="qtext">{{ q.question }}</div>

    <Media v-if="q.attachment" :src="q.attachment" />

    <p v-if="isReading" class="reading-hint">Reading time — press <kbd>Space</kbd> to skip</p>

    <template v-else>
      <div class="options" v-if="displayOptions.length">
        <div
          v-for="(opt, i) in displayOptions"
          :key="i"
          class="option"
          :class="{ selected: selected === i }"
          @click="selectOption(i)"
        >
          <span class="num">{{ i + 1 }}</span>
          <span v-if="opt.text">{{ opt.text }}</span>
          <Media v-if="opt.attachment" :src="opt.attachment" class="option-media" />
        </div>
      </div>

      <p v-if="hintShown" class="hint-text" style="font-size: 18px">💡 {{ q.hint }}</p>

      <div class="q-actions">
        <button v-if="hasHint" class="btn btn-orange" @click="showHint">HINT?</button>
        <span v-else></span>
        <button class="btn btn-green" @click="submit">SUBMIT</button>
      </div>
    </template>
  </div>
</template>
