<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import Media from '../components/Media.vue';
import EndGameButton from '../components/EndGameButton.vue';

const q = computed(() => store.currentQuestion);
const isChoice = computed(() => q.value && (q.value.type === 'Multiple Choice' || q.value.type === 'True or False'));
const choiceOptions = computed(() => (q.value?.type === 'True or False' ? ['TRUE', 'FALSE'] : q.value?.options || []));

// Correct/wrong banner only shows for auto-gradable questions.
const graded = computed(() => store.isGradable);
const correct = computed(() => store.isCorrect);

const norm = (s) => String(s ?? '').trim().toLowerCase();
function optionState(opt) {
  if (!graded.value) return '';
  if (norm(opt) === norm(q.value.currentAnswer)) return 'correct';
  if (store.selectedAnswer && norm(opt) === norm(store.selectedAnswer)) return 'chosen-wrong';
  return '';
}

function next() {
  store.afterAnswer();
}
function onKey(e) {
  if (e.key === 'Enter') next();
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="panel answer" v-if="q">
    <EndGameButton />
    <div class="brand">Trivia Builder</div>
    <button class="btn btn-yellow next-btn" @click="next">NEXT &gt;</button>

    <div class="category">Category: {{ q.categories.join(', ') || '—' }}</div>
    <div class="qnum">Question #{{ store.index + 1 }}:</div>
    <div class="qtext">{{ q.question }}</div>

    <Media v-if="q.type === 'Single Choice w/ Media'" :src="q.attachment" />

    <div v-if="graded" class="verdict" :class="correct ? 'verdict-correct' : 'verdict-wrong'">
      {{ correct ? '✓ Correct!' : (store.selectedAnswer ? '✗ Incorrect' : '✗ No answer selected') }}
    </div>

    <div class="answer-body">Answer was: {{ q.currentAnswer }}</div>

    <div class="answer-body explanation" v-if="q.explanation">{{ q.explanation }}</div>

    <div class="answer-options" v-if="isChoice">
      Options:
      <span v-for="(opt, i) in choiceOptions" :key="i" :class="optionState(opt)">{{ i + 1 }}) {{ opt }}</span>
    </div>
  </div>
</template>
