<script setup>
import { ref, onMounted } from 'vue';

// One burst of falling paper for the Final Scores winner. Removed after 5s;
// skipped entirely when the OS asks for reduced motion.
const COLOURS = ['var(--accent)', 'var(--success)', 'var(--sign-script)', 'var(--warning)', '#ffffff'];
const pieces = ref([]);

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  pieces.value = Array.from({ length: 60 }, (_, n) => ({
    id: n,
    left: Math.random() * 100,
    colour: COLOURS[n % COLOURS.length],
    duration: 2 + Math.random() * 2.5,
    delay: Math.random() * 0.8,
  }));
  setTimeout(() => (pieces.value = []), 5000);
});
</script>

<template>
  <div v-if="pieces.length" class="confetti" aria-hidden="true">
    <i
      v-for="p in pieces"
      :key="p.id"
      :style="{ left: `${p.left}%`, background: p.colour, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }"
    ></i>
  </div>
</template>
