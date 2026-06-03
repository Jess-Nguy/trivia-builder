<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';

const rows = computed(() => [...store.totals].sort((a, b) => b.total - a.total));
const winners = computed(() => store.winners);
const winnerText = computed(() => {
  const w = winners.value;
  if (w.length === 0) return '';
  if (w.length === 1) return `Winner is ${w[0].name}!`;
  return `It's a tie! Winners: ${w.map((x) => x.name).join(', ')}!`;
});

function next() {
  store.reset();
}
function onKey(e) {
  if (e.key === 'Enter') next();
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="panel">
    <div class="brand">Trivia Builder</div>
    <button class="btn btn-yellow next-btn" @click="next">NEXT &gt;</button>
    <h1 class="title">Final Scores</h1>

    <table class="scores-table">
      <thead>
        <tr>
          <th>Team/User</th>
          <th>Points</th>
          <th># of Hints</th>
          <th>Total Score</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.name }}</td>
          <td>{{ r.points }}</td>
          <td>{{ r.hints }}</td>
          <td>{{ r.total }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="store.settings.hintsSubtract" class="hint-text center">
      Total = points − hints (hints subtract points is on).
    </p>

    <div class="winner">{{ winnerText }}</div>
  </div>
</template>
