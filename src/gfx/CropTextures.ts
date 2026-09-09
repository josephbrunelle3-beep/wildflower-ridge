import Phaser from 'phaser';
import { CROPS, CROP_STAGES, type CropDef } from '../config/crops';
import { TEX } from '../config/keys';
import { TILE_SIZE } from '../config/tiles';

/**
 * The garden sheet: tilled soil, four growth stages per crop, weeds at three sizes,
 * withered stalks, the crates, the pump and the hand. Drawn at boot in the same hand as
 * `PlaceholderTextures` - one warm near-black outline, a soft ground shadow under anything
 * that stands up - so the plot does not read as a different game pasted into the ranch.
 *
 * Frames are a tile wide but a tile and a half tall (16 x 24) and are placed with their
 * bottom on the tile's bottom edge, so a grown corn stalk or a staked tomato rises over
 * the square behind it the way the trees do. The soil line inside the frame is `PLANT_BASE`.
 *
 * Frame layout (one strip):
 *   0  dry tilled soil
 *   1  watered soil
 *   2  withered stalks
 *   3  seed crate
 *   4  shipping crate
 *   5  weeds, fully grown (level 3, choking)
 *   6  the yard pump
 *   7  wilt overlay, laid over a thirsty crop
 *   8  weeds, level 1 (a few sprouts)
 *   9  weeds, level 2 (spreading)
 *  10  the hand cursor for the tending games
 *  11+ crops, four stages each, in CROPS order (see cropFrame)
 */

type Ctx = CanvasRenderingContext2D;

export const FARM_FRAME_W = TILE_SIZE;
export const FARM_FRAME_H = 24;
/** Row just below where a plant's stem meets the soil. Use `PLANT_BASE / FARM_FRAME_H` as an origin. */
export const PLANT_BASE = 22;
/** The tile proper occupies the bottom 16 rows of the frame. */
const TILE_TOP = FARM_FRAME_H - TILE_SIZE;

export const FARM_FRAME = {
  SOIL_DRY: 0, SOIL_WET: 1, WITHERED: 2, SEED_CRATE: 3, SHIP_CRATE: 4,
  /** Weeds at level 3: the choking kind. Levels 1 and 2 are the two frames after. */
  WEEDS: 5, PUMP: 6, WILT: 7, WEEDS_1: 8, WEEDS_2: 9, HAND: 10,
} as const;
const FIRST_CROP_FRAME = 11;
const FRAME_COUNT = FIRST_CROP_FRAME + CROPS.length * CROP_STAGES;

/** Frame index for a crop at a given drawn stage (0 = just sown, 3 = ripe). */
export function cropFrame(cropId: string, stage: number): number {
  const i = CROPS.findIndex((c) => c.id === cropId);
  if (i < 0) return FARM_FRAME.WITHERED;
  return FIRST_CROP_FRAME + i * CROP_STAGES + Math.max(0, Math.min(CROP_STAGES - 1, stage));
}

/** Map frame for a weed level (1..3). */
export function weedFrame(level: number): number {
  if (level <= 1) return FARM_FRAME.WEEDS_1;
  if (level === 2) return FARM_FRAME.WEEDS_2;
  return FARM_FRAME.WEEDS;
}

const INK = '#3b2a1c';
const SOIL = {
  dry: '#8a6038', dryDark: '#6f4a29', dryLight: '#a1734a', dryClod: '#b08658',
  wet: '#5f4026', wetDark: '#4a301c', wetLight: '#75512f', wetSheen: '#7a6650',
};
const CRATE = { wood: '#7a5231', dark: '#5c3c22', light: '#9a6b42', iron: '#6b6b63' };
const CANE = '#8a6a3c';
const CANE_DARK = '#5c4424';

// --- Pixel helpers ------------------------------------------------------------

const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};
const px = (ctx: Ctx, x: number, y: number, color: string) => rect(ctx, x, y, 1, 1, color);

/** One-pixel Bresenham line, so stems and fronds can lean without anti-aliasing. */
function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(ctx, x, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Mix a hex colour toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function shadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.2) {
  ctx.fillStyle = `rgba(20, 14, 8, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- Soil -----------------------------------------------------------------------

/**
 * A raised bed: three ridges running across the square, each with a lit crest and a
 * shadowed furrow, and a scatter of clods. The wet frame is the same ground gone dark,
 * with a couple of pixels of sheen where water is still standing in the furrows.
 */
function soil(ctx: Ctx, wet: boolean) {
  const p = wet
    ? { base: SOIL.wet, dark: SOIL.wetDark, light: SOIL.wetLight, clod: SOIL.wetLight }
    : { base: SOIL.dry, dark: SOIL.dryDark, light: SOIL.dryLight, clod: SOIL.dryClod };
  const T = TILE_TOP;
  rect(ctx, 0, T, 16, 16, p.base);
  for (const y of [T + 1, T + 6, T + 11]) {
    rect(ctx, 0, y, 16, 1, p.light);       // crest catching the light
    rect(ctx, 0, y + 1, 16, 2, p.base);
    rect(ctx, 0, y + 3, 16, 1, p.dark);    // furrow
    rect(ctx, 0, y + 4, 16, 1, shade(p.dark, -0.15));
  }
  for (const [x, y] of [[3, T + 2], [11, T + 7], [7, T + 12], [14, T + 3], [1, T + 9]]) px(ctx, x, y, p.clod);
  for (const [x, y] of [[9, T + 2], [4, T + 8], [13, T + 13]]) px(ctx, x, y, p.dark);
  if (wet) for (const [x, y] of [[5, T + 4], [12, T + 9], [2, T + 14]]) px(ctx, x, y, SOIL.wetSheen);
  // A hair of dark at the tile's edges so a run of squares reads as one bed with sides.
  rect(ctx, 0, T, 1, 16, shade(p.dark, -0.1));
  rect(ctx, 15, T, 1, 16, shade(p.dark, -0.1));
}

// --- Crops ----------------------------------------------------------------------

const MID = 8;
const BASE = PLANT_BASE - 1; // the row the stem stands in

/** Every crop starts the same way: a stem and two seed-leaves. */
function seedling(ctx: Ctx, c: CropDef) {
  const L = c.leaf;
  const D = c.leafDark;
  px(ctx, MID, BASE - 1, D);
  px(ctx, MID, BASE, D);
  rect(ctx, MID - 2, BASE - 2, 2, 1, L);
  rect(ctx, MID + 1, BASE - 2, 2, 1, L);
  px(ctx, MID - 2, BASE - 2, shade(L, 0.3));
}

/** A feathery carrot frond: a leaning stem with fine side-leaflets alternating up it. */
function frond(ctx: Ctx, x1: number, y1: number, c: CropDef) {
  const D = c.leafDark;
  const L = c.leaf;
  const H = shade(L, 0.3);
  line(ctx, MID, BASE, x1, y1, D);
  const steps = BASE - y1;
  for (let i = 2; i < steps; i += 2) {
    const t = i / steps;
    const x = Math.round(MID + (x1 - MID) * t);
    const y = BASE - i;
    const side = i % 4 === 0 ? 1 : -1;
    px(ctx, x + side, y, L);
    px(ctx, x + side * 2, y - 1, H);
  }
}

function carrot(ctx: Ctx, c: CropDef, stage: number) {
  if (stage === 0) return seedling(ctx, c);
  shadow(ctx, MID, BASE + 1, 4, 1.2, 0.16);
  const tips: [number, number][] = stage === 1
    ? [[5, 15], [8, 14], [11, 15]]
    : stage === 2
      ? [[3, 13], [6, 10], [9, 9], [12, 11], [13, 14]]
      : [[2, 12], [5, 9], [8, 8], [11, 9], [14, 12]];
  for (const [x, y] of tips) frond(ctx, x, y, c);
  if (stage === CROP_STAGES - 1) {
    // The shoulder of the root pushing up through the soil, the way a ripe carrot does.
    rect(ctx, MID - 2, BASE - 1, 5, 2, c.fruit);
    rect(ctx, MID - 2, BASE, 5, 1, c.fruitDark);
    px(ctx, MID - 1, BASE - 1, shade(c.fruit, 0.35));
    px(ctx, MID - 3, BASE, SOIL.dryDark);
    px(ctx, MID + 3, BASE, SOIL.dryDark);
  }
}

function timothy(ctx: Ctx, c: CropDef, stage: number) {
  const L = c.leaf;
  const D = c.leafDark;
  const H = shade(L, 0.25);
  if (stage === 0) {
    for (const [x, h] of [[6, 3], [8, 4], [10, 3]]) rect(ctx, x, BASE - h + 1, 1, h, x === 8 ? L : D);
    return;
  }
  shadow(ctx, MID, BASE + 1, 4, 1.2, 0.14);
  const top = stage === 1 ? 15 : stage === 2 ? 10 : 7;
  // A tuft: blades fanning out from the crown, the outer ones arching over.
  const blades: [number, number][] = [[3, top + 4], [5, top + 1], [7, top], [9, top], [11, top + 1], [13, top + 4]];
  blades.forEach(([x, y], i) => {
    line(ctx, MID + (i < 3 ? -1 : 1), BASE, x, y, i % 2 === 0 ? D : L);
    if (i === 1 || i === 4) px(ctx, x, y, H);
  });
  if (stage === CROP_STAGES - 1) {
    // Seed heads: the bottle-brush spikes that say the grass is ready for cutting.
    for (const [x, y] of [[5, top + 1], [8, top - 1], [11, top + 1]]) {
      rect(ctx, x - 1, y - 3, 2, 4, c.fruit);
      px(ctx, x - 1, y - 3, shade(c.fruit, 0.3));
      px(ctx, x, y - 1, c.fruitDark);
      px(ctx, x - 1, y, c.fruitDark);
    }
  }
}

function sweetpea(ctx: Ctx, c: CropDef, stage: number) {
  const L = c.leaf;
  const D = c.leafDark;
  if (stage === 0) return seedling(ctx, c);
  shadow(ctx, MID, BASE + 1, 4, 1.2, 0.14);
  const top = stage === 1 ? 15 : stage === 2 ? 8 : 6;
  // The cane it climbs.
  rect(ctx, MID + 1, top - 2, 1, BASE - top + 3, CANE);
  px(ctx, MID + 1, top - 2, CANE_DARK);
  // The vine twines round it, throwing out paired leaflets and the odd curling tendril.
  for (let y = BASE; y >= top; y--) {
    const k = (BASE - y) % 4;
    const x = k < 2 ? MID : MID + 2;
    px(ctx, x, y, k === 0 || k === 2 ? D : L);
    if (k === 1) {
      rect(ctx, x - 2, y, 2, 1, L);
      px(ctx, x - 2, y - 1, shade(L, 0.25));
    }
    if (k === 3) {
      rect(ctx, x + 1, y, 2, 1, L);
      if ((BASE - y) % 8 === 3) { px(ctx, x + 3, y - 1, D); px(ctx, x + 3, y - 2, L); } // tendril
    }
  }
  if (stage === CROP_STAGES - 1) {
    // Blossoms, in twos, up the top of the vine.
    for (const [x, y] of [[MID - 2, top + 1], [MID + 4, top + 4], [MID - 1, top + 6]]) {
      rect(ctx, x, y, 2, 2, c.fruit);
      px(ctx, x + 1, y + 1, c.fruitDark);
      px(ctx, x, y, shade(c.fruit, 0.4));
    }
  }
}

/** A blob of foliage: three pixels wide, two high, lit on the upper-left. */
function leafClump(ctx: Ctx, x: number, y: number, L: string, D: string) {
  rect(ctx, x, y, 3, 2, L);
  px(ctx, x, y, shade(L, 0.25));
  px(ctx, x + 2, y + 1, D);
}

function tomato(ctx: Ctx, c: CropDef, stage: number) {
  const L = c.leaf;
  const D = c.leafDark;
  if (stage === 0) return seedling(ctx, c);
  shadow(ctx, MID, BASE + 1, 5, 1.3, 0.16);
  const top = stage === 1 ? 15 : stage === 2 ? 8 : 6;
  // The stake, and the main stem tied up it.
  rect(ctx, MID + 2, top - 2, 1, BASE - top + 3, CANE);
  px(ctx, MID + 2, top - 2, CANE_DARK);
  rect(ctx, MID, top + 1, 1, BASE - top, D);
  // Foliage, bushier as it grows.
  const clumps: [number, number][] = stage === 1
    ? [[MID - 3, BASE - 3], [MID + 1, BASE - 5]]
    : [[MID - 4, BASE - 3], [MID + 1, BASE - 4], [MID - 3, BASE - 7], [MID + 2, BASE - 8], [MID - 4, BASE - 10], [MID, BASE - 12], [MID - 2, top + 1]];
  for (const [x, y] of clumps) leafClump(ctx, x, y, L, D);
  if (stage === 2) {
    // The little yellow flowers that come before the fruit.
    for (const [x, y] of [[MID - 3, BASE - 8], [MID + 3, BASE - 6]]) px(ctx, x, y, '#f0d060');
  }
  if (stage === CROP_STAGES - 1) {
    // Trusses of fruit hanging among the leaves.
    for (const [x, y] of [[MID - 4, BASE - 6], [MID + 1, BASE - 9], [MID - 1, BASE - 3]]) {
      rect(ctx, x, y, 3, 3, c.fruit);
      rect(ctx, x, y + 2, 3, 1, c.fruitDark);
      px(ctx, x, y, shade(c.fruit, 0.4));
      px(ctx, x + 1, y - 1, D); // calyx
    }
  }
}

function corn(ctx: Ctx, c: CropDef, stage: number) {
  const L = c.leaf;
  const D = c.leafDark;
  if (stage === 0) {
    line(ctx, MID, BASE, MID + 1, BASE - 4, L);
    px(ctx, MID, BASE, D);
    return;
  }
  shadow(ctx, MID, BASE + 1, 4, 1.2, 0.16);
  const top = stage === 1 ? 13 : stage === 2 ? 5 : 1;
  // The stalk: a dark line with a lit edge.
  rect(ctx, MID, top + 2, 1, BASE - top - 1, D);
  rect(ctx, MID - 1, top + 3, 1, BASE - top - 3, L);
  // Long leaves arching out and down from the stalk, alternating sides.
  const leaves = stage === 1 ? 2 : stage === 2 ? 4 : 5;
  for (let i = 0; i < leaves; i++) {
    const y = BASE - 3 - i * 3;
    const side = i % 2 === 0 ? -1 : 1;
    line(ctx, MID, y, MID + side * 4, y - 2, L);
    line(ctx, MID + side * 4, y - 2, MID + side * 7, y + 1, L);
    px(ctx, MID + side * 7, y + 1, D);
    px(ctx, MID + side * 2, y - 1, shade(L, 0.3));
  }
  if (stage >= 2) {
    // The tassel on top.
    for (const [x, y] of [[MID, top], [MID - 1, top + 1], [MID + 1, top + 1], [MID - 2, top + 2], [MID + 2, top + 2]]) px(ctx, x, y, stage === 2 ? shade(L, 0.4) : '#e8d88a');
  }
  if (stage === CROP_STAGES - 1) {
    // The ear: husk on the stalk with the kernels showing through the split, silk on top.
    rect(ctx, MID + 1, BASE - 9, 3, 6, D);
    rect(ctx, MID + 2, BASE - 8, 1, 4, c.fruit);
    px(ctx, MID + 2, BASE - 8, shade(c.fruit, 0.35));
    px(ctx, MID + 3, BASE - 10, '#d8b070');
    px(ctx, MID + 4, BASE - 11, '#d8b070');
  }
}

function pumpkin(ctx: Ctx, c: CropDef, stage: number) {
  const L = c.leaf;
  const D = c.leafDark;
  if (stage === 0) {
    seedling(ctx, c);
    rect(ctx, MID - 3, BASE - 2, 3, 1, L); // fat seed-leaves
    rect(ctx, MID + 1, BASE - 2, 3, 1, L);
    return;
  }
  shadow(ctx, MID, BASE + 1, 6, 1.3, 0.14);
  // The vine runs along the ground both ways, throwing up big lobed leaves.
  const reach = stage === 1 ? 3 : 6;
  line(ctx, MID, BASE, MID - reach, BASE - 2, D);
  line(ctx, MID, BASE, MID + reach, BASE - 1, D);
  const big = (x: number, y: number) => {
    rect(ctx, x, y, 4, 3, L);
    px(ctx, x, y, shade(L, 0.3));
    px(ctx, x + 3, y, shade(L, 0.3));
    px(ctx, x + 1, y + 1, D);
    px(ctx, x + 1, y + 3, D); // the stalk that holds the leaf up
  };
  const leaves: [number, number][] = stage === 1
    ? [[MID - 5, BASE - 6], [MID + 2, BASE - 5]]
    : [[MID - 7, BASE - 6], [MID - 2, BASE - 9], [MID + 3, BASE - 6], [MID + 5, BASE - 10]];
  for (const [x, y] of leaves) big(x, y);
  if (stage === 2) {
    // The big yellow trumpet flower.
    rect(ctx, MID - 1, BASE - 4, 2, 2, '#f0c040');
    px(ctx, MID - 1, BASE - 4, '#fff0a0');
  }
  if (stage === CROP_STAGES - 1) {
    // The pumpkin itself, sitting on the ground with its ribs and a curl of stem.
    rect(ctx, MID - 3, BASE - 4, 7, 5, c.fruit);
    rect(ctx, MID - 3, BASE - 4, 7, 1, c.fruitDark);
    rect(ctx, MID - 3, BASE, 7, 1, c.fruitDark);
    px(ctx, MID - 3, BASE - 4, c.fruit);
    px(ctx, MID + 3, BASE - 4, c.fruit);
    for (const x of [MID - 1, MID + 1]) rect(ctx, x, BASE - 3, 1, 3, c.fruitDark);
    px(ctx, MID - 2, BASE - 3, shade(c.fruit, 0.4));
    px(ctx, MID, BASE - 5, D);
    px(ctx, MID + 1, BASE - 6, D);
  }
}

const CROP_ART: Record<string, (ctx: Ctx, c: CropDef, stage: number) => void> = {
  carrot, timothy, sweetpea, tomato, corn, pumpkin,
};

/** A crop nobody has drawn yet falls back to a plain stalk so the game still runs. */
function genericCrop(ctx: Ctx, c: CropDef, stage: number) {
  if (stage === 0) return seedling(ctx, c);
  const top = BASE - 4 - stage * 3;
  rect(ctx, MID, top, 1, BASE - top + 1, c.leafDark);
  for (let y = BASE - 2; y > top; y -= 3) { rect(ctx, MID - 3, y, 3, 1, c.leaf); rect(ctx, MID + 1, y - 1, 3, 1, c.leaf); }
  if (stage === CROP_STAGES - 1) rect(ctx, MID - 1, top + 1, 3, 3, c.fruit);
}

function drawCrop(ctx: Ctx, crop: CropDef, stage: number) {
  (CROP_ART[crop.id] ?? genericCrop)(ctx, crop, stage);
}

// --- Everything else ------------------------------------------------------------

/**
 * Weeds, drawn over whatever is planted so a choked square still shows its crop being
 * strangled. Rank and sprawling, in a grey-olive nothing else in the set uses, with broad
 * leaves rather than a crop's neat stalk - the eye should catch these from across the yard.
 */
function weeds(ctx: Ctx) {
  const WEED = '#7d8a3c';
  const WEED_DARK = '#5b662a';
  const WEED_LIGHT = '#9aa84e';
  const T = TILE_TOP;
  for (const [x, y, h] of [[2, T + 8, 7], [5, T + 5, 9], [9, T + 6, 8], [13, T + 9, 6]]) {
    rect(ctx, x, y, 1, h, WEED);
    rect(ctx, x, y, 1, 2, WEED_LIGHT);
    rect(ctx, x - 2, y + 3, 2, 1, WEED_DARK);
    rect(ctx, x + 1, y + 5, 2, 1, WEED_DARK);
    px(ctx, x - 1, y + 6, WEED);
  }
  for (const [x, y] of [[5, T + 4], [9, T + 5], [2, T + 7]]) {
    px(ctx, x, y, '#d6cf6a');
    rect(ctx, x - 1, y + 1, 3, 1, '#b8b04e');
  }
}

/** Weeds on the way up: a few sprouts at the edges, then leaning in over the crop. */
function weedsSmall(ctx: Ctx, level: 1 | 2) {
  const WEED = '#7d8a3c';
  const WEED_DARK = '#5b662a';
  const WEED_LIGHT = '#9aa84e';
  const T = TILE_TOP;
  const sprouts: [number, number, number][] = level === 1
    ? [[2, T + 12, 3], [13, T + 11, 3], [4, T + 14, 2]]
    : [[2, T + 9, 6], [13, T + 8, 6], [5, T + 12, 4], [11, T + 12, 4]];
  for (const [x, y, h] of sprouts) {
    rect(ctx, x, y, 1, h, WEED);
    px(ctx, x, y, WEED_LIGHT);
    px(ctx, x - 1, y + 2, WEED_DARK);
    if (level === 2) rect(ctx, x + 1, y + 3, 2, 1, WEED_DARK);
  }
}

/** A pointing hand for the close-up games, big enough to see against soil and leaf. */
function hand(ctx: Ctx) {
  const SKIN = '#f0c8a0';
  const SKIN_DARK = '#c9976c';
  const T = TILE_TOP;
  rect(ctx, 5, T + 6, 6, 7, SKIN);
  rect(ctx, 3, T + 2, 3, 8, SKIN);
  rect(ctx, 3, T + 2, 3, 1, '#ffe4c8');
  rect(ctx, 7, T + 5, 2, 3, SKIN);
  rect(ctx, 9, T + 6, 2, 3, SKIN);
  rect(ctx, 5, T + 12, 6, 2, SKIN_DARK);
  rect(ctx, 10, T + 6, 1, 7, SKIN_DARK);
  rect(ctx, 2, T + 2, 1, 9, INK); rect(ctx, 3, T + 1, 3, 1, INK); rect(ctx, 6, T + 2, 1, 4, INK);
  rect(ctx, 6, T + 5, 5, 1, INK); rect(ctx, 11, T + 6, 1, 8, INK); rect(ctx, 4, T + 13, 7, 1, INK);
  rect(ctx, 4, T + 10, 1, 3, INK);
}

/** The mark of a thirsty square: cracked crust on the soil and a scatter of dropped leaves. */
function wilt(ctx: Ctx) {
  const T = TILE_TOP;
  for (const [x, y, w] of [[1, T + 4, 5], [8, T + 6, 6], [3, T + 11, 4], [10, T + 13, 5]]) {
    rect(ctx, x, y, w, 1, '#c9a86a');
    rect(ctx, x, y + 1, Math.max(1, w - 3), 1, '#8a6a3c');
  }
  rect(ctx, 6, T + 2, 1, 3, '#c9a86a');
  for (const [x, y] of [[4, T + 13], [12, T + 10], [2, T + 8]]) {
    rect(ctx, x, y, 2, 1, '#c08a3a');
    px(ctx, x, y + 1, '#96682a');
  }
}

function withered(ctx: Ctx) {
  shadow(ctx, MID, BASE + 1, 4, 1.2, 0.14);
  for (const [x, y, h] of [[5, BASE - 6, 6], [8, BASE - 8, 8], [11, BASE - 5, 5]]) {
    rect(ctx, x, y, 1, h, '#8a7a52');
    px(ctx, x + 1, y + 2, '#6b5d3c');
    px(ctx, x - 1, y, '#a08c60'); // a dead leaf hanging
  }
  rect(ctx, 4, BASE, 8, 1, '#6b5d3c');
}

/** A crate, lidded for seed and open-topped for shipping. */
function crate(ctx: Ctx, open: boolean) {
  const T = TILE_TOP;
  shadow(ctx, 8, T + 15, 6, 2, 0.22);
  rect(ctx, 2, T + 4, 12, 11, CRATE.dark);
  rect(ctx, 3, T + 5, 10, 9, CRATE.wood);
  rect(ctx, 3, T + 5, 10, 1, CRATE.light);
  rect(ctx, 3, T + 9, 10, 1, CRATE.dark);
  rect(ctx, 7, T + 5, 2, 9, CRATE.dark);
  if (open) {
    rect(ctx, 3, T + 3, 10, 3, CRATE.dark);
    rect(ctx, 4, T + 4, 8, 2, '#2b1d12');
    rect(ctx, 5, T + 3, 3, 2, '#d4402f');
    rect(ctx, 9, T + 3, 2, 2, '#f0c94a');
  } else {
    rect(ctx, 2, T + 2, 12, 3, CRATE.light);
    rect(ctx, 2, T + 4, 12, 1, CRATE.dark);
    rect(ctx, 7, T + 2, 2, 3, CRATE.iron);
  }
  rect(ctx, 2, T + 14, 12, 1, INK);
}

/** The yard pump: cast iron on a stone base, where the bucket gets refilled. */
function pump(ctx: Ctx) {
  const T = TILE_TOP;
  shadow(ctx, 8, T + 15, 5, 2, 0.22);
  rect(ctx, 4, T + 12, 9, 3, '#8f8b82');
  rect(ctx, 4, T + 12, 9, 1, '#adaa9f');
  rect(ctx, 7, T + 4, 3, 9, CRATE.iron);
  rect(ctx, 7, T + 4, 1, 9, '#8a8a80');
  rect(ctx, 6, T + 3, 5, 2, CRATE.iron);
  rect(ctx, 10, T + 5, 3, 1, CRATE.iron);
  rect(ctx, 3, T + 5, 4, 1, '#4f4f48');
  rect(ctx, 3, T + 4, 1, 2, '#4f4f48');
  rect(ctx, 11, T + 7, 1, 2, '#5aa3dd');
  rect(ctx, 2, T + 15, 12, 1, INK);
}

function makeFarmSheet(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FARM_FRAME_W * FRAME_COUNT;
  c.height = FARM_FRAME_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const at = (i: number, draw: () => void) => {
    ctx.save();
    ctx.translate(i * FARM_FRAME_W, 0);
    draw();
    ctx.restore();
  };

  at(FARM_FRAME.SOIL_DRY, () => soil(ctx, false));
  at(FARM_FRAME.SOIL_WET, () => soil(ctx, true));
  at(FARM_FRAME.WITHERED, () => withered(ctx));
  at(FARM_FRAME.SEED_CRATE, () => crate(ctx, false));
  at(FARM_FRAME.SHIP_CRATE, () => crate(ctx, true));
  at(FARM_FRAME.WEEDS, () => weeds(ctx));
  at(FARM_FRAME.PUMP, () => pump(ctx));
  at(FARM_FRAME.WILT, () => wilt(ctx));
  at(FARM_FRAME.WEEDS_1, () => weedsSmall(ctx, 1));
  at(FARM_FRAME.WEEDS_2, () => weedsSmall(ctx, 2));
  at(FARM_FRAME.HAND, () => hand(ctx));
  CROPS.forEach((crop) => {
    for (let stage = 0; stage < CROP_STAGES; stage++) {
      at(cropFrame(crop.id, stage), () => drawCrop(ctx, crop, stage));
    }
  });
  return c;
}

/** Registers the farm sheet. A real art pack can be loaded under the same key instead. */
export function generateFarmTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.FARM)) return;
  const canvas = makeFarmSheet();
  const tex = scene.textures.addCanvas(TEX.FARM, canvas)!;
  for (let i = 0; i < FRAME_COUNT; i++) tex.add(i, 0, i * FARM_FRAME_W, 0, FARM_FRAME_W, FARM_FRAME_H);
}
