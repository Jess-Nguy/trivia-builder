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

// Pull a start time (in seconds) out of the URL's t / start param.
// Accepts plain seconds ("33", "33s") and h/m/s form ("1m30s", "1h2m3s").
function youTubeStart(url) {
  const m = url.match(/[?&](?:t|start)=([^&]+)/i);
  if (!m) return null;
  const v = m[1];
  if (/^\d+s?$/.test(v)) return parseInt(v, 10); // plain seconds
  const parts = v.match(/(\d+)h|(\d+)m|(\d+)s/gi);
  if (!parts) return null;
  let secs = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (/h$/i.test(p)) secs += n * 3600;
    else if (/m$/i.test(p)) secs += n * 60;
    else secs += n;
  }
  return secs;
}

const ytStart = computed(() => youTubeStart(props.src || ''));

const kind = computed(() => {
  if (ytId.value) return 'youtube';
  const url = (props.src || '').toLowerCase();
  const path = url.split('?')[0];
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(path)) return 'video';
  if (/\.(mp3|wav|m4a|aac|oga)$/.test(path)) return 'audio';
  return 'image'; // default — most attachments are images
});

// Use the privacy-enhanced host + modest branding / no related videos.
// Note: YouTube has no param that fully removes the title bar, so we also
// mask it with an overlay strip in the template (see .yt-title-mask).
//
// autoplay=1: start playing immediately so the static thumbnail (which can
// give away the answer) is never shown. Kept unmuted so the audience hears
// the audio — autoplay-with-sound works because reaching a question is a
// user click/tap, which satisfies the browser's autoplay gesture policy.
const ytEmbed = computed(() => {
  let url = `https://www.youtube-nocookie.com/embed/${ytId.value}?rel=0&modestbranding=1&iv_load_policy=3&autoplay=1`;
  if (ytStart.value) url += `&start=${ytStart.value}`;
  return url;
});
</script>

<template>
  <div class="media-wrap" v-if="src">
    <div v-if="kind === 'youtube'" class="yt-frame">
      <iframe
        class="yt-embed"
        :src="ytEmbed"
        title="question media"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
      <!-- Masks the YouTube title bar so it can't give away the answer.
           pointer-events: none lets clicks (play/pause) pass through. -->
      <div class="yt-title-mask"></div>
    </div>
    <img v-else-if="kind === 'image'" :src="src" alt="question media" referrerpolicy="no-referrer" />
    <video v-else-if="kind === 'video'" :src="src" controls />
    <audio v-else-if="kind === 'audio'" :src="src" controls />
  </div>
</template>
