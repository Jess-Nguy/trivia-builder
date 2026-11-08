<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { store } from '../store.js';
import { youTubeId, loadYouTubeApi } from '../youtube.js';

// Persistent background-music player. Mounted once in App.vue (outside the
// screen <component>) so it keeps playing across screen changes. Uses the
// YouTube IFrame Player API — not a plain embed — because only the API lets us
// change volume and mute at runtime. The iframe is parked off-screen (hidden
// via CSS, never display:none, which would stop it loading/autoplaying).

const host = ref(null); // wrapper; the API replaces an inner div with the iframe
let player = null;
let ready = false;

const videoId = computed(() => (store.audio.link ? youTubeId(store.audio.link) : null));
const active = computed(() => !!videoId.value);

// Pause the music while a question's own YouTube/video/audio is on screen.
const pausedForMedia = computed(() => store.mediaSoundCount > 0);

function applyVolume() {
  if (player && ready && player.setVolume) player.setVolume(store.audio.volume);
}
function applyMute() {
  if (!player || !ready) return;
  if (store.audio.muted) player.mute();
  else player.unMute();
}
// Pause while a question's own media is playing; resume otherwise. Independent
// of mute — pausing/resuming doesn't touch the host's mute or volume choice.
function applyPauseForMedia() {
  if (!player || !ready) return;
  if (pausedForMedia.value) player.pauseVideo();
  else player.playVideo();
}

function destroyPlayer() {
  ready = false;
  if (player && player.destroy) player.destroy();
  player = null;
  if (host.value) host.value.innerHTML = '';
}

// (Re)create the player for the current track. Recreating (rather than
// loadVideoById) keeps the single-song loop reliable: loop=1 needs playlist set
// to the same id, which is cleanest to establish at construction.
async function buildPlayer() {
  if (!videoId.value || !host.value) return;
  await loadYouTubeApi();
  // Bail if the track changed/cleared while the API was loading.
  if (!videoId.value || !host.value) return;
  destroyPlayer();

  const el = document.createElement('div');
  host.value.appendChild(el);
  const id = videoId.value;
  player = new window.YT.Player(el, {
    videoId: id,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1,
      controls: 0,
      loop: 1,
      playlist: id, // required alongside loop=1 to loop a single video
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3,
    },
    events: {
      onReady: (e) => {
        ready = true;
        applyVolume();
        applyMute();
        // Start playing unless a question media is already on screen.
        if (pausedForMedia.value) e.target.pauseVideo();
        else e.target.playVideo();
      },
      onStateChange: (e) => {
        // Belt-and-suspenders loop in case the loop param is ignored.
        if (e.data === window.YT.PlayerState.ENDED) {
          e.target.seekTo(0);
          e.target.playVideo();
        }
      },
    },
  });
}

function toggleMute() {
  store.setAudioMuted(!store.audio.muted);
}
function onVolumeInput(e) {
  store.setAudioVolume(e.target.value);
}

watch(videoId, (id) => {
  if (id) buildPlayer();
  else destroyPlayer();
});
watch(() => store.audio.volume, applyVolume);
watch(() => store.audio.muted, applyMute);
watch(pausedForMedia, applyPauseForMedia);

onMounted(() => {
  if (videoId.value) buildPlayer();
});
onBeforeUnmount(destroyPlayer);
</script>

<template>
  <!-- Off-screen player (kept in the DOM so audio keeps playing). -->
  <div ref="host" class="bg-audio-hidden" aria-hidden="true"></div>

  <!-- Floating control, only while a track is active. -->
  <div v-if="active" class="bg-audio-ctrl" :class="{ 'bg-audio-paused-for-media': pausedForMedia }">
    <span v-if="pausedForMedia" class="bg-audio-paused" title="Paused for question video">⏸</span>
    <button
      type="button"
      class="bg-audio-mute"
      :title="store.audio.muted ? 'Unmute music' : 'Mute music'"
      @click="toggleMute"
    >
      {{ store.audio.muted ? '🔇' : '🔊' }}
    </button>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      class="bg-audio-vol"
      :value="store.audio.volume"
      :disabled="store.audio.muted"
      title="Music volume"
      @input="onVolumeInput"
    />
  </div>
</template>
