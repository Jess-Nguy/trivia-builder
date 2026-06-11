<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { store } from '../store.js';
import { fetchFiles, fetchQuestions, fetchBackgroundAudio } from '../api.js';

// Label for questions that carry no category, so they remain playable when
// filtering is active rather than being silently dropped from the pool.
const UNCATEGORIZED = 'Uncategorized';

const files = ref([]);
const audioTracks = ref([]); // background-music options from background audio.csv
const error = ref('');
const loading = ref(false);

// The store holds the selected track live (it plays on this page too), so the
// dropdown binds straight to it. Setting an empty link turns music off.
function onAudioChange(e) {
  const link = e.target.value;
  const track = audioTracks.value.find((t) => t.link === link);
  store.setAudioTrack(track || { link: '', title: '' });
}

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

// How many of the currently filtered questions haven't been played yet for this
// file. Reactive to store.playedByFile, so it updates after a game or a clear.
const unplayedCount = computed(() =>
  store.unplayedCount(form.fileName, filteredQuestions.value),
);
// Every filtered question has already been played — nothing left to serve.
const allPlayed = computed(
  () => fileSelected.value && filteredQuestions.value.length > 0 && unplayedCount.value === 0,
);
// Fewer unplayed remain than requested: the game will serve only what's left.
const shortPool = computed(
  () => unplayedCount.value > 0 && form.numQuestions > unplayedCount.value,
);

function clearPlayed() {
  store.clearPlayed(form.fileName);
}

// One entry per visible team/user slot, for rendering the name inputs.
const teamSlots = computed(() => Array.from({ length: form.numPlayers }, (_, i) => i));

// The 0-based indices of any slots whose effective name collides (case-
// insensitive) with an earlier slot's. Two teams may not share a name.
const duplicateSlots = computed(() => {
  const seen = new Map();
  const dupes = new Set();
  teamSlots.value.forEach((i) => {
    const key = store.effectiveName(i).trim().toLowerCase();
    if (seen.has(key)) dupes.add(i);
    else seen.set(key, i);
  });
  return dupes;
});
const hasDuplicateNames = computed(() => duplicateSlots.value.size > 0);

function onNameInput(i, value) {
  store.setPlayerName(i, value);
}

// Keep the stored names sized to the visible team count. Lowering the count
// discards names for the now-hidden slots ("keep only visible").
watch(() => form.numPlayers, (n) => store.resizeNames(n));

// Keep the requested question count within the filtered pool as the selection changes.
watch(maxQuestions, (max) => {
  if (form.numQuestions > max) form.numQuestions = max;
});

onMounted(async () => {
  // Seed the form from the previous game's saved settings, so the host's last
  // choices (team/question counts, timer, points/hints toggles) are the defaults.
  const saved = store.settings;
  form.numPlayers = saved.numPlayers;
  form.numQuestions = saved.numQuestions;
  form.timer = saved.timer;
  form.recordPoints = saved.recordPoints;
  form.recordHints = saved.recordHints;
  form.hintsSubtract = saved.hintsSubtract;

  // Restore the team count to cover any names saved from a previous session, so
  // reload-persisted names stay visible instead of being trimmed away. Only an
  // explicit lowering of the count discards names.
  if (store.playerNames.length > 0) {
    form.numPlayers = Math.min(8, Math.max(1, store.playerNames.length));
  }
  store.resizeNames(form.numPlayers);
  try {
    files.value = await fetchFiles();
  } catch (e) {
    error.value = e.message;
  }
  // Re-select the previously played file (if it still exists) and load its
  // questions, so the host can start the next round without re-picking.
  if (saved.fileName && files.value.includes(saved.fileName)) {
    form.fileName = saved.fileName;
    await onFileChange();
  }
  // Background-music options load independently — a failure here just leaves the
  // picker at "None" and never blocks question setup.
  audioTracks.value = await fetchBackgroundAudio();
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
  if (allPlayed.value) return;
  if (hasDuplicateNames.value) return;
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

    <div class="form-row name-row">
      <label>
        team/user names
        <br /><span class="hint-text">(leave blank for the default)</span>
      </label>
      <div class="name-list">
        <input
          v-for="i in teamSlots"
          :key="i"
          type="text"
          maxlength="30"
          class="name-input"
          :class="{ 'name-dupe': duplicateSlots.has(i) }"
          :value="store.playerNames[i] ?? ''"
          :placeholder="store.defaultName(i)"
          @input="onNameInput(i, $event.target.value)"
        />
      </div>
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

    <div v-if="audioTracks.length" class="form-row">
      <label>Background music<br /><span class="hint-text">(loops during the game)</span></label>
      <select :value="store.audio.link" @change="onAudioChange">
        <option value="">— None —</option>
        <option v-for="t in audioTracks" :key="t.link" :value="t.link">{{ t.title || t.link }}</option>
      </select>
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
    <p v-if="fileSelected && filteredQuestions.length" class="hint-text played-row">
      <span>{{ unplayedCount }} of {{ filteredQuestions.length }} still unplayed for this file.</span>
      <button
        v-if="unplayedCount < filteredQuestions.length"
        type="button"
        class="btn-link clear-played"
        @click="clearPlayed"
      >
        Clear played history
      </button>
    </p>
    <p v-if="fileSelected && categories.length && selectedCategories.length === 0" class="error">
      Select at least one category to play.
    </p>
    <p v-if="allPlayed" class="error">
      Every question in this selection has been played. Clear played history to replay them.
    </p>
    <p v-if="shortPool" class="hint-text">
      Only {{ unplayedCount }} unplayed question(s) remain — this game will play those.
    </p>
    <p v-if="hasDuplicateNames" class="error">
      Each team/user needs a unique name.
    </p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="start-wrap">
      <button
        class="btn btn-green"
        :disabled="!fileSelected || filteredQuestions.length === 0 || allPlayed || hasDuplicateNames"
        @click="startGame"
      >
        START GAME
      </button>
    </div>
  </div>
</template>
