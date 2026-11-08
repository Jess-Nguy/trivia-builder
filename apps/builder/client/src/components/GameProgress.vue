<script setup>
import { computed } from 'vue';
import { store } from '../store.js';

const total = computed(() => store.questions.length);
const done = computed(() => (total.value ? (store.index + 1) / total.value : 0));
</script>

<template>
  <div class="progress" v-if="total">
    <span class="progress-label">
      Question {{ store.index + 1 }} of {{ total }}
      <span v-if="store.record.streak > 1" class="streak">🔥 {{ store.record.streak }} in a row</span>
    </span>
    <div class="progress-track" aria-hidden="true">
      <div class="progress-fill" :style="{ transform: `scaleX(${done})` }"></div>
    </div>
  </div>
</template>
