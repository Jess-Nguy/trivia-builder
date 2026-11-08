<script setup>
import { store } from '../store.js';

function end() {
  if (window.confirm('End the game now and go to Final Scores?')) {
    store.endGame();
  }
}
</script>

<template>
  <button class="end-game-btn" @click="end">⏹ End Game</button>
</template>
