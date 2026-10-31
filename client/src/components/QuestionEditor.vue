<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { createQuestion, updateQuestion, deleteQuestion } from '../api.js';
import CategoryPicker from './CategoryPicker.vue';
import Media from './Media.vue';

const props = defineProps({
  question: { type: Object, default: null }, // null = new question
  playlists: { type: Array, required: true },
  categories: { type: Array, required: true },
  defaultPlaylistIds: { type: Array, default: () => [] }, // pre-ticked for a new question
});
const emit = defineEmits(['saved', 'deleted', 'cancel']);

const TYPES = ['Single Choice', 'Multiple Choice', 'True or False'];
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const norm = (s) => String(s ?? '').trim().toLowerCase();

function blankForm(carry = {}) {
  return {
    type: carry.type || 'Single Choice',
    question: '',
    currentAnswer: '',
    options: Array.from({ length: 5 }, () => ({ text: '', attachment: '' })),
    categories: carry.categories ? [...carry.categories] : [],
    attachment: '',
    points: '',
    hint: '',
    explanation: '',
    delaySecs: '',
    playlistIds: carry.playlistIds ? [...carry.playlistIds] : [...props.defaultPlaylistIds],
  };
}

function formFrom(q) {
  const f = blankForm();
  Object.assign(f, {
    type: q.type,
    question: q.question,
    currentAnswer: q.currentAnswer,
    categories: [...q.categories],
    attachment: q.attachment,
    points: String(q.points),
    hint: q.hint,
    explanation: q.explanation,
    delaySecs: q.delaySecs ? String(q.delaySecs) : '',
    playlistIds: props.playlists.filter((p) => p.questionIds.includes(q.id)).map((p) => p.id),
  });
  q.options.forEach((o, i) => (f.options[i] = { text: q.type === 'True or False' ? '' : o.text, attachment: o.attachment }));
  return f;
}

const form = reactive(blankForm());
const snapshot = ref('');
const problems = ref([]);
const error = ref('');
const saving = ref(false);
const showMore = ref(false);
const preview = ref(''); // URL being previewed; media only loads on request

function reset(f) {
  Object.assign(form, f);
  snapshot.value = JSON.stringify(form);
  problems.value = [];
  error.value = '';
  preview.value = '';
  showMore.value = !!(f.hint || f.explanation || f.delaySecs || f.options.some((o) => o.attachment));
}
// Fields kept by "Save & add another" until the parent swaps in a blank question.
let carry = null;
watch(
  () => props.question,
  (q) => {
    reset(q ? formFrom(q) : blankForm(carry || {}));
    carry = null;
  },
  { immediate: true },
);

const isDirty = computed(() => JSON.stringify(form) !== snapshot.value);
defineExpose({ isDirty });

const isMC = computed(() => form.type === 'Multiple Choice');
const isTF = computed(() => form.type === 'True or False');
const filledOptions = computed(() => form.options.filter((o) => o.text.trim() || o.attachment.trim()));
const answerMatchesOption = computed(() => form.options.some((o) => o.text.trim() && norm(o.text) === norm(form.currentAnswer)));

const fieldError = (field) => problems.value.filter((p) => p.field === field).map((p) => p.message).join(' ');

watch(() => form.type, (t) => {
  if (t === 'True or False' && !['TRUE', 'FALSE'].includes(form.currentAnswer.toUpperCase())) form.currentAnswer = '';
});

function payload() {
  const options = isTF.value
    ? form.options.slice(0, 2).map((o) => ({ attachment: o.attachment }))
    : isMC.value
      ? form.options
      : [];
  return { ...form, options };
}

async function save(addAnother = false) {
  saving.value = true;
  problems.value = [];
  error.value = '';
  try {
    const saved = props.question
      ? await updateQuestion(props.question.id, payload())
      : await createQuestion(payload());
    // Keep type, categories and playlists so a run of similar questions is quick to enter.
    if (addAnother) {
      carry = { type: form.type, categories: form.categories, playlistIds: form.playlistIds };
      if (!props.question) {
        reset(blankForm(carry));
        carry = null;
      }
    } else {
      snapshot.value = JSON.stringify(form);
    }
    emit('saved', saved, form.playlistIds, addAnother);
  } catch (e) {
    error.value = e.message;
    problems.value = e.problems || [];
  } finally {
    saving.value = false;
  }
}

async function remove() {
  const inCount = props.playlists.filter((p) => p.questionIds.includes(props.question.id)).length;
  const where = inCount ? ` It will also be removed from ${inCount} playlist(s).` : '';
  if (!confirm(`Delete this question from the bank?${where}`)) return;
  try {
    await deleteQuestion(props.question.id);
    emit('deleted', props.question.id);
  } catch (e) {
    error.value = e.message;
  }
}

function togglePreview(url) {
  preview.value = preview.value === url ? '' : url;
}
</script>

<template>
  <form class="q-editor" @submit.prevent="save(false)">
    <h2 class="editor-title">{{ question ? 'Edit question' : 'New question' }}</h2>

    <fieldset class="field">
      <legend>Type</legend>
      <div class="mode-picker">
        <label v-for="t in TYPES" :key="t"><input type="radio" :value="t" v-model="form.type" /> {{ t }}</label>
      </div>
    </fieldset>

    <label class="field">
      <span>Question</span>
      <textarea v-model="form.question" rows="3" :class="{ invalid: fieldError('question') }" />
      <span v-if="fieldError('question')" class="field-error">{{ fieldError('question') }}</span>
    </label>

    <div class="field">
      <span>Question media <span class="hint-text">(image, video, audio or YouTube URL; add #audio for sound only)</span></span>
      <div class="url-row">
        <input v-model="form.attachment" type="url" placeholder="https://…" />
        <button v-if="form.attachment" type="button" class="btn-link" @click="togglePreview(form.attachment)">
          {{ preview === form.attachment ? 'Hide' : 'Preview' }}
        </button>
      </div>
      <Media v-if="preview && preview === form.attachment" :src="preview" class="editor-preview" />
    </div>

    <fieldset v-if="isMC" class="field">
      <legend>Options <span class="hint-text">(2 to 5; tick ✓ on the correct one)</span></legend>
      <div v-for="(o, i) in form.options" :key="i" class="option-row">
        <span class="badge">{{ LETTERS[i] }}</span>
        <input v-model="o.text" type="text" :aria-label="`Option ${LETTERS[i]}`" />
        <label class="correct-pick" :title="`Mark ${LETTERS[i]} correct`">
          <input
            type="radio"
            name="correct"
            :checked="!!o.text.trim() && norm(o.text) === norm(form.currentAnswer)"
            :disabled="!o.text.trim()"
            @change="form.currentAnswer = o.text.trim()"
          />
          ✓
        </label>
      </div>
      <span v-if="fieldError('options')" class="field-error">{{ fieldError('options') }}</span>
    </fieldset>

    <fieldset v-if="isTF" class="field">
      <legend>Answer</legend>
      <div class="mode-picker">
        <label><input type="radio" value="TRUE" v-model="form.currentAnswer" /> TRUE</label>
        <label><input type="radio" value="FALSE" v-model="form.currentAnswer" /> FALSE</label>
      </div>
      <span v-if="fieldError('currentAnswer')" class="field-error">{{ fieldError('currentAnswer') }}</span>
    </fieldset>
    <label v-else class="field">
      <span>Answer</span>
      <input v-model="form.currentAnswer" type="text" :class="{ invalid: fieldError('currentAnswer') }" />
      <span v-if="fieldError('currentAnswer')" class="field-error">{{ fieldError('currentAnswer') }}</span>
      <span v-else-if="isMC && form.currentAnswer && !answerMatchesOption" class="hint-text">
        ⚠ Doesn't match an option exactly, so this question won't auto-grade.
      </span>
    </label>

    <div class="field">
      <span>Categories</span>
      <CategoryPicker v-model="form.categories" :suggestions="categories" />
    </div>

    <fieldset class="field">
      <legend>Playlists</legend>
      <p v-if="!playlists.length" class="hint-text">No playlists yet. Create one in the left column.</p>
      <div class="checks playlist-checks">
        <label v-for="p in playlists" :key="p.id"><input type="checkbox" :value="p.id" v-model="form.playlistIds" /> {{ p.name }}</label>
      </div>
    </fieldset>

    <div class="field points-row">
      <label>
        <span>Points <span class="hint-text">(blank = 2 with a hint, 1 without)</span></span>
        <input v-model="form.points" type="number" min="0" step="1" :class="{ invalid: fieldError('points') }" />
      </label>
      <span v-if="fieldError('points')" class="field-error">{{ fieldError('points') }}</span>
    </div>

    <button type="button" class="btn-link more-toggle" :aria-expanded="showMore" @click="showMore = !showMore">
      {{ showMore ? '▾' : '▸' }} Hint, explanation, reading delay{{ isMC || isTF ? ', option media' : '' }}
    </button>
    <div v-if="showMore" class="more">
      <label class="field">
        <span>Hint</span>
        <input v-model="form.hint" type="text" />
      </label>
      <label class="field">
        <span>Explanation <span class="hint-text">(shown on the Answer Reveal)</span></span>
        <textarea v-model="form.explanation" rows="2" />
      </label>
      <label class="field">
        <span>Reading delay, seconds <span class="hint-text">(options stay hidden while the host reads)</span></span>
        <input v-model="form.delaySecs" type="number" min="0" step="1" :class="{ invalid: fieldError('delaySecs') }" />
        <span v-if="fieldError('delaySecs')" class="field-error">{{ fieldError('delaySecs') }}</span>
      </label>
      <template v-if="isMC || isTF">
        <div v-for="(o, i) in form.options.slice(0, isTF ? 2 : 5)" :key="i" class="field">
          <span>{{ isTF ? ['TRUE', 'FALSE'][i] : `Option ${LETTERS[i]}` }} media</span>
          <div class="url-row">
            <input v-model="o.attachment" type="url" placeholder="https://…" />
            <button v-if="o.attachment" type="button" class="btn-link" @click="togglePreview(o.attachment)">
              {{ preview === o.attachment ? 'Hide' : 'Preview' }}
            </button>
          </div>
          <Media v-if="preview && preview === o.attachment" :src="preview" class="editor-preview" />
        </div>
      </template>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="isMC && filledOptions.length < 2" class="hint-text">Fill at least 2 options.</p>

    <div class="editor-actions">
      <button type="submit" class="btn btn-yellow" :disabled="saving">Save</button>
      <button type="button" class="btn back-btn" :disabled="saving" @click="save(true)">Save &amp; add another</button>
      <button type="button" class="btn back-btn" @click="emit('cancel')">Close</button>
      <button v-if="question" type="button" class="btn-link danger-link" @click="remove">Delete question</button>
    </div>
  </form>
</template>
