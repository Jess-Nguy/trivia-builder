<script>
import { reactive, watch } from 'vue';

// The draft lives at module scope (and in localStorage) rather than in the
// component, so it survives the form unmounting while a question is on and a
// page reload.
const DRAFT_KEY = 'trivia-phone-draft';

const blank = () => ({
  type: 'Single Choice',
  question: '',
  answer: '',
  options: ['', '', '', ''],
  correct: 0,
  truth: 'TRUE',
  category: '',
  hint: '',
  explanation: '',
  attachment: '',
});

function loadDraft() {
  try {
    return { ...blank(), ...JSON.parse(localStorage.getItem(DRAFT_KEY)) };
  } catch {
    return blank();
  }
}

export const draft = reactive(loadDraft());
watch(draft, () => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable — the draft just won't survive a reload */
  }
}, { deep: true });

export const hasDraft = () => !!(draft.question.trim() || draft.answer.trim() || draft.attachment.trim());
</script>

<script setup>
import { ref, computed } from 'vue';
import Media from '../components/Media.vue';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  // The relay's answer to the last submit: { ok, text?, error?, problems? }, or null while sending.
  reply: { type: Object, default: null },
  sending: Boolean,
});
const emit = defineEmits(['submit', 'close']);

const TYPES = ['Single Choice', 'Multiple Choice', 'True or False'];
const PREVIEW_DELAY_MS = 600;

// Attachment preview: `idle` with no link, then `loading` until Media reports
// `ready` or `failed`. Submit needs `ready` plus the player's confirmation.
const previewSrc = ref(draft.attachment.trim());
const previewState = ref(previewSrc.value ? 'loading' : 'idle');
const previewOk = ref(false);
let previewTimer = null;

watch(() => draft.attachment, (url) => {
  clearTimeout(previewTimer);
  previewOk.value = false;
  previewSrc.value = '';
  const link = url.trim();
  previewState.value = link ? 'loading' : 'idle';
  // Wait for typing to pause so half a URL isn't loaded on every keystroke.
  if (link) previewTimer = setTimeout(() => (previewSrc.value = link), PREVIEW_DELAY_MS);
});

const isHttp = computed(() => /^https?:\/\/\S+$/i.test(draft.attachment.trim()));
const filledOptions = computed(() => draft.options.map((o) => o.trim()));

const answer = computed(() => {
  if (draft.type === 'True or False') return draft.truth;
  if (draft.type === 'Multiple Choice') return filledOptions.value[draft.correct] || '';
  return draft.answer.trim();
});

const problems = computed(() => {
  const list = [];
  if (!draft.question.trim()) list.push('Write the question.');
  if (draft.type === 'Multiple Choice') {
    if (filledOptions.value.filter(Boolean).length < 2) list.push('Add at least 2 options.');
    if (!answer.value) list.push('Tick the option that is right.');
  } else if (!answer.value) {
    list.push('Add the answer.');
  }
  if (draft.attachment.trim()) {
    if (!isHttp.value) list.push('The picture or video link must start with http:// or https://.');
    else if (previewState.value === 'failed') list.push('That link didn\'t load. Check it or clear it.');
    else if (previewState.value !== 'ready') list.push('Wait for the preview to load.');
    else if (!previewOk.value) list.push('Check the preview and tick "Preview looks right".');
  }
  return list;
});

function addOption() {
  if (draft.options.length < 5) draft.options.push('');
}
function removeOption(i) {
  if (draft.options.length <= 2) return;
  draft.options.splice(i, 1);
  if (draft.correct >= draft.options.length) draft.correct = 0;
}

function submit() {
  if (problems.value.length || props.sending) return;
  const options =
    draft.type === 'Multiple Choice' ? filledOptions.value.filter(Boolean).map((text) => ({ text })) : [];
  emit('submit', {
    type: draft.type,
    question: draft.question.trim(),
    currentAnswer: answer.value,
    options,
    categories: draft.category.trim() ? [draft.category.trim()] : [],
    hint: draft.hint.trim(),
    explanation: draft.explanation.trim(),
    attachment: draft.attachment.trim(),
  });
}

function startAnother() {
  Object.assign(draft, blank(), { type: draft.type, category: draft.category });
  emit('close', false);
}
</script>

<template>
  <section class="phone-card">
    <h1 class="phone-title">Write a question</h1>

    <template v-if="reply?.ok">
      <p class="phone-locked" role="status">✓ Added to the bank!</p>
      <p class="hint-text">"{{ reply.text }}" might come up in a game. Keep a straight face.</p>
      <button type="button" class="btn btn-green phone-wide" @click="startAnother">Write another</button>
      <button type="button" class="btn-link" @click="emit('close', true)">Done</button>
    </template>

    <form v-else class="write-form" @submit.prevent="submit">
      <p class="hint-text">Stump the room with something you know best. Your name shows when it's played.</p>

      <div class="write-types" role="radiogroup" aria-label="Question type">
        <label v-for="t in TYPES" :key="t" class="write-type" :class="{ active: draft.type === t }">
          <input v-model="draft.type" type="radio" :value="t" /> {{ t }}
        </label>
      </div>

      <label class="phone-label" for="wq-question">Question</label>
      <textarea id="wq-question" v-model="draft.question" rows="3" maxlength="300" />

      <template v-if="draft.type === 'Single Choice'">
        <label class="phone-label" for="wq-answer">Answer</label>
        <input id="wq-answer" v-model="draft.answer" maxlength="120" autocomplete="off" />
      </template>

      <fieldset v-else-if="draft.type === 'Multiple Choice'" class="write-options">
        <legend class="phone-label">Options (tick the right one)</legend>
        <div v-for="(o, i) in draft.options" :key="i" class="write-option">
          <input v-model="draft.correct" type="radio" :value="i" :aria-label="`Option ${i + 1} is right`" />
          <input v-model="draft.options[i]" maxlength="120" :aria-label="`Option ${i + 1}`" autocomplete="off" />
          <button
            v-if="draft.options.length > 2"
            type="button"
            class="tool-btn"
            :aria-label="`Remove option ${i + 1}`"
            @click="removeOption(i)"
          >×</button>
        </div>
        <button v-if="draft.options.length < 5" type="button" class="btn-link" @click="addOption">+ Add option</button>
      </fieldset>

      <fieldset v-else class="write-options">
        <legend class="phone-label">The statement is…</legend>
        <label><input v-model="draft.truth" type="radio" value="TRUE" /> True</label>
        <label><input v-model="draft.truth" type="radio" value="FALSE" /> False</label>
      </fieldset>

      <label class="phone-label" for="wq-category">Category</label>
      <input id="wq-category" v-model="draft.category" list="wq-categories" maxlength="40" autocomplete="off" />
      <datalist id="wq-categories">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>

      <label class="phone-label" for="wq-hint">Hint (optional)</label>
      <input id="wq-hint" v-model="draft.hint" maxlength="200" autocomplete="off" />

      <label class="phone-label" for="wq-explanation">Fun fact for the reveal (optional)</label>
      <input id="wq-explanation" v-model="draft.explanation" maxlength="300" autocomplete="off" />

      <label class="phone-label" for="wq-attachment">Picture, video or YouTube link (optional)</label>
      <input
        id="wq-attachment"
        v-model="draft.attachment"
        type="url"
        inputmode="url"
        maxlength="500"
        autocomplete="off"
        placeholder="https://"
      />
      <div v-if="previewSrc && isHttp" class="write-preview">
        <Media
          :key="previewSrc"
          :src="previewSrc"
          @ready="previewState = 'ready'"
          @failed="previewState = 'failed'"
        />
        <p v-if="previewState === 'loading'" class="hint-text">Loading preview…</p>
        <label v-else-if="previewState === 'ready'" class="small-check">
          <input v-model="previewOk" type="checkbox" /> Preview looks right
        </label>
      </div>

      <ul v-if="reply?.problems?.length" class="error">
        <li v-for="p in reply.problems" :key="p.field + p.message">{{ p.message }}</li>
      </ul>
      <p v-else-if="reply?.error" class="error" role="alert">{{ reply.error }}</p>
      <p v-if="problems.length" class="hint-text">{{ problems[0] }}</p>

      <button class="btn btn-green btn-big phone-wide" :disabled="!!problems.length || sending">
        {{ sending ? 'Sending…' : 'ADD TO THE BANK' }}
      </button>
      <button type="button" class="btn-link" @click="emit('close', true)">Back</button>
    </form>
  </section>
</template>

<style scoped>
/* Motion: none beyond the global button press feedback. */
.write-form { display: flex; flex-direction: column; gap: 8px; }
.write-form :is(input:not([type='radio']):not([type='checkbox']), textarea) {
  font: inherit;
  font-size: 18px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
}
.write-types { display: flex; flex-wrap: wrap; gap: 6px; }
.write-type {
  padding: 6px 12px;
  border: 2px solid var(--ink);
  border-radius: 999px;
  background: var(--panel);
  font-size: 15px;
  cursor: pointer;
}
.write-type input { position: absolute; opacity: 0; pointer-events: none; }
.write-type.active { background: var(--accent); color: var(--on-accent); font-weight: 700; }
.write-type:focus-within { outline: 3px solid var(--accent); outline-offset: 2px; }
.write-options { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.write-option { display: flex; align-items: center; gap: 6px; }
.write-preview { display: flex; flex-direction: column; gap: 6px; }
.write-preview :deep(img), .write-preview :deep(video) { max-width: 100%; max-height: 240px; }
</style>
