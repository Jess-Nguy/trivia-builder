<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { store } from '../store.js';
import {
  fetchFiles,
  fetchLibrary,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addToPlaylist,
  importCsv,
  playlistCsvUrl,
} from '../api.js';
import QuestionEditor from '../components/QuestionEditor.vue';

const ALL = 'all';
const TYPES = ['Single Choice', 'Multiple Choice', 'True or False'];

const library = reactive({ questions: [], playlists: [], categories: [] });
const files = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');

const activeId = ref(ALL);
const search = ref('');
const catFilter = ref('');
const typeFilter = ref('');
const selected = ref([]);
const bulkTarget = ref('');
const editing = ref(null); // null | 'new' | question id
const editor = ref(null);

const newPlaylist = reactive({ name: '', ordered: false });
const importFile = ref('');

const byId = computed(() => new Map(library.questions.map((q) => [q.id, q])));
const activePlaylist = computed(() => library.playlists.find((p) => p.id === activeId.value) || null);
const filtersActive = computed(() => !!(search.value.trim() || catFilter.value || typeFilter.value));
// Reordering by position only makes sense on the full, unfiltered list.
const canReorder = computed(() => !!activePlaylist.value?.ordered && !filtersActive.value);

const baseList = computed(() =>
  activePlaylist.value
    ? activePlaylist.value.questionIds.map((id) => byId.value.get(id)).filter(Boolean)
    : library.questions,
);

const visible = computed(() => {
  const term = search.value.trim().toLowerCase();
  return baseList.value.filter(
    (q) =>
      (!term || q.question.toLowerCase().includes(term) || q.currentAnswer.toLowerCase().includes(term)) &&
      (!catFilter.value || q.categories.includes(catFilter.value)) &&
      (!typeFilter.value || q.type === typeFilter.value),
  );
});

const editingQuestion = computed(() =>
  editing.value && editing.value !== 'new' ? byId.value.get(editing.value) || null : null,
);
const playlistCount = (q) => library.playlists.filter((p) => p.questionIds.includes(q.id)).length;
const allVisibleSelected = computed(
  () => visible.value.length > 0 && visible.value.every((q) => selected.value.includes(q.id)),
);

async function load() {
  try {
    Object.assign(library, await fetchLibrary());
    if (activeId.value !== ALL && !activePlaylist.value) activeId.value = ALL;
    const ids = new Set(library.questions.map((q) => q.id));
    selected.value = selected.value.filter((id) => ids.has(id));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await load();
  try {
    files.value = await fetchFiles();
  } catch {
    /* import picker just stays empty */
  }
});

// Run a library change, show any error, then reload so every list reflects the server.
// The notice is `message`, or whatever the action returns when it depends on the result.
async function run(action, message = '') {
  error.value = '';
  notice.value = '';
  try {
    notice.value = (await action()) || message;
  } catch (e) {
    error.value = e.message;
  }
  await load();
}

function confirmDiscard() {
  return !editor.value?.isDirty || confirm('Discard unsaved changes to this question?');
}

function openEditor(id) {
  if (editing.value === id || !confirmDiscard()) return;
  editing.value = id;
}

function closeEditor() {
  if (confirmDiscard()) editing.value = null;
}

function goBack() {
  if (confirmDiscard()) store.screen = 'gameMode';
}

function selectPlaylist(id) {
  activeId.value = id;
  selected.value = [];
}

async function onSaved(q, _playlistIds, addAnother) {
  await load();
  editing.value = addAnother ? 'new' : q.id;
  notice.value = 'Saved.';
}

async function onDeleted() {
  editing.value = null;
  await load();
  notice.value = 'Question deleted.';
}

function toggleAllVisible() {
  const ids = visible.value.map((q) => q.id);
  selected.value = allVisibleSelected.value
    ? selected.value.filter((id) => !ids.includes(id))
    : [...new Set([...selected.value, ...ids])];
}

function addPlaylist() {
  const { name, ordered } = newPlaylist;
  run(async () => {
    const p = await createPlaylist({ name, ordered });
    newPlaylist.name = '';
    newPlaylist.ordered = false;
    activeId.value = p.id;
  }, `Created "${name.trim()}".`);
}

function renamePlaylist(e) {
  const p = activePlaylist.value;
  if (e.target.value.trim() === p.name) return;
  run(() => updatePlaylist(p.id, { name: e.target.value }));
}

function setOrdered(ordered) {
  run(() => updatePlaylist(activePlaylist.value.id, { ordered }));
}

function removePlaylist() {
  const p = activePlaylist.value;
  if (!confirm(`Delete the playlist "${p.name}"? Its questions stay in the bank.`)) return;
  run(async () => {
    await deletePlaylist(p.id);
    activeId.value = ALL;
  }, `Deleted "${p.name}".`);
}

function addSelectedTo() {
  const target = library.playlists.find((p) => p.id === bulkTarget.value);
  if (!target || !selected.value.length) return;
  const n = selected.value.length;
  run(async () => {
    await addToPlaylist(target.id, selected.value);
    selected.value = [];
  }, `Added ${n} question(s) to "${target.name}".`);
}

function removeFromPlaylist(ids) {
  const p = activePlaylist.value;
  const drop = new Set(ids);
  run(async () => {
    await updatePlaylist(p.id, { questionIds: p.questionIds.filter((id) => !drop.has(id)) });
    selected.value = selected.value.filter((id) => !drop.has(id));
  }, `Removed ${ids.length} question(s) from "${p.name}".`);
}

function move(index, dir) {
  const ids = [...activePlaylist.value.questionIds];
  const j = index + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[index], ids[j]] = [ids[j], ids[index]];
  // Optimistic so repeated clicks feel instant; load() in run() corrects any drift.
  activePlaylist.value.questionIds = ids;
  run(() => updatePlaylist(activePlaylist.value.id, { questionIds: ids }));
}

function runImport() {
  const name = importFile.value;
  if (!name) return;
  run(async () => {
    const r = await importCsv(name);
    activeId.value = r.playlist.id;
    importFile.value = '';
    return `Imported "${name}" as playlist "${r.playlist.name}": ${r.added} new, ${r.reused} already in the bank${r.skipped ? `, ${r.skipped} invalid row problem(s) skipped` : ''}.`;
  });
}
</script>

<template>
  <div class="panel builder">
    <div class="builder-head">
      <button type="button" class="btn back-btn" @click="goBack">&lt; Game Mode</button>
      <h1 class="title">Question Builder</h1>
      <button type="button" class="btn btn-yellow" @click="openEditor('new')">+ New question</button>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="hint-text builder-notice" role="status">{{ notice }}</p>

    <div class="builder-grid" :class="{ 'has-editor': editing }">
      <!-- Playlists -->
      <aside class="builder-col playlists-col" aria-label="Playlists">
        <h2 class="col-title">Playlists</h2>
        <ul class="playlist-list">
          <li>
            <button type="button" class="pl-item" :class="{ active: activeId === ALL }" @click="selectPlaylist(ALL)">
              All questions <span class="pl-count">{{ library.questions.length }}</span>
            </button>
          </li>
          <li v-for="p in library.playlists" :key="p.id">
            <button type="button" class="pl-item" :class="{ active: activeId === p.id }" @click="selectPlaylist(p.id)">
              {{ p.name }}
              <span class="pl-count" :title="p.ordered ? 'Plays in order' : 'Shuffles'">{{ p.ordered ? '↧ ' : '' }}{{ p.questionIds.length }}</span>
            </button>
          </li>
        </ul>

        <form class="pl-new" @submit.prevent="addPlaylist">
          <input v-model="newPlaylist.name" type="text" maxlength="80" placeholder="New playlist name" aria-label="New playlist name" />
          <label class="small-check"><input v-model="newPlaylist.ordered" type="checkbox" /> Play in order</label>
          <button type="submit" class="btn back-btn btn-small" :disabled="!newPlaylist.name.trim()">+ Create</button>
        </form>

        <div class="pl-import">
          <h3 class="col-subtitle">Import a CSV</h3>
          <select v-model="importFile" aria-label="CSV file to import">
            <option value="">— file from /import —</option>
            <option v-for="f in files" :key="f" :value="f">{{ f }}</option>
          </select>
          <button type="button" class="btn back-btn btn-small" :disabled="!importFile" @click="runImport">Import as playlist</button>
          <p class="hint-text small">Adds its rows to the bank (skipping ones already there) and makes a playlist from them.</p>
        </div>
      </aside>

      <!-- Question list -->
      <section class="builder-col list-col" aria-label="Questions">
        <div v-if="activePlaylist" class="pl-settings">
          <input
            class="pl-rename"
            type="text"
            :value="activePlaylist.name"
            maxlength="80"
            aria-label="Playlist name"
            @change="renamePlaylist"
          />
          <div class="mode-picker pl-order">
            <label><input type="radio" :checked="!activePlaylist.ordered" @change="setOrdered(false)" /> Shuffle</label>
            <label><input type="radio" :checked="activePlaylist.ordered" @change="setOrdered(true)" /> Play in order</label>
          </div>
          <div class="pl-actions">
            <a class="btn-link" :href="playlistCsvUrl(activePlaylist.id)" download>Export CSV</a>
            <button type="button" class="btn-link danger-link" @click="removePlaylist">Delete playlist</button>
          </div>
        </div>
        <h2 v-else class="col-title">All questions</h2>

        <div class="list-filters">
          <input v-model="search" type="search" placeholder="Search question or answer" aria-label="Search" />
          <select v-model="catFilter" aria-label="Filter by category">
            <option value="">All categories</option>
            <option v-for="c in library.categories" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="typeFilter" aria-label="Filter by type">
            <option value="">All types</option>
            <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>

        <div class="bulk-bar">
          <label class="small-check">
            <input type="checkbox" :checked="allVisibleSelected" :disabled="!visible.length" @change="toggleAllVisible" />
            {{ selected.length ? `${selected.length} selected` : 'Select all shown' }}
          </label>
          <template v-if="selected.length">
            <select v-model="bulkTarget" aria-label="Playlist to add selected questions to">
              <option value="">Add to playlist…</option>
              <option v-for="p in library.playlists" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <button type="button" class="btn back-btn btn-small" :disabled="!bulkTarget" @click="addSelectedTo">Add</button>
            <button v-if="activePlaylist" type="button" class="btn-link danger-link" @click="removeFromPlaylist(selected)">
              Remove from this playlist
            </button>
          </template>
        </div>

        <p v-if="loading" class="hint-text">Loading…</p>
        <p v-else-if="!library.questions.length" class="hint-text empty-state">
          The bank is empty. Click <strong>+ New question</strong>, or import a CSV on the left.
        </p>
        <p v-else-if="!visible.length" class="hint-text empty-state">
          {{ activePlaylist && !activePlaylist.questionIds.length
            ? 'This playlist is empty. Tick it in a question\'s Playlists, or select questions under All questions and add them here.'
            : 'No questions match these filters.' }}
        </p>
        <p v-if="activePlaylist?.ordered && filtersActive" class="hint-text small">Clear the filters to reorder.</p>

        <ol class="q-list" :class="{ numbered: activePlaylist?.ordered }">
          <li v-for="(q, i) in visible" :key="q.id" class="q-row" :class="{ active: editing === q.id }">
            <input v-model="selected" type="checkbox" :value="q.id" :aria-label="`Select: ${q.question}`" />
            <span v-if="activePlaylist?.ordered" class="q-pos">{{ i + 1 }}</span>
            <button type="button" class="q-main" @click="openEditor(q.id)">
              <span class="q-text">{{ q.question }}</span>
              <span class="q-meta">
                <span class="q-answer">✓ {{ q.currentAnswer }}</span>
                <span class="q-type">{{ q.type }}</span>
                <span v-for="c in q.categories" :key="c" class="cat-tag small">{{ c }}</span>
                <span v-if="q.attachment" title="Has media">🖼</span>
                <span v-if="!activePlaylist" class="q-in">in {{ playlistCount(q) }} playlist(s)</span>
              </span>
            </button>
            <span v-if="canReorder" class="q-move">
              <button type="button" class="tool-btn" :disabled="i === 0" :aria-label="`Move up: ${q.question}`" @click="move(i, -1)">↑</button>
              <button type="button" class="tool-btn" :disabled="i === visible.length - 1" :aria-label="`Move down: ${q.question}`" @click="move(i, 1)">↓</button>
            </span>
            <button
              v-if="activePlaylist"
              type="button"
              class="tool-btn q-remove"
              :aria-label="`Remove from playlist: ${q.question}`"
              title="Remove from this playlist"
              @click="removeFromPlaylist([q.id])"
            >×</button>
          </li>
        </ol>
      </section>

      <!-- Editor -->
      <Transition name="editor">
        <section v-if="editing" class="builder-col editor-col" aria-label="Question editor">
          <QuestionEditor
            ref="editor"
            :question="editingQuestion"
            :playlists="library.playlists"
            :categories="library.categories"
            :default-playlist-ids="activePlaylist ? [activePlaylist.id] : []"
            @saved="onSaved"
            @deleted="onDeleted"
            @cancel="closeEditor"
          />
        </section>
      </Transition>
    </div>
  </div>
</template>
