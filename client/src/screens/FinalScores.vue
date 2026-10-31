<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import Confetti from '../components/Confetti.vue';

const rows = computed(() => [...store.totals].sort((a, b) => b.total - a.total));
const top = computed(() => (rows.value.length ? rows.value[0].total : 0));
const bottom = computed(() => (rows.value.length ? rows.value.at(-1).total : 0));

// Dead last goes to the graveyard instead of a podium: everyone tied on the
// lowest total, as long as that total trails the top (an all-way tie has no
// losers).
const isBuried = (r) => rows.value.length > 1 && bottom.value < top.value && r.total === bottom.value;
const graveyard = computed(() => rows.value.filter(isBuried));
const living = computed(() => rows.value.filter((r) => !isBuried(r)));

// Places by distinct total among the living, so ties share a step (1, 2, 2, 3).
const placeOf = (r) => [...new Set(living.value.map((x) => x.total))].indexOf(r.total) + 1;
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Podium in stage order: 2nd place on the left, 1st in the middle, 3rd on the
// right. --i staggers the rise so 3rd lands first and 1st last.
const PODIUM_CAP = 6;
const podium = computed(() => {
  const byPlace = (n) => living.value.filter((r) => placeOf(r) === n);
  const stage = [...byPlace(2), ...byPlace(1), ...byPlace(3)].slice(0, PODIUM_CAP);
  return stage.map((r) => ({ ...r, place: placeOf(r), order: 3 - placeOf(r) }));
});
const crowned = (r) => top.value > 0 && r.total === top.value;

// Graves: crooked tombstones with a joke epitaph picked from the name, so the
// same team always gets the same one.
const GRAVE_CAP = 6;
const EPITAPHS = [
  'Answered with confidence. Was wrong.',
  'Died as they lived: guessing C.',
  "Should've taken the hint.",
  'Gone but not forgotten. Mostly forgotten.',
  'Their points are with the angels now.',
  'Was "pretty sure" about that one.',
  'Rest in pieces.',
];
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const graves = computed(() =>
  graveyard.value.slice(0, GRAVE_CAP).map((r, i) => ({
    ...r,
    epitaph: EPITAPHS[hash(r.name) % EPITAPHS.length],
    tilt: `${[-4, 3, -2, 5, -5, 2][i]}deg`,
    order: i,
  })),
);

// Silly superlatives, shown as chips in the results table.
const maxHints = computed(() => Math.max(0, ...rows.value.map((r) => r.hints)));
function titlesFor(r) {
  const t = [];
  if (crowned(r)) t.push('👑 Champion');
  if (crowned(r) && store.settings.recordHints && r.hints === 0) t.push('🧠 No Hints Needed');
  if (!isBuried(r) && placeOf(r) === 2) t.push('🥈 So Close');
  if (isBuried(r)) t.push('🪦 Six Feet Under');
  if (maxHints.value > 0 && r.hints === maxHints.value) t.push('💡 Hint Goblin');
  if (r.points === 0) t.push('🥚 Goose Egg Club');
  return t;
}
const rankLabel = (r) => (isBuried(r) ? '🪦 Last' : `${MEDALS[placeOf(r)] || ''} ${placeOf(r)}`);

const winners = computed(() => store.winners);
const winnerText = computed(() => {
  const w = winners.value;
  if (w.length === 0) return '';
  if (top.value === 0) return 'Nobody scored. Everyone loses together!';
  if (w.length === 1) return `Winner is ${w[0].name}!`;
  return `It's a tie! Winners: ${w.map((x) => x.name).join(', ')}!`;
});

// Room-wide title from the share of auto-graded questions answered right.
const TITLES = [[1, 'Trivia Royalty'], [0.85, 'Quiz Wizards'], [0.7, 'Certified Brainiacs'], [0.5, 'Solid Contenders'], [0.3, 'Lucky Guessers'], [0, 'Better Luck Next Round']];
const rec = computed(() => store.record);
const accuracy = computed(() => (rec.value.graded ? rec.value.correct / rec.value.graded : null));
const roomTitle = computed(() => (accuracy.value == null ? '' : TITLES.find(([min]) => accuracy.value >= min)[1]));
const celebrate = computed(() => rows.value.length > 0 && rows.value[0].total > 0);

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
    <div class="plaque"><span class="plaque-main">Trivia</span> <span class="plaque-script">builder</span></div>
    <button class="btn btn-yellow next-btn" @click="next">NEW GAME &gt;</button>
    <h1 class="title">Final Scores</h1>

    <div class="podium-stage">
      <div
        v-for="r in podium"
        :key="r.id"
        class="podium final-podium reveal-hero"
        :class="[`place-${r.place}`, { 'is-crowned': crowned(r) }]"
        :style="{ '--i': r.order }"
      >
        <div v-if="crowned(r)" class="crown" aria-hidden="true">👑</div>
        <div v-else class="podium-medal" aria-hidden="true">{{ MEDALS[r.place] }}</div>
        <div class="podium-name">{{ r.name }}</div>
        <div class="podium-screen"><span class="led">{{ r.total }}</span></div>
        <div class="podium-body" :style="{ background: r.color }">
          <span class="podium-num">{{ r.place }}</span>
        </div>
      </div>
    </div>

    <section v-if="graves.length" class="graveyard" aria-label="Last place">
      <h2 class="graveyard-title">🪦 The Graveyard</h2>
      <p class="hint-text center">Dead last. Gone, but not forgotten.</p>
      <div class="graves">
        <div
          v-for="g in graves"
          :key="g.id"
          class="grave-slot"
          :style="{ '--i': g.order }"
        >
          <div class="ghost" aria-hidden="true">👻</div>
          <div class="grave" :style="{ '--tilt': g.tilt }">
            <span class="grave-rip">R.I.P.</span>
            <span class="grave-name">{{ g.name }}</span>
            <span class="grave-score">{{ g.total }} pts</span>
            <span class="grave-epitaph">{{ g.epitaph }}</span>
          </div>
          <div class="grave-mound" aria-hidden="true"></div>
        </div>
      </div>
      <p v-if="graveyard.length > graves.length" class="hint-text center">
        …and {{ graveyard.length - graves.length }} more in unmarked graves.
      </p>
    </section>

    <table class="scores-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team/User</th>
          <th>Points</th>
          <th># of Hints</th>
          <th>Total Score</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" :class="{ 'is-winner': crowned(r), 'is-buried': isBuried(r) }">
          <td class="rank">{{ rankLabel(r) }}</td>
          <td>
            {{ r.name }}
            <span class="title-chips">
              <span v-for="t in titlesFor(r)" :key="t" class="title-chip">{{ t }}</span>
            </span>
          </td>
          <td>{{ r.points }}</td>
          <td>{{ r.hints }}</td>
          <td>{{ r.total }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="store.settings.hintsSubtract" class="hint-text center">
      Total = points − hints (hints subtract points is on).
    </p>

    <div class="winner reveal-hero" style="--i: 5">🏆 {{ winnerText }}</div>

    <div v-if="roomTitle" class="room-record">
      <span class="room-title">{{ roomTitle }}</span>
      <span class="hint-text">
        The room got {{ rec.correct }} of {{ rec.graded }} graded questions right · best streak 🔥 {{ rec.bestStreak }}
      </span>
    </div>

    <details v-if="rec.missed.length" class="missed">
      <summary>Questions to revisit ({{ rec.missed.length }})</summary>
      <ul>
        <li v-for="(m, i) in rec.missed" :key="i">
          {{ m.question }}
          <em v-if="m.said">Picked: {{ m.said }}</em>
          <b>✓ {{ m.answer }}</b>
        </li>
      </ul>
    </details>

    <Confetti v-if="celebrate" />
  </div>
</template>
