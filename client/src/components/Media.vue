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

// --- IFrame-API YouTube player ----------------------------------------------
// Both the visible video and #audio-only links are driven through the YouTube
// IFrame API rather than a plain autoplay embed, so we can force sound on at
// play time (unMute) — a plain embed can silently land muted (e.g. a stuck
// YouTube mute toggle, whose control is hidden until you fullscreen the video).
// The API also gives the #audio path play/pause control behind our own minimal
// UI, so the video surface (and its answer-spoiling thumbnail) is never shown.
const ytVideoHost = ref(null); // visible-video host
const ytAudioHost = ref(null); // hidden audio-only host
const isYouTubePlayer = computed(
  () => kind.value === 'youtube' || kind.value === 'youtube-audio'
);
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

function destroyPlayer() {
  stopPoll();
  playerReady = false;
  playing.value = false;
  elapsed.value = 0;
  duration.value = 0;
  if (player && player.destroy) player.destroy();
  player = null;
  if (ytVideoHost.value) ytVideoHost.value.innerHTML = '';
  if (ytAudioHost.value) ytAudioHost.value.innerHTML = '';
}

// Pick the host element for the current kind (only one is rendered at a time).
function currentHost() {
  return kind.value === 'youtube-audio' ? ytAudioHost.value : ytVideoHost.value;
}

async function buildPlayer() {
  if (!isYouTubePlayer.value || !currentHost()) return;
  await loadYouTubeApi();
  // Bail if the attachment changed while the API was loading.
  if (!isYouTubePlayer.value || !currentHost()) return;
  destroyPlayer();

  const audioOnly = kind.value === 'youtube-audio';
  const host = currentHost();
  const el = document.createElement('div');
  host.appendChild(el);
  player = new window.YT.Player(el, {
    videoId: ytId.value,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      // Reaching a question is a user tap, so playback may autoplay; if the
      // browser blocks autoplay-with-sound, the native controls (video) or our
      // play button (audio) still start it unmuted on click.
      autoplay: 1,
      controls: audioOnly ? 0 : 1,
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
        // Force sound on: the player can otherwise come up muted, and YouTube's
        // mute control is tucked away (only visible once you fullscreen it).
        e.target.unMute();
        e.target.playVideo();
      },
      onStateChange: (e) => {
        playing.value = e.data === window.YT.PlayerState.PLAYING;
        // Only the audio-only UI needs the progress poll; the visible video
        // uses YouTube's own controls and timeline.
        if (audioOnly && playing.value) {
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
// the attachment swaps. flush:'post' lets the watch run after the DOM updates so
// a freshly-rendered host element is in place. Keyed on kind+id+start so
// switching between the visible video and the audio-only player, or to a
// different track, rebuilds the player against the right host.
watch(
  () => (isYouTubePlayer.value ? `${kind.value}|${ytId.value}|${ytStart.value || 0}` : null),
  (key) => (key ? buildPlayer() : destroyPlayer()),
  { flush: 'post' }
);

onMounted(() => {
  if (isYouTubePlayer.value) buildPlayer();
});

onBeforeUnmount(() => {
  setCounted(false);
  destroyPlayer();
});
</script>

<template>
  <div class="media-wrap" v-if="src">
    <div v-if="kind === 'youtube'" class="yt-frame">
      <!-- Driven by the IFrame API (see buildPlayer) so we can force sound on;
           the API replaces this host element with the player iframe. -->
      <div ref="ytVideoHost" class="yt-embed"></div>
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
