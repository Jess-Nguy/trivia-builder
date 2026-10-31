<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import EndGameButton from '../components/EndGameButton.vue';
import GameProgress from '../components/GameProgress.vue';

const q = computed(() => store.currentQuestion);
const pointValue = computed(() => q.value?.points ?? 0);
// Points controls show when recording points (or always in showcasing mode, so
// the host can award points for fun), and hide when a gradable question was
// answered wrong.
const showPoints = computed(() => (store.settings.recordPoints || !store.isCompetition) && !store.pointsLocked);
const showHints = computed(() => store.settings.recordHints);

const activeIdx = ref(0);

// Who's ahead right now (by running total), so the room can see it at a glance.
const leaderIds = computed(() => {
  const top = Math.max(...store.totals.map((t) => t.total));
  return top > 0 ? new Set(store.totals.filter((t) => t.total === top).map((t) => t.id)) : new Set();
});

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
    <EndGameButton />
    <div class="top-row">
      <div class="plaque"><span class="plaque-main">Trivia</span> <span class="plaque-script">builder</span></div>
      <GameProgress />
      <button class="btn btn-yellow next-btn" @click="next">NEXT &gt;</button>
    </div>
    <h1 class="title">Manual Scoreboard</h1>

    <p v-if="showPoints" class="award-line">Award points: {{ pointValue }} for the question</p>
    <p v-if="store.pointsLocked && store.settings.recordPoints" class="award-line locked">
      Answer was incorrect — no points to award.
    </p>
    <p v-if="showHints" class="award-line">Hint assignment: {{ store.hintsTakenThisQuestion }} per player who saw it</p>

    <div class="players-grid">
      <div
        v-for="(p, i) in store.players"
        :key="p.id"
        class="player-card podium"
        :class="{ active: activeIdx === i }"
        @click="activeIdx = i"
      >
        <div class="podium-name">{{ p.name }}</div>
        <div class="leader-tag" :class="{ 'is-hidden': !leaderIds.has(p.id) }">👑 Leading</div>
        <div class="podium-screen">
          <span class="led" :key="p.points">{{ p.points }}</span>
        </div>
        <div class="podium-body" :style="{ background: p.color }">
          <span class="podium-num">{{ i + 1 }}</span>
        </div>

        <div v-if="showPoints" class="counter">
          <button @click.stop="addPoints(p, -1)" :disabled="(store.qPoints[p.id] || 0) <= 0">−</button>
          <span class="val" :key="store.qPoints[p.id] || 0">+{{ store.qPoints[p.id] || 0 }} pts</span>
          <button @click.stop="addPoints(p, 1)" :disabled="(store.qPoints[p.id] || 0) >= pointValue">+</button>
        </div>
        <div v-if="showHints" class="counter">
          <button @click.stop="addHints(p, -1)" :disabled="(store.qHints[p.id] || 0) <= 0">−</button>
          <span class="val" :key="p.hints">{{ p.hints }} hint</span>
          <button @click.stop="addHints(p, 1)" :disabled="(store.qHints[p.id] || 0) >= store.hintsTakenThisQuestion">+</button>
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
