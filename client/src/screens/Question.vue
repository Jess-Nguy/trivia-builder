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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The options shown for the current question, by type.
const displayOptions = ref([]);
function buildOptions() {
  const cur = q.value;
  if (!cur) return (displayOptions.value = []);
  if (cur.type === 'True or False') displayOptions.value = ['TRUE', 'FALSE'];
  else if (cur.type === 'Multiple Choice') displayOptions.value = shuffle(cur.options);
  else displayOptions.value = []; // Single Choice / w-Media have no clickable options
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

function resetForQuestion() {
  selected.value = null;
  hintShown.value = false;
  buildOptions();
  startTimer();
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
  const chosen = selected.value != null ? displayOptions.value[selected.value] : null;
  store.submitQuestion(chosen);
}

function onKey(e) {
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
    <div v-if="store.settings.timer > 0" class="timer">{{ mmss }}</div>

    <div class="category">Category: {{ q.categories.join(', ') || '—' }}</div>
    <div class="qnum">Question #{{ store.index + 1 }} of {{ store.questions.length }}:</div>
    <div class="qtext">{{ q.question }}</div>

    <Media v-if="q.type === 'Single Choice w/ Media'" :src="q.attachment" />

    <div class="options" v-if="displayOptions.length">
      <div
        v-for="(opt, i) in displayOptions"
        :key="i"
        class="option"
        :class="{ selected: selected === i }"
        @click="selectOption(i)"
      >
        <span class="num">{{ i + 1 }}</span>
        <span>{{ opt }}</span>
      </div>
    </div>

    <p v-if="hintShown" class="hint-text" style="font-size: 18px">💡 {{ q.hint }}</p>

    <div class="q-actions">
      <button v-if="hasHint" class="btn btn-orange" @click="showHint">HINT?</button>
      <span v-else></span>
      <button class="btn btn-green" @click="submit">SUBMIT</button>
    </div>
  </div>
</template>
