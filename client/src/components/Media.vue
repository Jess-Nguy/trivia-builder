<script setup>
import { computed } from 'vue';

const props = defineProps({ src: String });

const kind = computed(() => {
  const url = (props.src || '').toLowerCase();
  const path = url.split('?')[0];
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(path)) return 'video';
  if (/\.(mp3|wav|m4a|aac|oga)$/.test(path)) return 'audio';
  return 'image'; // default — most attachments are images
});
</script>

<template>
  <div class="media-wrap" v-if="src">
    <img v-if="kind === 'image'" :src="src" alt="question media" />
    <video v-else-if="kind === 'video'" :src="src" controls />
    <audio v-else-if="kind === 'audio'" :src="src" controls />
  </div>
</template>
