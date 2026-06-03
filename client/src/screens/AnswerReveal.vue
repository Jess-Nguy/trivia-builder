<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import Media from '../components/Media.vue';

const q = computed(() => store.currentQuestion);
const isChoice = computed(() => q.value && (q.value.type === 'Multiple Choice' || q.value.type === 'True or False'));
const choiceOptions = computed(() => (q.value?.type === 'True or False' ? ['TRUE', 'FALSE'] : q.value?.options || []));

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
    <div class="brand">Trivia Builder</div>
    <button class="btn btn-yellow next-btn" @click="next">NEXT &gt;</button>

    <div class="category">Category: {{ q.categories.join(', ') || '—' }}</div>
    <div class="qnum">Question #{{ store.index + 1 }}:</div>
    <div class="qtext">{{ q.question }}</div>

    <Media v-if="q.type === 'Single Choice w/ Media'" :src="q.attachment" />

    <div class="answer-body">Answer was: {{ q.currentAnswer }}</div>

    <div class="answer-options" v-if="isChoice">
      Options:
      <span v-for="(opt, i) in choiceOptions" :key="i">{{ i + 1 }}) {{ opt }}<span v-if="i < choiceOptions.length - 1">, </span></span>
    </div>
  </div>
</template>
