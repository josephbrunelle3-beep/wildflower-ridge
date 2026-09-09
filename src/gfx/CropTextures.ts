import Phaser from 'phaser';
import { CROPS, CROP_STAGES, type CropDef } from '../config/crops';
import { TEX } from '../config/keys';
import { TILE_SIZE } from '../config/tiles';

/**
 * The garden sheet: tilled soil, four growth stages per crop, withered stalks and the two
 * crates. Drawn at boot in the same hand as `PlaceholderTextures` - one warm near-black
 * outline, a soft ground shadow under anything that stands up - so the plot does not read
 * as a different game pasted into the ranch.
 *
 * Frame layout (16x16 each, one strip):
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

export const FARM_FRAME = {
  SOIL_DRY: 0, SOIL_WET: 1, WITHERED: 2, SEED_CRATE: 3, SHIP_CRATE: 4,
  /** Weeds at level 3: the choking kind. Levels 1 and 2 are the two frames after. */
  WEEDS: 5, PUMP: 6, WILT: 7, WEEDS_1: 8, WEEDS_2: 9, HAND: 10,
} as const;
const FIRST_CROP_FRAME = 11;

/** Map frame for a weed level (1..3). */
export function weedFrame(level: number): number {
  if (level <= 1) return FARM_FRAME.WEEDS_1;
  if (level === 2) return FARM_FRAME.WEEDS_2;
  return FARM_FRAME.WEEDS;
}
const FRAME_COUNT = FIRST_CROP_FRAME + CROPS.length * CROP_STAGES;

/** Frame index for a crop at a given drawn stage (0 = just sown, 3 = ripe). */
export function cropFrame(cropId: string, stage: number): number {
  const i = CROPS.findIndex((c) => c.id === cropId);
  if (i < 0) return FARM_FRAME.WITHERED;
  return FIRST_CROP_FRAME + i * CROP_STAGES + Math.max(0, Math.min(CROP_STAGES - 1, stage));
}

const INK = '#3b2a1c';
const SOIL = {
  dry: '#8a6038',
  dryDark: '#6f4a29',
  dryLight: '#a1734a',
  wet: '#5f4026',
  wetDark: '#4a301c',
  wetLight: '#75512f',
};
const CRATE = { wood: '#7a5231', dark: '#5c3c22', light: '#9a6b42', iron: '#6b6b63' };

const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

function shadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.2) {
  ctx.fillStyle = `rgba(20, 14, 8, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Hoed soil: three furrows so a tilled square reads as worked ground at a glance. */
function soil(ctx: Ctx, wet: boolean) {
  const p = wet
    ? { base: SOIL.wet, dark: SOIL.wetDark, light: SOIL.wetLight }
    : { base: SOIL.dry, dark: SOIL.dryDark, light: SOIL.dryLight };
  rect(ctx, 0, 0, 16, 16, p.base);
  for (const y of [2, 7, 12]) {
    rect(ctx, 1, y, 14, 2, p.dark);
    rect(ctx, 1, y, 14, 1, p.light);
  }
  for (const [x, y] of [[4, 5], [11, 10], [7, 15]]) rect(ctx, x, y, 1, 1, p.dark);
}

/**
 * One crop at one stage, drawn on transparent background so it can sit on either soil
 * frame. Stage 0 is a pair of seed-leaves; the plant gains height and then fruit.
 */
function drawCrop(ctx: Ctx, crop: CropDef, stage: number) {
  const midX = 8;
  if (stage === 0) {
    rect(ctx, midX - 2, 11, 2, 1, crop.leafDark);
    rect(ctx, midX + 1, 11, 2, 1, crop.leafDark);
    rect(ctx, midX, 10, 1, 3, crop.leaf);
    return;
  }

  const height = stage === 1 ? 5 : stage === 2 ? 8 : 10;
  const top = 14 - height;
  shadow(ctx, midX, 14, 4, 1.5, 0.16);
  // Stalk plus paired leaves stepping up it.
  rect(ctx, midX, top, 1, height, crop.leafDark);
  rect(ctx, midX - 1, top, 1, height, crop.leaf);
  for (let i = 0; i < (stage === 1 ? 1 : 2); i++) {
    const ly = 12 - i * 4;
    rect(ctx, midX - 4, ly, 3, 1, crop.leaf);
    rect(ctx, midX + 1, ly - 1, 3, 1, crop.leaf);
    rect(ctx, midX - 4, ly + 1, 2, 1, crop.leafDark);
  }

  if (stage < CROP_STAGES - 1) return;

  // Ripe: fruit either hangs on the stalk or swells at its foot.
  if (crop.fruitAt === 'top') {
    rect(ctx, midX - 2, top + 1, 4, 4, crop.fruit);
    rect(ctx, midX - 2, top + 4, 4, 1, crop.fruitDark);
    rect(ctx, midX - 1, top + 1, 1, 1, '#ffffff55');
    rect(ctx, midX + 2, top + 3, 2, 2, crop.fruit);
    rect(ctx, midX + 2, top + 4, 2, 1, crop.fruitDark);
  } else {
    rect(ctx, midX - 4, 10, 7, 4, crop.fruit);
    rect(ctx, midX - 4, 13, 7, 1, crop.fruitDark);
    rect(ctx, midX - 3, 10, 2, 1, '#ffffff44');
    rect(ctx, midX - 1, 9, 1, 1, crop.leafDark);
  }
  rect(ctx, midX - 1, top - 1, 2, 1, crop.leafDark);
}

/**
 * Weeds, drawn over whatever is planted so a choked square still shows its crop being
 * strangled. Rank and sprawling, in a grey-olive nothing else in the set uses, with broad
 * leaves rather than a crop's neat stalk - the eye should catch these from across the yard.
 */
function weeds(ctx: Ctx) {
  const WEED = '#7d8a3c';
  const WEED_DARK = '#5b662a';
  const WEED_LIGHT = '#9aa84e';
  for (const [x, y, h] of [[2, 8, 7], [5, 5, 9], [9, 6, 8], [13, 9, 6]]) {
    rect(ctx, x, y, 1, h, WEED);
    rect(ctx, x, y, 1, 2, WEED_LIGHT);
    // Broad leaves flopping either side of the stem.
    rect(ctx, x - 2, y + 3, 2, 1, WEED_DARK);
    rect(ctx, x + 1, y + 5, 2, 1, WEED_DARK);
    rect(ctx, x - 1, y + 6, 1, 1, WEED);
  }
  // Seed heads: the giveaway that these are weeds and not a crop.
  for (const [x, y] of [[5, 4], [9, 5], [2, 7]]) {
    rect(ctx, x, y, 1, 1, '#d6cf6a');
    rect(ctx, x - 1, y + 1, 3, 1, '#b8b04e');
  }
}

/**
 * Weeds on the way up. Level 1 is a few sprouts at the edges you could still ignore;
 * level 2 has them leaning in over the crop. Same olive as the grown weeds so they read
 * as the same thing getting worse.
 */
function weedsSmall(ctx: Ctx, level: 1 | 2) {
  const WEED = '#7d8a3c';
  const WEED_DARK = '#5b662a';
  const WEED_LIGHT = '#9aa84e';
  const sprouts: [number, number, number][] = level === 1
    ? [[2, 12, 3], [13, 11, 3], [4, 14, 2]]
    : [[2, 9, 6], [13, 8, 6], [5, 12, 4], [11, 12, 4]];
  for (const [x, y, h] of sprouts) {
    rect(ctx, x, y, 1, h, WEED);
    rect(ctx, x, y, 1, 1, WEED_LIGHT);
    rect(ctx, x - 1, y + 2, 1, 1, WEED_DARK);
    if (level === 2) rect(ctx, x + 1, y + 3, 2, 1, WEED_DARK);
  }
}

/** A pointing hand for the close-up games, big enough to see against soil and leaf. */
function hand(ctx: Ctx) {
  const SKIN = '#f0c8a0';
  const SKIN_DARK = '#c9976c';
  // Palm and fingers, pointing up-left toward the hotspot at (3,3).
  rect(ctx, 5, 6, 6, 7, SKIN);
  rect(ctx, 3, 2, 3, 8, SKIN);           // index finger
  rect(ctx, 3, 2, 3, 1, '#ffe4c8');
  rect(ctx, 7, 5, 2, 3, SKIN);           // knuckles
  rect(ctx, 9, 6, 2, 3, SKIN);
  rect(ctx, 5, 12, 6, 2, SKIN_DARK);     // wrist shadow
  rect(ctx, 10, 6, 1, 7, SKIN_DARK);
  // Outline.
  rect(ctx, 2, 2, 1, 9, INK); rect(ctx, 3, 1, 3, 1, INK); rect(ctx, 6, 2, 1, 4, INK);
  rect(ctx, 6, 5, 5, 1, INK); rect(ctx, 11, 6, 1, 8, INK); rect(ctx, 4, 13, 7, 1, INK);
  rect(ctx, 4, 10, 1, 3, INK);
}

/**
 * The mark of a thirsty square: cracked, sun-baked crust on the soil and a scatter of
 * dropped yellow leaves. The crop itself is tinted sallow by FarmLayer, so the two together
 * read as wilting from a distance.
 */
function wilt(ctx: Ctx) {
  // Cracks in the dried-out soil.
  for (const [x, y, w] of [[1, 4, 5], [8, 6, 6], [3, 11, 4], [10, 13, 5]]) {
    rect(ctx, x, y, w, 1, '#c9a86a');
    rect(ctx, x, y + 1, Math.max(1, w - 3), 1, '#8a6a3c');
  }
  rect(ctx, 6, 2, 1, 3, '#c9a86a');
  // Leaves it has already dropped.
  for (const [x, y] of [[4, 13], [12, 10], [2, 8]]) {
    rect(ctx, x, y, 2, 1, '#c08a3a');
    rect(ctx, x, y + 1, 1, 1, '#96682a');
  }
}

/** The yard pump: cast iron on a stone base, where the bucket gets refilled. */
function pump(ctx: Ctx) {
  shadow(ctx, 8, 15, 5, 2, 0.22);
  rect(ctx, 4, 12, 9, 3, '#8f8b82');
  rect(ctx, 4, 12, 9, 1, '#adaa9f');
  rect(ctx, 7, 4, 3, 9, CRATE.iron);
  rect(ctx, 7, 4, 1, 9, '#8a8a80');
  rect(ctx, 6, 3, 5, 2, CRATE.iron);        // head
  rect(ctx, 10, 5, 3, 1, CRATE.iron);       // spout
  rect(ctx, 3, 5, 4, 1, '#4f4f48');         // handle
  rect(ctx, 3, 4, 1, 2, '#4f4f48');
  rect(ctx, 11, 7, 1, 2, '#5aa3dd');        // a drip, to say what it is for
  rect(ctx, 2, 15, 12, 1, INK);
}

function withered(ctx: Ctx) {
  shadow(ctx, 8, 14, 4, 1.5, 0.14);
  for (const [x, y, h] of [[5, 8, 6], [8, 7, 7], [11, 9, 5]]) {
    rect(ctx, x, y, 1, h, '#8a7a52');
    rect(ctx, x + 1, y + 2, 1, 1, '#6b5d3c');
  }
  rect(ctx, 4, 13, 8, 1, '#6b5d3c');
}

/** A crate, lidded for seed and open-topped for shipping. */
function crate(ctx: Ctx, open: boolean) {
  shadow(ctx, 8, 15, 6, 2, 0.22);
  rect(ctx, 2, 4, 12, 11, CRATE.dark);
  rect(ctx, 3, 5, 10, 9, CRATE.wood);
  rect(ctx, 3, 5, 10, 1, CRATE.light);
  rect(ctx, 3, 9, 10, 1, CRATE.dark);
  rect(ctx, 7, 5, 2, 9, CRATE.dark);
  if (open) {
    // Open mouth with produce showing over the rim.
    rect(ctx, 3, 3, 10, 3, CRATE.dark);
    rect(ctx, 4, 4, 8, 2, '#2b1d12');
    rect(ctx, 5, 3, 3, 2, '#d4402f');
    rect(ctx, 9, 3, 2, 2, '#f0c94a');
  } else {
    rect(ctx, 2, 2, 12, 3, CRATE.light);
    rect(ctx, 2, 4, 12, 1, CRATE.dark);
    rect(ctx, 7, 2, 2, 3, CRATE.iron);
  }
  rect(ctx, 2, 14, 12, 1, INK);
}

function makeFarmSheet(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_SIZE * FRAME_COUNT;
  c.height = TILE_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const at = (i: number, draw: () => void) => {
    ctx.save();
    ctx.translate(i * TILE_SIZE, 0);
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
  for (let i = 0; i < FRAME_COUNT; i++) tex.add(i, 0, i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
}
