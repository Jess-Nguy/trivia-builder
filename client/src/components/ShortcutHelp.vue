<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import { display } from '../display.js';

const SHORTCUTS = {
  gameMode: [['?', 'Show this list']],
  builder: [['Enter', 'Add a typed category (in the category box)']],
  question: [
    ['A–E or 1–5', 'Pick an option'],
    ['H', 'Show the hint'],
    ['P', 'Pause or resume the timer'],
    ['Enter', 'Submit / reveal the answer'],
    ['Space', 'Skip the reading countdown'],
  ],
  answer: [
    ['Enter', 'Next'],
    ['← or Backspace', 'Back to the question'],
  ],
  scoreboard: [
    ['1–8', 'Select a team'],
    ['+ / −  or ↑ / ↓', 'Add or remove points'],
    ['] / [', 'Add or remove a hint'],
    ['Enter', 'Next question'],
  ],
  final: [['Enter', 'Start a new game']],
};
const rows = computed(() => [...(SHORTCUTS[store.screen] || []), ['?', 'Open or close this list'], ['Esc', 'Close']]);

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

// Capture phase on window runs before the screens' own key handlers, so while
// the list is open, Enter and friends don't also drive the game.
function onKey(e) {
  if (e.key === '?' && !isTyping(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    display.helpOpen = !display.helpOpen;
    return;
  }
  if (!display.helpOpen) return;
  e.stopPropagation();
  if (e.key === 'Escape' || e.key === 'Enter') display.helpOpen = false;
}
onMounted(() => window.addEventListener('keydown', onKey, true));
onUnmounted(() => window.removeEventListener('keydown', onKey, true));
</script>

<template>
  <Transition name="overlay">
    <div v-if="display.helpOpen" class="overlay" @click.self="display.helpOpen = false">
      <div class="help-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <h2 id="help-title" class="help-title">⌨ Keyboard shortcuts</h2>
        <table class="help-table">
          <tr v-for="[k, what] in rows" :key="k">
            <td><kbd>{{ k }}</kbd></td>
            <td>{{ what }}</td>
          </tr>
        </table>
        <button class="btn btn-yellow" @click="display.helpOpen = false">Got it</button>
      </div>
    </div>
  </Transition>
</template>
