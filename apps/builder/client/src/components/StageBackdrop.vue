<script setup>
import PixelBackdrop from './PixelBackdrop.vue';

// Backdrops behind every screen; the stylesheet shows one per theme.
// Light: the pixel platformer day (PixelBackdrop.vue).
// Dark: a neon city at night. A faint grid over a starry purple sky, a moon,
// a striped retro sun behind a spire tower, low-poly neon mountains, a skyline
// of corner-on 3D towers with lit windows, reflected in a grid floor. In front,
// two 3D towers flank the board like a street, with neon palms beside them.
// Ambient life: the floor grid rolls toward the viewer, the sun's stripes
// slide down, hover cars cross the sky, windows, panes and shop signs
// flicker, beacons blink, stars twinkle and a shooting star passes now and
// then. Those loops run only under prefers-reduced-motion: no-preference (see
// style.css).
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
// Four-point sparkles, like the pixel-city references.
const sparkles = [[140, 80], [470, 190], [1130, 60], [1290, 210], [690, 40], [1540, 300]].map(([x, y], i) => ({
  x, y, colour: i % 2 ? '#ffd23e' : '#ff6ad5', delay: `${-i * 0.9}s`,
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
      tip = { x: cx, y: top };
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

// Far row: taller, hazy silhouettes for depth, with a few faint windows.
const far = [];
for (let x = -40; x < 1640; ) {
  const w = between(60, 130);
  far.push(building(x, w, between(170, 360), pick(['deco', 'spire', 'flat', 'slant', 'deco'])));
  x += w - between(0, 12);
}

// Near row and the spire in front of the sun: corner-on towers. Two faces
// meet at a front corner; rooflines and window rows slope toward the horizon
// so each face reads as receding. The face turned toward the centre is lit.
const MID_X = 800;
const OUTLINES = ['#3ee6ff', '#ff4fd0', '#9b7bff'];
const WINDOW_COLOURS = ['#ffd23e', '#ffd23e', '#ffe9a8', '#ff6ad5', '#3ee6ff', '#3ee6ff'];
const windows = [];
const f1 = (n) => n.toFixed(1);
const poly = (list) => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');

function cornerTower(x, w, h, kind, outline) {
  const base = HORIZON;
  const top = base - h;
  const cx = x + w * (0.4 + rand() * 0.2);
  const drop = h * 0.09;
  // A face runs from x0 to x1 with roof heights t0 and t1 at its ends; `at`
  // maps (u across, r up) to a point, so rows converge on the horizon.
  const face = (x0, x1, t0, t1, lit) => ({
    lit,
    at: (u, r) => [x0 + (x1 - x0) * u, base - r * (base - (t0 + (t1 - t0) * u))],
    width: x1 - x0,
  });
  const centreOnRight = x + w / 2 < MID_X;
  const faces = [face(x, cx, top + drop, top, centreOnRight), face(cx, x + w, top, top + drop, !centreOnRight)];
  for (const fc of faces) {
    const cols = Math.max(2, Math.floor(fc.width / 11));
    for (let c = 0; c < cols; c++) {
      for (let r = 0.05; r + 7 / h < 0.95; r += 15 / h) {
        if (rand() >= 0.36) continue;
        const u1 = (c + 0.25) / cols;
        const u2 = (c + 0.75) / cols;
        const r2 = r + 7 / h;
        windows.push({ points: poly([fc.at(u1, r), fc.at(u2, r), fc.at(u2, r2), fc.at(u1, r2)]), colour: pick(WINDOW_COLOURS), shade: !fc.lit });
      }
    }
  }
  const left = [x, top + drop];
  const right = [x + w, top + drop];
  const corner = [cx, top];
  let roofs = [];
  let tip = null;
  let outlineD = `M${x} ${base}V${f1(top + drop)}L${f1(cx)} ${top}L${x + w} ${f1(top + drop)}V${base}`;
  let cornerD = `M${f1(cx)} ${base}V${top}`;
  if (kind === 'spire') {
    const apex = [cx, top - h * 0.22];
    roofs = [{ points: poly([left, corner, apex]), lit: faces[0].lit }, { points: poly([corner, right, apex]), lit: faces[1].lit }];
    outlineD = `M${x} ${base}V${f1(top + drop)}L${f1(apex[0])} ${f1(apex[1])}L${x + w} ${f1(top + drop)}V${base}`;
    cornerD += `L${f1(apex[0])} ${f1(apex[1])}`;
    tip = { x: apex[0], y: apex[1] };
  } else if (kind === 'antenna') {
    cornerD += `V${top - 34}`;
    tip = { x: cx, y: top - 34 };
  }
  return {
    h,
    tip,
    outline,
    cornerX: cx,
    top,
    faces: faces.map((fc) => ({ points: poly([fc.at(0, 0), fc.at(0, 1), fc.at(1, 1), fc.at(1, 0)]), lit: fc.lit })),
    roofs,
    outlineD,
    cornerD,
  };
}

const hero = cornerTower(740, 120, 470, 'spire', '#ff4fd0');

// Shorter at the edges so the mountains show behind; a few tall towers carry
// beacons.
const KINDS = ['box', 'box', 'antenna', 'spire'];
const near = [];
for (let x = -20; x < 1620; ) {
  const w = between(48, 112);
  const edge = x < 260 || x > 1300;
  const tall = !edge && rand() < 0.2;
  near.push(cornerTower(x, w, tall ? between(240, 320) : edge ? between(60, 150) : between(90, 220), pick(KINDS), pick(OUTLINES)));
  x += w + between(2, 10);
}

const farWindows = [];
for (const b of far) {
  const { x, w, top } = b.body;
  for (let wx = x + 8; wx + 4 < x + w - 6; wx += 12) {
    for (let wy = top + 12; wy + 5 < HORIZON - 8; wy += 16) {
      if (rand() < 0.18) farWindows.push({ x: wx, y: wy });
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

// Neon strips down the front corner of a few tall towers; every other one
// pulses.
const strips = near
  .filter((b) => b.h > 150)
  .slice(0, 8)
  .map((b, i) => ({ x: b.cornerX - 1.5, y: b.top + 4, h: HORIZON - b.top - 8, colour: OUTLINES[i % 2], pulse: i % 2 === 0, delay: `${-i * 0.7}s` }));

const beacons = [...near, hero]
  .filter((b) => b.tip)
  .sort((a, b) => b.h - a.h)
  .slice(0, 4)
  .map((b, i) => ({ ...b.tip, delay: `${-i * 0.8}s` }));

// Low-poly mountains at the sides: outline plus inner facet lines.
const mountains = [
  { outline: '-40,600 60,470 150,520 250,430 360,505 450,460 560,600', facets: 'M60 470L150 600M150 520L250 600M250 430L300 600M250 430L200 600M360 505L330 600M450 460L420 600M450 460L500 600' },
  { outline: '1040,600 1150,480 1240,530 1350,440 1460,500 1560,450 1660,600', facets: 'M1150 480L1110 600M1150 480L1240 600M1240 530L1290 600M1350 440L1320 600M1350 440L1400 600M1460 500L1450 600M1560 450L1520 600M1560 450L1610 600' },
];

// Foreground towers flanking the board like a street. Each is a box: a front
// face plus a side wall receding toward the vanishing point, with floor
// ledges, glowing panes, a dotted panel texture and a shop sign.
const VP = [800, HORIZON];
const DEPTH = 0.17;
const toward = ([x, y], f) => [x + (VP[0] - x) * f, y + (VP[1] - y) * f];
const pts = (list) => list.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');

function tower({ x0, x1, top, base, theme, street, floors, cols, sign }) {
  const sx = street === 'right' ? x1 : x0;
  const quad = (y1, y2, t1, t2) => pts([toward([sx, y1], DEPTH * t1), toward([sx, y1], DEPTH * t2), toward([sx, y2], DEPTH * t2), toward([sx, y2], DEPTH * t1)]);
  const floorH = (base - top - 120) / floors;
  const ledges = [];
  const panes = [];
  const sidePanes = [];
  const paneW = (x1 - x0 - 36 - (cols - 1) * 14) / cols;
  for (let i = 0; i <= floors; i++) {
    const y = top + 24 + i * floorH;
    ledges.push({ x: x0, y, w: x1 - x0, side: quad(y, y + 6, 0, 1) });
    if (i === floors) break;
    const py = y + 14;
    const ph = floorH - 24;
    for (let c = 0; c < cols; c++) {
      const roll = rand();
      panes.push({ x: x0 + 18 + c * (paneW + 14), y: py, w: paneW, h: ph, state: roll < 0.55 ? 'lit' : roll < 0.8 ? 'dim' : 'dark', flicker: rand() < 0.12, delay: `${(-rand() * 6).toFixed(2)}s` });
    }
    for (const [t1, t2] of [[0.12, 0.42], [0.55, 0.85]]) sidePanes.push({ points: quad(py, py + ph, t1, t2), state: rand() < 0.6 ? 'lit' : 'dim' });
  }
  const shopY = base - 96;
  const farEdge = (y) => toward([sx, y], DEPTH).map((n) => n.toFixed(1)).join(' ');
  return {
    theme,
    front: { x: x0, y: top, w: x1 - x0, h: base - top },
    side: quad(top, base, 0, 1),
    cornice: { x: x0, y: top - 12, w: x1 - x0, side: quad(top - 12, top, 0, 1) },
    // One outline: the front rectangle, then the side wall's three outer
    // edges, so the shared corner edge is drawn once.
    edge: `M${x0} ${top - 12}H${x1}V${base}H${x0}ZM${sx} ${top - 12}L${farEdge(top - 12)}L${farEdge(base)}L${sx} ${base}`,
    ledges,
    panes,
    sidePanes,
    shop: { x: x0 + 14, y: shopY + 34, w: x1 - x0 - 28, h: 50, side: quad(shopY + 34, base - 12, 0.1, 0.9) },
    // Centre the sign on the on-screen part of the front face.
    sign: { x: (Math.max(x0, 0) + Math.min(x1, 1600)) / 2, y: shopY + 18, w: Math.min(x1, 1600) - Math.max(x0, 0) - 20, text: sign },
    curb: pts([[x0 - 10, base], [x1 + 10, base], toward([street === 'right' ? x1 + 10 : x0 - 10, base], DEPTH), toward([sx, base], DEPTH)]),
  };
}
const towers = [
  tower({ x0: -40, x1: 150, top: 190, base: 800, theme: 'cyan', street: 'right', floors: 6, cols: 2, sign: 'QUIZ BAR' }),
  tower({ x0: 1450, x1: 1640, top: 230, base: 800, theme: 'pink', street: 'left', floors: 5, cols: 2, sign: 'ARCADE' }),
];

// Neon palms in the gaps beside the towers: a segmented, tapering trunk and
// layered filled fronds (back ones darker), over a glow pool on the floor.
function palm(x, y, s, lean) {
  const crown = [lean * 46, -230];
  const ctrl = [lean * -14, -120];
  const at = (t) => [
    (1 - t) ** 2 * 0 + 2 * (1 - t) * t * ctrl[0] + t * t * crown[0],
    2 * (1 - t) * t * ctrl[1] + t * t * crown[1],
  ];
  const trunk = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const [ax, ay] = at(i / N);
    const [bx, by] = at((i + 1) / N);
    const wa = 13 - (i / N) * 6;
    const wb = 13 - ((i + 1) / N) * 6;
    trunk.push({ points: pts([[ax - wa, ay], [ax + wa, ay], [bx + wb * 1.15, by], [bx - wb * 1.15, by]]), shade: i % 2 });
  }
  const frond = (deg, len, back) => {
    const r = (deg * Math.PI) / 180;
    const dir = [Math.cos(r), Math.sin(r)];
    const tip = [crown[0] + dir[0] * len, crown[1] + dir[1] * len + len * 0.45];
    const mid = [crown[0] + dir[0] * len * 0.55, crown[1] + dir[1] * len * 0.55 - len * 0.2];
    const n = [-dir[1] * 22, dir[0] * 22];
    const f = (p) => p.map((v) => v.toFixed(1)).join(' ');
    return {
      back,
      d: `M${f(crown)}Q${f([mid[0] + n[0], mid[1] + n[1]])} ${f(tip)}Q${f([mid[0] - n[0], mid[1] - n[1]])} ${f(crown)}Z`,
      rib: `M${f(crown)}Q${f(mid)} ${f(tip)}`,
    };
  };
  const fronds = [
    ...[[-150, 120], [-95, 95], [-30, 120]].map(([d, l]) => frond(d, l, true)),
    ...[[-175, 135], [-125, 120], [-60, 125], [-5, 135], [25, 105], [160, 110]].map(([d, l]) => frond(d, l, false)),
  ];
  return { x, y, s, trunk, fronds, crown };
}
const palms = [palm(250, 880, 1.05, 1), palm(1360, 880, 1, -1)];

// Hover cars crossing the sky at different heights, speeds and directions.
const cars = [
  { y: 110, s: 1, dur: '24s', delay: '-6s', flip: false },
  { y: 200, s: 0.7, dur: '33s', delay: '-20s', flip: true },
];

// Floor grid: columns fan out from the vanishing point and stay still; rows
// roll from the horizon to the bottom edge. Ease-in timing bunches them near
// the horizon, which reads as perspective.
const cols = Array.from({ length: 33 }, (_, i) => -3200 + i * 250);
const ROWS = 9;
const ROW_SECONDS = 4.5;
const STATIC_ROWS = [608, 618, 632, 652, 680, 718, 768, 832, 900];
const rows = STATIC_ROWS.map((y, i) => ({
  y,
  style: { '--from': `${HORIZON - y}px`, '--to': `${900 - y}px`, animationDelay: `${(-i * ROW_SECONDS / ROWS).toFixed(2)}s` },
}));

// Sky grid behind the city.
const skyCols = Array.from({ length: 17 }, (_, i) => i * 100);
const skyRows = Array.from({ length: 5 }, (_, i) => 40 + i * 100);

// Sun stripes: evenly spaced bands that slide down across the sun, one
// spacing per loop, so the loop is seamless. One extra band waits above the
// sun to slide in.
const SUN = { cx: 800, cy: 400, r: 300 };
const BAND_GAP = 24;
const sunBands = Array.from({ length: 27 }, (_, i) => SUN.cy - SUN.r - BAND_GAP + i * BAND_GAP);
</script>

<template>
  <PixelBackdrop />

  <svg class="stage stage-synth" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#070220" />
        <stop offset="0.45" stop-color="#1e0745" />
        <stop offset="0.8" stop-color="#5a0f78" />
        <stop offset="1" stop-color="#b3207f" />
      </linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe45c" />
        <stop offset="0.5" stop-color="#ff8a3d" />
        <stop offset="1" stop-color="#ff2f8f" />
      </linearGradient>
      <radialGradient id="sun-glow">
        <stop offset="0.6" stop-color="#ff5aa8" stop-opacity="0.55" />
        <stop offset="1" stop-color="#ff2f7a" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a0a5e" />
        <stop offset="0.45" stop-color="#1c0640" />
        <stop offset="1" stop-color="#090220" />
      </linearGradient>
      <radialGradient id="floor-glow" cx="0.5" cy="0" r="0.6">
        <stop offset="0" stop-color="#ff7ad9" stop-opacity="0.6" />
        <stop offset="1" stop-color="#ff2f7a" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="grid-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff6ad5" />
        <stop offset="1" stop-color="#3ee6ff" />
      </linearGradient>
      <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3ee6ff" stop-opacity="0" />
        <stop offset="1" stop-color="#3ee6ff" stop-opacity="0.9" />
      </linearGradient>
      <linearGradient id="reflect-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.45" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <mask id="reflect-mask" maskUnits="userSpaceOnUse" x="0" :y="HORIZON" width="1600" :height="900 - HORIZON">
        <rect x="0" :y="HORIZON" width="1600" :height="900 - HORIZON" fill="url(#reflect-fade)" />
      </mask>
      <clipPath id="sun-disc">
        <rect x="0" :y="SUN.cy - SUN.r" width="1600" :height="2 * SUN.r" />
      </clipPath>
      <mask id="sun-stripes" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900">
        <rect width="1600" height="900" fill="#fff" />
        <g clip-path="url(#sun-disc)">
          <g class="sun-bands">
            <rect v-for="y in sunBands" :key="y" x="0" :y="y" width="1600" height="6" fill="#000" />
          </g>
        </g>
      </mask>
      <filter id="glow" x="-20%" y="-200%" width="140%" height="500%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect x="4" y="4" width="2" height="2" fill="#ffffff" />
      </pattern>
      <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <rect width="1600" :height="HORIZON" fill="url(#sky)" />
    <g class="sky-grid">
      <line v-for="x in skyCols" :key="`sx${x}`" :x1="x" y1="0" :x2="x" :y2="HORIZON - 60" />
      <line v-for="y in skyRows" :key="`sy${y}`" x1="0" :y1="y" x2="1600" :y2="y" />
    </g>
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
    <g v-for="(s, i) in sparkles" :key="`sp${i}`" :transform="`translate(${s.x} ${s.y})`">
      <path class="neon-sparkle" :fill="s.colour" :style="{ animationDelay: s.delay }" d="M0 -9L2 -2L9 0L2 2L0 9L-2 2L-9 0L-2 -2Z" />
    </g>
    <g class="moon" transform="translate(250 150)">
      <circle r="28" fill="#5b8cff" />
      <circle r="28" fill="none" stroke="#a9c4ff" stroke-width="2" />
      <circle cx="-8" cy="-6" r="6" fill="#4470e0" />
      <circle cx="9" cy="8" r="4" fill="#4470e0" />
    </g>
    <g transform="translate(700 70)">
      <line class="shooting-star" x1="-120" y1="-40" x2="0" y2="0" stroke="url(#trail)" />
    </g>

    <circle :cx="SUN.cx" :cy="SUN.cy" :r="SUN.r + 180" fill="url(#sun-glow)" />
    <circle :cx="SUN.cx" :cy="SUN.cy" :r="SUN.r" fill="url(#sun)" mask="url(#sun-stripes)" />

    <g class="car-lane">
      <g
        v-for="(c, i) in cars"
        :key="i"
        class="car-flight"
        :class="{ 'car-reverse': c.flip }"
        :style="{ animationDuration: c.dur, animationDelay: c.delay }"
      >
        <g :transform="`translate(0 ${c.y}) scale(${c.flip ? -c.s : c.s} ${c.s})`">
          <rect x="-90" y="8" width="90" height="4" fill="url(#trail)" />
          <path class="car-body" d="M0 12L8 2H30L40 8H52L56 14L50 18H4Z" />
          <rect x="6" y="18" width="44" height="3" class="car-glow" />
          <rect x="12" y="5" width="14" height="5" class="car-window" />
        </g>
      </g>
    </g>

    <g id="city">
      <path v-for="(b, i) in far" :key="`f${i}`" :d="b.d" class="skyline-far" />
      <rect v-for="(w, i) in farWindows" :key="`fw${i}`" :x="w.x" :y="w.y" width="4" height="5" class="far-window" />
      <g v-for="(m, i) in mountains" :key="`m${i}`">
        <polygon :points="m.outline" class="mountain" />
        <path :d="m.facets" class="mountain-facet" />
      </g>
      <g v-for="(b, i) in [hero, ...near]" :key="`n${i}`" :stroke="b.outline">
        <polygon v-for="(fc, j) in [...b.faces, ...b.roofs]" :key="j" :points="fc.points" :class="fc.lit ? 'mid-lit' : 'mid-shade'" />
        <path :d="b.outlineD" class="mid-outline" />
        <path :d="b.cornerD" class="mid-corner" />
      </g>
      <polygon
        v-for="(win, i) in windows"
        :key="`w${i}`"
        :points="win.points"
        :fill="win.colour"
        class="skyline-window"
        :class="{ flicker: win.flicker, shade: win.shade }"
        :style="win.flicker ? { animationDuration: win.dur, animationDelay: win.delay } : null"
      />
      <rect
        v-for="(s, i) in strips"
        :key="`st${i}`"
        :x="s.x"
        :y="s.y"
        width="3"
        :height="s.h"
        :fill="s.colour"
        class="neon-strip"
        :class="{ pulse: s.pulse }"
        :style="{ animationDelay: s.delay }"
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
    </g>

    <rect :y="HORIZON" width="1600" :height="900 - HORIZON" fill="url(#floor)" />
    <g mask="url(#reflect-mask)">
      <use href="#city" :transform="`translate(0 ${2 * HORIZON}) scale(1 -1)`" />
    </g>
    <ellipse cx="800" :cy="HORIZON" rx="900" ry="260" fill="url(#floor-glow)" />
    <g stroke="url(#grid-fade)" class="stage-grid">
      <line v-for="x in cols" :key="`c${x}`" x1="800" :y1="HORIZON" :x2="x" y2="900" />
      <line
        v-for="(r, i) in rows"
        :key="`r${i}`"
        x1="0"
        :y1="r.y"
        x2="1600"
        :y2="r.y"
        class="grid-row"
        :style="r.style"
      />
    </g>
    <line x1="0" :y1="HORIZON" x2="1600" :y2="HORIZON" class="stage-horizon-glow" filter="url(#glow)" />
    <line x1="0" :y1="HORIZON" x2="1600" :y2="HORIZON" class="stage-horizon" />
    <g v-for="(t, i) in towers" :key="`t${i}`" class="tower" :class="`tower-${t.theme}`">
      <polygon :points="t.curb" class="tower-curb" />
      <polygon :points="t.side" class="tower-side" />
      <polygon v-for="(sp, j) in t.sidePanes" :key="`sp${j}`" :points="sp.points" class="tower-pane" :class="`pane-${sp.state}`" />
      <polygon v-for="(l, j) in t.ledges" :key="`sl${j}`" :points="l.side" class="tower-ledge" />
      <polygon :points="t.shop.side" class="tower-pane pane-dim" />
      <rect :x="t.front.x" :y="t.front.y" :width="t.front.w" :height="t.front.h" class="tower-front" />
      <rect :x="t.front.x" :y="t.front.y" :width="t.front.w" :height="t.front.h" fill="url(#dots)" class="tower-dots" />
      <rect v-for="(l, j) in t.ledges" :key="`l${j}`" :x="l.x" :y="l.y" :width="l.w" height="6" class="tower-ledge" />
      <rect
        v-for="(p, j) in t.panes"
        :key="`p${j}`"
        :x="p.x"
        :y="p.y"
        :width="p.w"
        :height="p.h"
        class="tower-pane"
        :class="[`pane-${p.state}`, { flicker: p.flicker }]"
        :style="p.flicker ? { animationDelay: p.delay } : null"
      />
      <rect :x="t.shop.x" :y="t.shop.y" :width="t.shop.w" :height="t.shop.h" class="tower-pane pane-lit" />
      <rect :x="t.cornice.x" :y="t.cornice.y" :width="t.cornice.w" height="12" class="tower-cornice" />
      <polygon :points="t.cornice.side" class="tower-cornice" />
      <path :d="t.edge" class="tower-edge" />
      <rect :x="t.sign.x - t.sign.w / 2" :y="t.sign.y - 26" :width="t.sign.w" height="36" class="tower-sign-box" />
      <text :x="t.sign.x" :y="t.sign.y" class="neon-sign" text-anchor="middle" filter="url(#soft-glow)" :style="{ animationDelay: `${-i * 2.5}s` }">{{ t.sign.text }}</text>
    </g>
    <g v-for="(p, i) in palms" :key="`palm${i}`" :transform="`translate(${p.x} ${p.y}) scale(${p.s})`" class="palm">
      <ellipse cx="0" cy="4" rx="70" ry="12" class="palm-pool" />
      <path v-for="(f, j) in p.fronds.filter((f) => f.back)" :key="`fb${j}`" :d="f.d" class="palm-leaf palm-leaf-back" />
      <polygon v-for="(seg, j) in p.trunk" :key="`s${j}`" :points="seg.points" class="palm-trunk" :class="{ 'palm-trunk-shade': seg.shade }" />
      <g>
        <path v-for="(f, j) in p.fronds.filter((f) => !f.back)" :key="`ff${j}`" :d="f.d" class="palm-leaf" />
      </g>
      <path v-for="(f, j) in p.fronds.filter((f) => !f.back)" :key="`fr${j}`" :d="f.rib" class="palm-rib" />
      <circle v-for="k in 3" :key="`c${k}`" :cx="p.crown[0] + (k - 2) * 9" :cy="p.crown[1] + 10 + (k % 2) * 4" r="6" class="palm-nut" />
    </g>
  </svg>
</template>
