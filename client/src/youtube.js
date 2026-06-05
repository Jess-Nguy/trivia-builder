// Shared YouTube helpers, used by both the question Media component and the
// background-audio player.

// Pull a YouTube video id out of watch / youtu.be / embed / shorts URLs.
export function youTubeId(url) {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i
  );
  return m ? m[1] : null;
}
