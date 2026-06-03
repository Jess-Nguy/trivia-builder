<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { store } from '../store.js';
import { fetchFiles, fetchQuestions } from '../api.js';

const files = ref([]);
const error = ref('');
const loading = ref(false);

// Parsed data for the currently selected file.
const loaded = ref(null); // { questions, problems, total }

const form = reactive({
  numPlayers: 1,
  fileName: '',
  numQuestions: 1,
  timer: 0,
  recordPoints: false,
  recordHints: false,
  hintsSubtract: false,
});

const maxQuestions = computed(() => loaded.value?.total ?? 1);
const fileSelected = computed(() => !!form.fileName && !!loaded.value);

onMounted(async () => {
  try {
    files.value = await fetchFiles();
  } catch (e) {
    error.value = e.message;
  }
});

async function onFileChange() {
  error.value = '';
  loaded.value = null;
  if (!form.fileName) return;
  loading.value = true;
  try {
    const data = await fetchQuestions(form.fileName);
    loaded.value = data;
    form.numQuestions = Math.min(form.numQuestions || 1, data.total) || 1;
    if (data.total === 0) {
      error.value = 'This file has no valid questions.';
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function clampPlayers() {
  form.numPlayers = Math.min(8, Math.max(1, Math.round(form.numPlayers || 1)));
}
function clampQuestions() {
  const n = Math.round(form.numQuestions || 1);
  form.numQuestions = Math.min(maxQuestions.value, Math.max(1, n));
}
function clampTimer() {
  form.timer = Math.min(300, Math.max(0, Math.round(form.timer || 0)));
}

function startGame() {
  if (!fileSelected.value || loaded.value.total === 0) return;
  clampPlayers();
  clampQuestions();
  clampTimer();
  store.startGame({ ...form }, loaded.value.questions);
}
</script>

<template>
  <div class="panel">
    <div class="brand">Trivia Builder</div>
    <h1 class="title">Game Mode</h1>

    <div class="form-row">
      <label>number of teams/users:</label>
      <input type="number" min="1" max="8" v-model.number="form.numPlayers" @change="clampPlayers" />
    </div>

    <div class="form-row">
      <label>select questions file:</label>
      <select v-model="form.fileName" @change="onFileChange">
        <option value="" disabled>— choose a file from /import —</option>
        <option v-for="f in files" :key="f" :value="f">{{ f }}</option>
      </select>
    </div>

    <div class="form-row">
      <label>How many questions?</label>
      <input
        type="number"
        min="1"
        :max="maxQuestions"
        v-model.number="form.numQuestions"
        :disabled="!fileSelected"
        @change="clampQuestions"
      />
    </div>

    <div class="form-row">
      <label>Question Timer<br /><span class="hint-text">(default 0 = no timer, max 300s)</span></label>
      <input type="number" min="0" max="300" v-model.number="form.timer" @change="clampTimer" />
    </div>

    <div class="checks">
      <label><input type="checkbox" v-model="form.recordPoints" /> record points</label>
      <label><input type="checkbox" v-model="form.recordHints" /> record how many hints taken</label>
      <label><input type="checkbox" v-model="form.hintsSubtract" /> hints subtracts points</label>
    </div>

    <p v-if="loading" class="hint-text">Loading questions…</p>
    <p v-if="loaded && loaded.problems.length" class="hint-text">
      {{ loaded.total }} valid questions · {{ loaded.problems.length }} row(s) skipped for validation issues.
    </p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="start-wrap">
      <button class="btn btn-green" :disabled="!fileSelected || maxQuestions === 0" @click="startGame">
        START GAME
      </button>
    </div>
  </div>
</template>
