// Shared YouTube helpers, used by both the question Media component and the
// background-audio player.

// Pull a YouTube video id out of watch / youtu.be / embed / shorts URLs.
// music.youtube.com shares the same watch?v= form, so it matches too.
export function youTubeId(url) {
  const m = String(url || '').match(
    /(?:(?:music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i
  );
  return m ? m[1] : null;
}

// Audio-only sentinel: an #audio fragment or &audio=1 flag on the link tells the
// player to hide the video and show only an audio player, so a video thumbnail
// can't give the answer away. Append it in the CSV, e.g. "...?t=30#audio".
export function isAudioOnly(url) {
  return /#audio\b/i.test(url) || /[?&]audio=1\b/i.test(url);
}

// Load the YouTube IFrame Player API exactly once; resolves when window.YT is
// usable. Shared by the background-music player and audio-only question media —
// the plain embed can't be controlled (play/pause) from script, the API can.
export function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!window.__ytApiPromise) {
    window.__ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        resolve();
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
  }
  return window.__ytApiPromise;
}
