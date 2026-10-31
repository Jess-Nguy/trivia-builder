<script setup>
// Backdrops behind every screen; the stylesheet shows one per theme.
// Light: a static cartoon game-show stage (curtain stripes, spotlight beams, a
// truss of marquee bulbs, the stage floor).
// Dark: a synthwave scene (starry sky, sunset sun, a drawn city skyline, neon
// grid floor) with ambient life: flickering windows, blinking rooftop
// beacons, twinkling stars and birds flying across the sun. Those loops run
// only under prefers-reduced-motion: no-preference (see style.css).
const HORIZON = 600;

// Deterministic "random" so stars and buildings don't shift between reloads.
let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + Math.round(rand() * (hi - lo));

const stars = Array.from({ length: 90 }, (_, i) => ({
  x: Math.round(rand() * 1600),
  y: Math.round(rand() * (HORIZON - 140)),
  r: rand() < 0.15 ? 2.2 : 1.2,
  twinkle: i % 6 === 0,
  delay: -(rand() * 4).toFixed(2),
}));

// One building silhouette. Returns its outline path, the rectangle windows can
// sit in, and the antenna tip (for a beacon) when it has one.
function building(x, w, h, type) {
  const base = HORIZON;
  const top = base - h;
  const cx = x + w / 2;
  let d;
  let bodyTop = top;
  let tip = null;
  switch (type) {
    case 'deco': {
      // Stepped Art Deco tower with an antenna.
      const s = w * 0.14;
      const t1 = top + h * 0.3;
      const t2 = top + h * 0.13;
      d = `M${x} ${base}V${t1}H${x + s}V${t2}H${x + 2 * s}V${top}H${x + w - 2 * s}V${t2}H${x + w - s}V${t1}H${x + w}V${base}Z`;
      d += `M${cx - 1.5} ${top}V${top - 34}H${cx + 1.5}V${top}Z`;
      bodyTop = t1;
      tip = { x: cx, y: top - 34 };
      break;
    }
    case 'spire': {
      const t = top + h * 0.28;
      d = `M${x} ${base}V${t}H${x + w * 0.18}L${cx} ${top}L${x + w * 0.82} ${t}H${x + w}V${base}Z`;
      bodyTop = t;
      break;
    }
    case 'slant': {
      d = `M${x} ${base}V${top + h * 0.22}L${x + w} ${top}V${base}Z`;
      bodyTop = top + h * 0.22;
      break;
    }
    case 'dome': {
      const r = w / 2;
      const t = top + r * 0.7;
      d = `M${x} ${base}V${t}A${r} ${r * 0.7} 0 0 1 ${x + w} ${t}V${base}Z`;
      d += `M${cx - 1.5} ${top}V${top - 16}H${cx + 1.5}V${top}Z`;
      bodyTop = t;
      break;
    }
    case 'water': {
      // Flat roof with a water tower: legs, barrel and a cone cap.
      const tx = x + w * 0.5;
      const tw = Math.max(18, w * 0.32);
      d = `M${x} ${base}V${top}H${x + w}V${base}Z`;
      d += `M${tx + 2} ${top}V${top - 12}H${tx + 4}V${top}ZM${tx + tw - 4} ${top}V${top - 12}H${tx + tw - 2}V${top}Z`;
      d += `M${tx} ${top - 12}V${top - 30}H${tx + tw}V${top - 12}Z`;
      d += `M${tx - 2} ${top - 30}L${tx + tw / 2} ${top - 40}L${tx + tw + 2} ${top - 30}Z`;
      break;
    }
    default: {
      // Flat roof with a parapet notch and a small rooftop box.
      d = `M${x} ${base}V${top + 6}H${x + w * 0.1}V${top}H${x + w * 0.9}V${top + 6}H${x + w}V${base}Z`;
      d += `M${x + w * 0.2} ${top}V${top - 10}H${x + w * 0.42}V${top}Z`;
      bodyTop = top + 6;
    }
  }
  return { d, body: { x, w, top: bodyTop }, tip, h };
}

// Far row: taller, hazy silhouettes for depth. No windows.
const far = [];
for (let x = -40; x < 1640; ) {
  const w = between(60, 130);
  far.push(building(x, w, between(150, 330), pick(['deco', 'spire', 'flat', 'slant', 'deco'])));
  x += w - between(0, 12);
}

// Near row: drawn buildings with lit windows; a couple of tall towers carry
// beacons.
const TYPES = ['deco', 'spire', 'slant', 'dome', 'water', 'flat', 'flat', 'deco'];
const WINDOW_COLOURS = ['#ffd23e', '#ffd23e', '#ffd23e', '#ffe9a8', '#ff6ad5', '#3ee6ff'];
const near = [];
for (let x = -20; x < 1620; ) {
  const w = between(48, 112);
  const tall = rand() < 0.15;
  near.push(building(x, w, tall ? between(230, 300) : between(80, 210), pick(TYPES)));
  x += w + between(2, 10);
}

const windows = [];
for (const b of near) {
  const { x, w, top } = b.body;
  for (let wx = x + 7; wx + 5 < x + w - 6; wx += 11) {
    for (let wy = top + 10; wy + 7 < HORIZON - 8; wy += 15) {
      if (rand() < 0.32) windows.push({ x: wx, y: wy, colour: pick(WINDOW_COLOURS) });
    }
  }
}
// About two dozen lit windows flicker, each on its own clock.
const flickerEvery = Math.max(1, Math.floor(windows.length / 24));
windows.forEach((win, i) => {
  if (i % flickerEvery === 0) {
    win.flicker = true;
    win.dur = `${(2 + rand() * 5).toFixed(2)}s`;
    win.delay = `${(-rand() * 6).toFixed(2)}s`;
  }
});

const beacons = near
  .filter((b) => b.tip)
  .sort((a, b) => b.h - a.h)
  .slice(0, 3)
  .map((b, i) => ({ ...b.tip, delay: `${-i * 0.8}s` }));

// Birds crossing the sun at different heights, sizes and speeds.
const birds = [
  { y: 90, s: 1.6, dur: '26s', delay: '-4s' },
  { y: 125, s: 1.15, dur: '34s', delay: '-17s' },
  { y: 160, s: 0.8, dur: '41s', delay: '-29s' },
];

const stripes = Array.from({ length: 10 }, (_, i) => i * 170 + 40);
const bulbs = Array.from({ length: 25 }, (_, i) => i * 66 + 8);

const rows = [608, 618, 632, 652, 680, 718, 768, 832, 900];
const cols = Array.from({ length: 33 }, (_, i) => -3200 + i * 250);
</script>

<template>
  <svg class="stage stage-stage" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <rect width="1600" height="900" class="stage-wall" />
    <rect v-for="x in stripes" :key="x" :x="x" y="0" width="70" height="900" class="stage-stripe" />
    <polygon points="230,40 300,40 520,900 -40,900" class="stage-beam" />
    <polygon points="1300,40 1370,40 1640,900 1080,900" class="stage-beam" />
    <polygon points="770,40 830,40 1000,900 600,900" class="stage-beam" />
    <rect x="0" y="0" width="1600" height="40" class="stage-truss" />
    <circle v-for="x in bulbs" :key="x" :cx="x" cy="58" r="9" class="stage-bulb" />
    <ellipse cx="800" cy="930" rx="1050" ry="190" class="stage-floor" />
  </svg>

  <svg class="stage stage-synth" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0d0118" />
        <stop offset="0.55" stop-color="#3a0a52" />
        <stop offset="1" stop-color="#8a1a78" />
      </linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe45c" />
        <stop offset="0.5" stop-color="#ff8a2a" />
        <stop offset="1" stop-color="#ff2f7a" />
      </linearGradient>
      <radialGradient id="sun-glow">
        <stop offset="0.6" stop-color="#ff8a2a" stop-opacity="0.6" />
        <stop offset="1" stop-color="#ff2f7a" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5a0a5e" />
        <stop offset="0.45" stop-color="#26063f" />
        <stop offset="1" stop-color="#0d0118" />
      </linearGradient>
      <radialGradient id="floor-glow" cx="0.5" cy="0" r="0.6">
        <stop offset="0" stop-color="#ff7a3c" stop-opacity="0.7" />
        <stop offset="1" stop-color="#ff2f7a" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="grid-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff6ad5" />
        <stop offset="1" stop-color="#7b5cff" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-200%" width="140%" height="500%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
    </defs>

    <rect width="1600" :height="HORIZON" fill="url(#sky)" />
    <circle
      v-for="(s, i) in stars"
      :key="i"
      :cx="s.x"
      :cy="s.y"
      :r="s.r"
      class="stage-star"
      :class="{ twinkle: s.twinkle }"
      :style="s.twinkle ? { animationDelay: `${s.delay}s` } : null"
    />

    <circle cx="800" cy="600" r="760" fill="url(#sun-glow)" />
    <circle cx="800" cy="600" r="560" fill="url(#sun)" />

    <g class="birds">
      <g
        v-for="(b, i) in birds"
        :key="i"
        class="bird-flight"
        :style="{ animationDuration: b.dur, animationDelay: b.delay }"
      >
        <g :transform="`translate(0 ${b.y}) scale(${b.s})`">
          <path class="bird" d="M0 0Q9-10 18 0Q27-10 36 0Q27-4 18 4Q9-4 0 0Z" />
        </g>
      </g>
    </g>

    <path v-for="(b, i) in far" :key="`f${i}`" :d="b.d" class="skyline-far" />
    <path v-for="(b, i) in near" :key="`n${i}`" :d="b.d" class="skyline-near" />
    <rect
      v-for="(win, i) in windows"
      :key="`w${i}`"
      :x="win.x"
      :y="win.y"
      width="5"
      height="7"
      :fill="win.colour"
      class="skyline-window"
      :class="{ flicker: win.flicker }"
      :style="win.flicker ? { animationDuration: win.dur, animationDelay: win.delay } : null"
    />
    <circle
      v-for="(b, i) in beacons"
      :key="`b${i}`"
      :cx="b.x"
      :cy="b.y"
      r="3.5"
      class="beacon"
      :style="{ animationDelay: b.delay }"
    />

    <rect :y="HORIZON" width="1600" :height="900 - HORIZON" fill="url(#floor)" />
    <ellipse cx="800" :cy="HORIZON" rx="900" ry="260" fill="url(#floor-glow)" />
    <g stroke="url(#grid-fade)" class="stage-grid">
      <line v-for="y in rows" :key="`r${y}`" x1="0" :y1="y" x2="1600" :y2="y" />
      <line v-for="x in cols" :key="`c${x}`" x1="800" :y1="HORIZON" :x2="x" y2="900" />
    </g>
    <line x1="0" :y1="HORIZON" x2="1600" :y2="HORIZON" class="stage-horizon-glow" filter="url(#glow)" />
    <line x1="0" :y1="HORIZON" x2="1600" :y2="HORIZON" class="stage-horizon" />
  </svg>
</template>
