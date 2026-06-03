<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';

const q = computed(() => store.currentQuestion);
const pointValue = computed(() => q.value?.points ?? 0);
const showPoints = computed(() => store.settings.recordPoints);
const showHints = computed(() => store.settings.recordHints);

const activeIdx = ref(0);

function addPoints(player, dir) {
  store.awardPoints(player.id, dir * pointValue.value);
}
function addHints(player, dir) {
  store.awardHints(player.id, dir);
}
function next() {
  store.nextQuestion();
}

function onKey(e) {
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= store.players.length) {
    activeIdx.value = n - 1;
    return;
  }
  const p = store.players[activeIdx.value];
  if (!p) return;
  switch (e.key) {
    case 'Enter': return next();
    case '+': case '=': case 'ArrowUp': if (showPoints.value) addPoints(p, 1); break;
    case '-': case 'ArrowDown': if (showPoints.value) addPoints(p, -1); break;
    case ']': if (showHints.value) addHints(p, 1); break;
    case '[': if (showHints.value) addHints(p, -1); break;
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="panel">
    <div class="brand">Trivia Builder</div>
    <button class="btn btn-yellow next-btn" @click="next">NEXT &gt;</button>
    <h1 class="title">Manual Scoreboard</h1>

    <p v-if="showPoints" class="award-line">Award points: {{ pointValue }} for the question</p>
    <p v-if="showHints" class="award-line">Hint assignment: {{ store.hintsTakenThisQuestion }} to distribute</p>

    <div class="players-grid">
      <div
        v-for="(p, i) in store.players"
        :key="p.id"
        class="player-card"
        :class="{ active: activeIdx === i }"
        @click="activeIdx = i"
      >
        <div class="avatar" :style="{ background: p.color }">👤</div>
        <div class="player-name">{{ p.name }}</div>

        <div v-if="showPoints" class="counter">
          <button @click.stop="addPoints(p, -1)" :disabled="(store.qPoints[p.id] || 0) <= 0">−</button>
          <span class="val">{{ p.points }} pts</span>
          <button @click.stop="addPoints(p, 1)" :disabled="(store.qPoints[p.id] || 0) >= pointValue">+</button>
        </div>
        <div v-if="showHints" class="counter">
          <button @click.stop="addHints(p, -1)" :disabled="(store.qHints[p.id] || 0) <= 0">−</button>
          <span class="val">{{ p.hints }} hint</span>
          <button @click.stop="addHints(p, 1)" :disabled="store.hintsRemaining <= 0">+</button>
        </div>
      </div>
    </div>

    <p class="kbd-help">
      <kbd>1</kbd>–<kbd>8</kbd> select player ·
      <span v-if="showPoints"><kbd>+</kbd>/<kbd>−</kbd> points ({{ pointValue }}) · </span>
      <span v-if="showHints"><kbd>]</kbd>/<kbd>[</kbd> hint · </span>
      <kbd>Enter</kbd> next
    </p>
  </div>
</template>
