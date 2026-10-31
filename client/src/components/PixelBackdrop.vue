<script setup>
// Light backdrop: a pixel-art platformer day. Banded sky with dithered seams,
// a glowing sun, fluffy shaded clouds, far hills, a castle on a hill, trees,
// a floating grass platform, dirt-block ground, gold blocks, coins, a slime
// and a mushroom. Everything is drawn on a cell grid so edges stay square.
// Clouds drift, coins spin, sparkles twinkle and the slime hops; those loops
// run only under prefers-reduced-motion: no-preference (see style.css).
const W = 1600;
const GROUND = 800;

// A layer collects rectangles per colour class into one path each.
function layer() {
  const paths = {};
  const rect = (cls, x, y, w, h) => {
    paths[cls] = (paths[cls] ?? '') + `M${x} ${y}h${w}v${h}h${-w}Z`;
  };
  return { paths, rect };
}

// Cells inside any of the circles (in cell units), as a set of "x,y" keys.
function blob(lobes) {
  const cells = new Set();
  for (const [cx, cy, r] of lobes) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) cells.add(`${x},${y}`);
      }
    }
  }
  return cells;
}

// Paint a blob with a lit top edge, a shaded underside and a flat base.
function paintBlob(l, lobes, size, ox, oy, { base, light, shade, deep }, flatBelow = Infinity) {
  const cells = blob(lobes);
  const has = (x, y) => cells.has(`${x},${y}`) && y < flatBelow;
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    if (y >= flatBelow) continue;
    let cls = base;
    if (deep && !has(x, y + 1)) cls = deep;
    else if (shade && (!has(x, y + 2) || !has(x, y + 3))) cls = shade;
    else if (light && !has(x, y - 1)) cls = light;
    l.rect(cls, ox + x * size, oy + y * size, size, size);
  }
}

// Sky: five bands, each seam dithered with a checker row of the band below.
const sky = layer();
const BANDS = [0, 170, 320, 450, 570, GROUND];
BANDS.slice(0, -1).forEach((top, i) => {
  sky.rect(`px-sky-${i + 1}`, 0, top, W, BANDS[i + 1] - top);
  if (i > 0) for (let x = 0; x < W; x += 16) sky.rect(`px-sky-${i + 1}`, x + (x % 32 ? 8 : 0), top - 8, 8, 8);
});

// Sun: a soft halo, a warm rim and a bright core.
const sun = layer();
paintBlob(sun, [[0, 0, 7.5]], 12, 150, 160, { base: 'px-sun-halo' });
paintBlob(sun, [[0, 0, 5.5]], 12, 150, 160, { base: 'px-sun-rim' });
paintBlob(sun, [[-0.5, -0.5, 4]], 12, 150, 160, { base: 'px-sun', light: 'px-sun-core' });

// Drifting clouds: [x, y, cell size, lobes, drift seconds].
const CLOUD_TONES = { base: 'px-cloud', light: 'px-cloud', shade: 'px-cloud-shade', deep: 'px-cloud-deep' };
const clouds = [
  [20, 250, 9, [[4, 5, 4], [9, 3, 5], [14, 5, 4], [18, 6, 3]], 170],
  [560, 40, 8, [[4, 5, 3.5], [8, 3, 4.5], [13, 5, 3.5]], 210],
  [980, 150, 9, [[4, 6, 4], [10, 3, 6], [16, 5, 4.5], [21, 7, 3]], 190],
  [1380, 260, 7, [[3, 4, 3], [7, 3, 4], [11, 4, 3]], 240],
].map(([x, y, size, lobes, dur]) => {
  const l = layer();
  paintBlob(l, lobes, size, 0, 0, CLOUD_TONES, 10);
  const width = 26 * size;
  // Loop from just off the left edge to just off the right; the negative delay
  // starts each cloud where it is drawn, which is also where it rests when
  // motion is reduced.
  const from = -(x + width);
  const to = W - x;
  return { x, y, paths: l.paths, style: { '--from': `${from}px`, '--to': `${to}px`, animationDuration: `${dur}s`, animationDelay: `${(-dur * (-from / (to - from))).toFixed(1)}s` } };
});

// Cloud bank low behind the hills.
const bank = layer();
paintBlob(bank, [[6, 12, 7], [17, 9, 9], [29, 11, 7], [40, 8, 10], [52, 11, 7], [63, 9, 9], [75, 11, 8], [86, 9, 9], [97, 12, 7]], 16, 0, 420, { base: 'px-bank', light: 'px-bank', shade: 'px-bank-shade' }, 22);

// Far hills, then the castle hill and near hills.
const hills = layer();
paintBlob(hills, [[8, 14, 12], [30, 16, 13], [43, 15, 12], [55, 15, 12], [78, 13, 14]], 20, -40, GROUND - 280, { base: 'px-hill-far', light: 'px-hill-far-light' }, 14);
paintBlob(hills, [[73, 12, 11]], 20, -40, GROUND - 240, { base: 'px-hill', light: 'px-hill-light' }, 12);
paintBlob(hills, [[6, 8, 8]], 20, -40, GROUND - 160, { base: 'px-hill', light: 'px-hill-light' }, 8);

// Castle on the right hill, built from stone blocks, red cone roofs and flags.
const castle = layer();
const CX = 1360;
const CB = 590;
function tower(x, w, top, roof) {
  castle.rect('px-stone', x, top, w, CB - top);
  castle.rect('px-stone-dark', x + w - 8, top, 8, CB - top);
  for (let y = top + 16; y < CB; y += 16) castle.rect('px-stone-dark', x, y, w, 2);
  if (roof) {
    const rows = w / 8 + 2;
    for (let i = 0; i < rows; i++) {
      const rw = Math.max(8, Math.round(((w + 16) * (rows - i)) / rows / 8) * 8);
      const rx = x + w / 2 - rw / 2;
      castle.rect('px-roof', rx, top - (i + 1) * 8, rw / 2, 8);
      castle.rect('px-roof-dark', rx + rw / 2, top - (i + 1) * 8, rw / 2, 8);
    }
    const tip = top - rows * 8;
    castle.rect('px-stone-dark', x + w / 2 - 2, tip - 28, 4, 28);
    castle.rect('px-flag', x + w / 2 + 2, tip - 28, 20, 12);
  } else {
    for (let mx = x; mx < x + w; mx += 16) castle.rect('px-stone', mx, top - 8, 8, 8);
  }
  castle.rect('px-window', x + w / 2 - 4, top + 24, 8, 14);
}
tower(CX + 48, 120, CB - 140, false);
tower(CX + 88, 40, CB - 200, true);
tower(CX, 48, CB - 180, true);
tower(CX + 168, 48, CB - 160, true);
castle.rect('px-window', CX + 96, CB - 44, 24, 44);
castle.rect('px-window', CX + 100, CB - 50, 16, 6);

// Round trees and bushes along the hills.
const trees = layer();
for (const [x, base, r] of [[1290, 640, 3.5], [1560, 630, 3], [1450, 660, 2.5], [40, 680, 3], [250, 700, 2.5], [1180, 730, 3]]) {
  trees.rect('px-trunk', x - 6, base - 10, 12, GROUND - base + 10);
  paintBlob(trees, [[0, -r * 1.4, r], [-r * 0.6, -r * 0.8, r * 0.8], [r * 0.6, -r * 0.8, r * 0.8]], 12, x, base, { base: 'px-tree', light: 'px-tree-light', shade: 'px-tree-dark' });
}

// Ground: grass with a ragged fringe over dirt blocks; a floating platform.
const ground = layer();
function grassBlock(x, y, w, h) {
  ground.rect('px-dirt', x, y, w, h);
  for (let bx = x; bx < x + w; bx += 48) {
    for (let by = y; by < y + h; by += 48) {
      ground.rect('px-dirt-light', bx, by, 44, 4);
      ground.rect('px-dirt-light', bx, by, 4, 44);
      ground.rect('px-dirt-dark', bx + 44, by, 4, 48);
      ground.rect('px-dirt-dark', bx, by + 44, 48, 4);
    }
  }
  ground.rect('px-grass', x, y - 4, w, 20);
  ground.rect('px-grass-light', x, y - 4, w, 6);
  for (let gx = x; gx < x + w; gx += 16) ground.rect('px-grass', gx, y + 16, 8, 4 + ((gx / 16) % 3) * 6);
  ground.rect('px-ink', x, y - 8, w, 4);
}
grassBlock(0, GROUND, W, 112);
grassBlock(40, 520, 192, 48);

// Gold blocks stacked on the ground beside the board.
for (const [x, y] of [[1300, GROUND - 48], [1348, GROUND - 48], [1300, GROUND - 96]]) {
  ground.rect('px-ink', x, y, 48, 48);
  ground.rect('px-gold', x + 4, y + 4, 40, 40);
  ground.rect('px-gold-light', x + 4, y + 4, 40, 4);
  ground.rect('px-gold-light', x + 4, y + 4, 4, 40);
  ground.rect('px-gold-dark', x + 4, y + 40, 40, 4);
  ground.rect('px-gold-dark', x + 40, y + 4, 4, 40);
}

// Mushroom on the ground.
const mushroom = layer();
mushroom.rect('px-stem', 1504, GROUND - 32, 32, 32);
mushroom.rect('px-ink', 1512, GROUND - 22, 4, 8);
mushroom.rect('px-ink', 1524, GROUND - 22, 4, 8);
paintBlob(mushroom, [[0, 0, 5]], 8, 1520, GROUND - 30, { base: 'px-cap', shade: 'px-cap-dark' }, 1);
mushroom.rect('px-spot', 1496, GROUND - 58, 10, 10);
mushroom.rect('px-spot', 1522, GROUND - 66, 12, 10);
mushroom.rect('px-spot', 1538, GROUND - 48, 8, 8);

// Spinning coins: [x, y]. Each is its own sprite so it can spin in place.
const coins = [[70, 470], [124, 470], [178, 470], [130, 740], [180, 740], [1324, 640], [1440, 720]].map(([x, y], i) => ({
  x, y, delay: `${(-i * 0.15).toFixed(2)}s`,
}));
const sparkles = [[230, 735], [1380, 630]];
</script>

<template>
  <svg class="stage stage-stage" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path v-for="(d, cls) in sky.paths" :key="cls" :d="d" :class="cls" />
    <path v-for="(d, cls) in sun.paths" :key="cls" :d="d" :class="cls" />
    <g v-for="(c, i) in clouds" :key="`c${i}`" class="px-cloud-drift" :style="c.style">
      <g :transform="`translate(${c.x} ${c.y})`">
        <path v-for="(d, cls) in c.paths" :key="cls" :d="d" :class="cls" />
      </g>
    </g>
    <path v-for="(d, cls) in bank.paths" :key="cls" :d="d" :class="cls" />
    <path v-for="(d, cls) in hills.paths" :key="cls" :d="d" :class="cls" />
    <path v-for="(d, cls) in castle.paths" :key="cls" :d="d" :class="cls" />
    <path v-for="(d, cls) in trees.paths" :key="cls" :d="d" :class="cls" />
    <path v-for="(d, cls) in ground.paths" :key="cls" :d="d" :class="cls" />
    <path v-for="(d, cls) in mushroom.paths" :key="cls" :d="d" :class="cls" />

    <g v-for="(c, i) in coins" :key="`k${i}`" :transform="`translate(${c.x} ${c.y})`">
      <g class="px-coin" :style="{ animationDelay: c.delay }">
        <rect x="4" y="0" width="20" height="36" class="px-gold-dark" />
        <rect x="0" y="4" width="28" height="28" class="px-gold-dark" />
        <rect x="4" y="4" width="20" height="28" class="px-gold" />
        <rect x="8" y="8" width="4" height="20" class="px-gold-light" />
        <rect x="14" y="8" width="6" height="20" class="px-gold-dark" />
      </g>
    </g>
    <g v-for="([x, y], i) in sparkles" :key="`s${i}`" class="px-sparkle" :style="{ animationDelay: `${-i * 0.7}s` }" :transform="`translate(${x} ${y})`">
      <rect x="-2" y="-10" width="4" height="20" class="px-sun-core" />
      <rect x="-10" y="-2" width="20" height="4" class="px-sun-core" />
    </g>

    <g transform="translate(70 748)">
      <g class="px-slime">
        <rect x="8" y="0" width="40" height="8" class="px-slime-dark" />
        <rect x="0" y="8" width="56" height="44" class="px-slime-dark" />
        <rect x="4" y="8" width="48" height="40" class="px-slime" />
        <rect x="12" y="12" width="12" height="6" class="px-slime-light" />
        <rect x="18" y="22" width="6" height="10" class="px-ink" />
        <rect x="34" y="22" width="6" height="10" class="px-ink" />
        <rect x="22" y="38" width="14" height="4" class="px-ink" />
      </g>
    </g>
  </svg>
</template>
