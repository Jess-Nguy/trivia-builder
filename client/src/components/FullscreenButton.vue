<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const isFullscreen = ref(false);

function sync() {
  isFullscreen.value = !!document.fullscreenElement;
}

function toggle() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

onMounted(() => document.addEventListener('fullscreenchange', sync));
onUnmounted(() => document.removeEventListener('fullscreenchange', sync));
</script>

<template>
  <button
    class="fullscreen-btn"
    :title="isFullscreen ? 'Exit fullscreen' : 'Go fullscreen'"
    @click="toggle"
  >
    {{ isFullscreen ? '✕ Exit Fullscreen' : '⛶ Fullscreen' }}
  </button>
</template>
