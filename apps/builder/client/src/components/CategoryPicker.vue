<script setup>
import { ref, computed } from 'vue';

// Chip input over v-model (string[]). Suggests known and already-used
// categories; anything else typed becomes a new custom category.
const model = defineModel({ type: Array, default: () => [] });
const props = defineProps({ suggestions: { type: Array, default: () => [] } });

const draft = ref('');
const listId = `cats-${Math.random().toString(36).slice(2)}`;
const norm = (s) => s.trim().toLowerCase();

const remaining = computed(() => {
  const have = new Set(model.value.map(norm));
  return props.suggestions.filter((c) => !have.has(norm(c)));
});

function add(raw = draft.value) {
  const name = raw.trim();
  draft.value = '';
  if (!name || model.value.some((c) => norm(c) === norm(name))) return;
  // Reuse the existing spelling when the user types a known category in another case.
  const known = props.suggestions.find((c) => norm(c) === norm(name));
  model.value = [...model.value, known || name];
}

function remove(c) {
  model.value = model.value.filter((x) => x !== c);
}

function onKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    add();
  } else if (e.key === 'Backspace' && !draft.value && model.value.length) {
    remove(model.value.at(-1));
  }
}
</script>

<template>
  <div class="cat-picker-input">
    <span v-for="c in model" :key="c" class="cat-tag">
      {{ c }}
      <button type="button" class="cat-tag-x" :aria-label="`Remove ${c}`" @click="remove(c)">×</button>
    </span>
    <input
      v-model="draft"
      type="text"
      :list="listId"
      class="cat-draft"
      placeholder="Add a category…"
      aria-label="Add a category"
      @keydown="onKey"
      @change="add()"
    />
    <datalist :id="listId">
      <option v-for="c in remaining" :key="c" :value="c" />
    </datalist>
  </div>
</template>
