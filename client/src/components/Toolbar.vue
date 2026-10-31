<script setup>
import { computed } from 'vue';
import { display, SCALES } from '../display.js';
import { store } from '../store.js';
import FullscreenButton from './FullscreenButton.vue';

const themeLabel = computed(() => ({ auto: '🌓 Auto', light: '☀️ Light', dark: '🌙 Dark' })[display.theme]);
const pct = computed(() => `${Math.round(display.scale * 100)}%`);
</script>

<template>
  <!-- Bigger on Game Mode, where the host sets up the TV; compact during play. -->
  <div class="toolbar" :class="{ 'toolbar-large': store.screen === 'gameMode' }">
    <div class="tool-group" role="group" aria-label="Text size">
      <button class="tool-btn" title="Smaller text" :disabled="display.scale === SCALES[0]" @click="display.smaller()">A−</button>
      <span class="tool-val">{{ pct }}</span>
      <button class="tool-btn" title="Bigger text" :disabled="display.scale === SCALES.at(-1)" @click="display.bigger()">A+</button>
    </div>
    <button class="tool-btn" title="Switch colour theme" @click="display.cycleTheme()">{{ themeLabel }}</button>
    <button class="tool-btn" title="Keyboard shortcuts (?)" @click="display.helpOpen = true">⌨ Keys</button>
    <FullscreenButton />
  </div>
</template>
