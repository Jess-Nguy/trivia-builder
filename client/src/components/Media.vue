<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { youTubeId, isAudioOnly, loadYouTubeApi } from '../youtube.js';
import { store } from '../store.js';

const props = defineProps({ src: String });

const ytId = computed(() => youTubeId(props.src || ''));
const ytAudio = computed(() => !!ytId.value && isAudioOnly(props.src || ''));

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
  if (ytId.value) return ytAudio.value ? 'youtube-audio' : 'youtube';
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

// Whether this media produces sound that would clash with background music.
// While any such media is on screen, the background player pauses (see
// BackgroundAudio.vue) and resumes once it's gone. Tracked as a store counter so
// multiple sound media (e.g. several option videos) pause the music correctly.
const hasSound = computed(() =>
  ['youtube', 'youtube-audio', 'video', 'audio'].includes(kind.value)
);

let counted = false;
function setCounted(on) {
  if (on === counted) return;
  counted = on;
  if (on) store.mediaSoundOn();
  else store.mediaSoundOff();
}

// Re-evaluate on src changes too — Vue reuses this component when the question's
// attachment swaps, so onMounted/onUnmounted alone would miss the transition.
watch(hasSound, (on) => setCounted(on), { immediate: true });

// --- Audio-only YouTube player ---------------------------------------------
// A YouTube embed is always a video; there's no param to drop the picture. So
// for #audio links we drive the track with the IFrame API through a hidden
// player and show our own audio UI — the video surface is never displayed, so a
// thumbnail can't spoil the answer.
const ytAudioHost = ref(null);
let player = null;
let playerReady = false;
const playing = ref(false);
const elapsed = ref(0);
const duration = ref(0);
let pollTimer = null;

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    if (player && playerReady && player.getCurrentTime) {
      elapsed.value = player.getCurrentTime() || 0;
    }
  }, 250);
}
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function destroyAudioPlayer() {
  stopPoll();
  playerReady = false;
  playing.value = false;
  elapsed.value = 0;
  duration.value = 0;
  if (player && player.destroy) player.destroy();
  player = null;
  if (ytAudioHost.value) ytAudioHost.value.innerHTML = '';
}

async function buildAudioPlayer() {
  if (kind.value !== 'youtube-audio' || !ytAudioHost.value) return;
  await loadYouTubeApi();
  // Bail if the attachment changed while the API was loading.
  if (kind.value !== 'youtube-audio' || !ytAudioHost.value) return;
  destroyAudioPlayer();

  const el = document.createElement('div');
  ytAudioHost.value.appendChild(el);
  player = new window.YT.Player(el, {
    videoId: ytId.value,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1, // reaching a question is a user tap, so audio may autoplay
      controls: 0,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3,
      start: ytStart.value || 0,
    },
    events: {
      onReady: (e) => {
        playerReady = true;
        duration.value = e.target.getDuration() || 0;
        e.target.playVideo();
      },
      onStateChange: (e) => {
        playing.value = e.data === window.YT.PlayerState.PLAYING;
        if (playing.value) {
          duration.value = player.getDuration() || duration.value;
          startPoll();
        } else {
          stopPoll();
        }
      },
    },
  });
}

function togglePlay() {
  if (!player || !playerReady) return;
  if (playing.value) player.pauseVideo();
  else player.playVideo();
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Build once mounted (the v-if host element exists by then), and rebuild when
// the attachment swaps to a different audio track. flush:'post' lets the watch
// run after the DOM updates so a freshly-rendered host element is in place.
// Keyed on id+start so swapping to a different audio track rebuilds the player.
watch(
  () => (kind.value === 'youtube-audio' ? `${ytId.value}|${ytStart.value || 0}` : null),
  (key) => (key ? buildAudioPlayer() : destroyAudioPlayer()),
  { flush: 'post' }
);

onMounted(() => {
  if (kind.value === 'youtube-audio') buildAudioPlayer();
});

onBeforeUnmount(() => {
  setCounted(false);
  destroyAudioPlayer();
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
    <div v-else-if="kind === 'youtube-audio'" class="yt-audio">
      <!-- Hidden player drives the audio; its video surface is never shown. -->
      <div ref="ytAudioHost" class="yt-audio-hidden" aria-hidden="true"></div>
      <button
        type="button"
        class="yt-audio-btn"
        :title="playing ? 'Pause' : 'Play'"
        @click="togglePlay"
      >
        {{ playing ? '⏸' : '▶' }}
      </button>
      <div class="yt-audio-body">
        <div class="yt-audio-label">🎵 Audio</div>
        <div class="yt-audio-bar">
          <div
            class="yt-audio-fill"
            :style="{ width: duration ? (elapsed / duration) * 100 + '%' : '0%' }"
          ></div>
        </div>
      </div>
      <div class="yt-audio-time">{{ fmtTime(elapsed) }} / {{ fmtTime(duration) }}</div>
    </div>
    <img v-else-if="kind === 'image'" :src="src" alt="question media" referrerpolicy="no-referrer" />
    <video v-else-if="kind === 'video'" :src="src" controls />
    <audio v-else-if="kind === 'audio'" :src="src" controls />
  </div>
</template>
