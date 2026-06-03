<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { store } from '../store.js';
import { fetchFiles, fetchQuestions } from '../api.js';

// Label for questions that carry no category, so they remain playable when
// filtering is active rather than being silently dropped from the pool.
const UNCATEGORIZED = 'Uncategorized';

const files = ref([]);
const error = ref('');
const loading = ref(false);

// Parsed data for the currently selected file.
const loaded = ref(null); // { questions, problems, total }

// Categories the player has chosen to include. Empty until a file loads, then
// defaults to every category (i.e. play everything).
const selectedCategories = ref([]);

const form = reactive({
  numPlayers: 1,
  fileName: '',
  numQuestions: 1,
  timer: 0,
  recordPoints: false,
  recordHints: false,
  hintsSubtract: false,
});

// A question's categories, falling back to the Uncategorized bucket.
function questionCats(q) {
  return q.categories.length ? q.categories : [UNCATEGORIZED];
}

// Every distinct category present in the loaded file, sorted for display.
const categories = computed(() => {
  if (!loaded.value) return [];
  const set = new Set();
  for (const q of loaded.value.questions) questionCats(q).forEach((c) => set.add(c));
  return [...set].sort((a, b) => a.localeCompare(b));
});

// Questions matching the current category selection (a question is included if
// any of its categories is selected).
const filteredQuestions = computed(() => {
  if (!loaded.value) return [];
  const sel = selectedCategories.value;
  if (sel.length === 0) return [];
  return loaded.value.questions.filter((q) => questionCats(q).some((c) => sel.includes(c)));
});

const allSelected = computed(
  () => categories.value.length > 0 && selectedCategories.value.length === categories.value.length,
);

const maxQuestions = computed(() => filteredQuestions.value.length || 1);
const fileSelected = computed(() => !!form.fileName && !!loaded.value);

// Keep the requested question count within the filtered pool as the selection changes.
watch(maxQuestions, (max) => {
  if (form.numQuestions > max) form.numQuestions = max;
});

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
  selectedCategories.value = [];
  if (!form.fileName) return;
  loading.value = true;
  try {
    const data = await fetchQuestions(form.fileName);
    loaded.value = data;
    selectedCategories.value = [...categories.value]; // start with everything selected
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

function toggleAllCategories() {
  selectedCategories.value = allSelected.value ? [] : [...categories.value];
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
  if (!fileSelected.value || filteredQuestions.value.length === 0) return;
  clampPlayers();
  clampQuestions();
  clampTimer();
  store.startGame({ ...form }, filteredQuestions.value);
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

    <div v-if="fileSelected && categories.length" class="form-row cat-row">
      <label>
        Categories
        <br /><span class="hint-text">(pick 1 or more to filter)</span>
      </label>
      <div class="cat-picker">
        <label class="cat-all">
          <input
            type="checkbox"
            :checked="allSelected"
            @change="toggleAllCategories"
          />
          Select all
        </label>
        <div class="checks cat-list">
          <label v-for="cat in categories" :key="cat">
            <input type="checkbox" :value="cat" v-model="selectedCategories" /> {{ cat }}
          </label>
        </div>
      </div>
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
    <p v-if="fileSelected && categories.length" class="hint-text">
      {{ filteredQuestions.length }} question(s) match the selected categor{{ selectedCategories.length === 1 ? 'y' : 'ies' }}.
    </p>
    <p v-if="fileSelected && categories.length && selectedCategories.length === 0" class="error">
      Select at least one category to play.
    </p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="start-wrap">
      <button
        class="btn btn-green"
        :disabled="!fileSelected || filteredQuestions.length === 0"
        @click="startGame"
      >
        START GAME
      </button>
    </div>
  </div>
</template>
