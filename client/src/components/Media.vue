<script setup>
import { computed } from 'vue';

const props = defineProps({ src: String });

// Pull a YouTube video id out of watch / youtu.be / embed / shorts URLs.
function youTubeId(url) {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i
  );
  return m ? m[1] : null;
}

const ytId = computed(() => youTubeId(props.src || ''));

const kind = computed(() => {
  if (ytId.value) return 'youtube';
  const url = (props.src || '').toLowerCase();
  const path = url.split('?')[0];
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(path)) return 'video';
  if (/\.(mp3|wav|m4a|aac|oga)$/.test(path)) return 'audio';
  return 'image'; // default — most attachments are images
});

const ytEmbed = computed(() => `https://www.youtube.com/embed/${ytId.value}`);
</script>

<template>
  <div class="media-wrap" v-if="src">
    <iframe
      v-if="kind === 'youtube'"
      class="yt-embed"
      :src="ytEmbed"
      title="question media"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
    <img v-else-if="kind === 'image'" :src="src" alt="question media" referrerpolicy="no-referrer" />
    <video v-else-if="kind === 'video'" :src="src" controls />
    <audio v-else-if="kind === 'audio'" :src="src" controls />
  </div>
</template>
