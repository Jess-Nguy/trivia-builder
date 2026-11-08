import { reactive, watch } from 'vue';

// Host-side display preferences for playing on a TV: text scale and colour
// theme. Persisted to localStorage and applied to <html>.
const DISPLAY_KEY = 'trivia-display';
export const SCALES = [0.9, 1, 1.15, 1.3, 1.5];
export const THEMES = ['auto', 'light', 'dark'];

function load() {
  try {
    const obj = JSON.parse(localStorage.getItem(DISPLAY_KEY)) || {};
    return {
      scale: SCALES.includes(obj.scale) ? obj.scale : 1,
      theme: THEMES.includes(obj.theme) ? obj.theme : 'auto',
    };
  } catch {
    return { scale: 1, theme: 'auto' };
  }
}

export const display = reactive({
  ...load(),
  helpOpen: false,

  bigger() {
    const i = SCALES.indexOf(this.scale);
    if (i < SCALES.length - 1) this.scale = SCALES[i + 1];
  },
  smaller() {
    const i = SCALES.indexOf(this.scale);
    if (i > 0) this.scale = SCALES[i - 1];
  },
  cycleTheme() {
    this.theme = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
  },
});

function apply() {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(display.scale));
  if (display.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = display.theme;
  try {
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({ scale: display.scale, theme: display.theme }));
  } catch {
    // Storage blocked (private window): the preference just won't persist.
  }
}
watch(() => [display.scale, display.theme], apply, { immediate: true });
