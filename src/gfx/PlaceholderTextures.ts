import Phaser from 'phaser';
import { TEX } from '../config/keys';
import { TILE, TILE_COUNT, TILE_SIZE } from '../config/tiles';
import type { Facing } from '../state/GameState';

/**
 * Draws the tiles, people and hotbar icons onto canvases at boot. The horses are real
 * art (see CREDITS.md); everything here is original to the project.
 *
 * Style brief: the chunky readability of a 16-bit farm sim, but its own palette - a
 * sun-warmed high-country ranch. Sage and olive greens rather than candy green, ochre
 * clay paths, cool teal water, and one warm near-black used for every outline so the
 * whole set reads as a single hand. Tall objects sit on a soft ground shadow, which is
 * what stops a top-down scene looking like flat wallpaper.
 */

type Ctx = CanvasRenderingContext2D;

export const DIRS: Facing[] = ['down', 'left', 'right', 'up'];
export const PERSON_COLS = 3; // stand, step A, step B
/**
 * People are drawn two tiles tall (16x32), matching the proportions of onfe's horse
 * art: its rider is ~32px, so a one-tile player would stand half the height of the
 * same character once mounted.
 */
export const PERSON_W = 16;
export const PERSON_H = 32;

export const personIdleFrame = (f: Facing) => DIRS.indexOf(f) * PERSON_COLS;

/** One warm near-black for every outline in the set. */
const INK = '#3b2a1c';

const PAL = {
  grass: '#6a9c4a',
  grassDark: '#56833c',
  grassLight: '#7fb35a',
  // Close to the base green on purpose: any wider gap and the two variants read as a chequerboard.
  grassSun: '#6fa04d',
  clay: '#b58757',
  clayDark: '#9a6f45',
  clayLight: '#c79a6a',
  pebble: '#8a6440',
  waterDeep: '#2f6fa8',
  waterMid: '#3d86c4',
  waterLight: '#5aa3dd',
  foam: '#a8d6f0',
  wood: '#7a5231',
  woodDark: '#5c3c22',
  woodLight: '#9a6b42',
  leafDark: '#2f5f34',
  leafMid: '#3e7a3f',
  leafLight: '#55954c',
  barn: '#a8392b',
  barnDark: '#8a2c21',
  barnLight: '#c0503a',
  wall: '#d9c096',
  wallDark: '#bda379',
  roof: '#7d5334',
  roofDark: '#63401f',
  roofLight: '#9a6b42',
  hay: '#d4ad4a',
  hayDark: '#ab8a33',
  stone: '#8f8b82',
  stoneDark: '#6f6b62',
  stoneLight: '#adaa9f',
};

interface PersonPalette { hat: string; hair: string; skin: string; shirt: string; pants: string; boots: string }
export const PLAYER_PALETTE: PersonPalette = { hat: '#8a5a2b', hair: '#4a2a12', skin: '#f0c8a0', shirt: '#3f6fb5', pants: '#5a4030', boots: '#3a2414' };
export const JASPER_PALETTE: PersonPalette = { hat: '#4a4a4a', hair: '#2a2a2a', skin: '#e6b98a', shirt: '#3f7f3a', pants: '#4a3a2a', boots: '#2a1a10' };

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

function addSheet(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, fw: number, fh: number): void {
  const tex = scene.textures.addCanvas(key, canvas)!;
  const cols = Math.floor(canvas.width / fw);
  const rows = Math.floor(canvas.height / fh);
  let i = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tex.add(i++, 0, c * fw, r * fh, fw, fh);
}

/** The horse sheets are real art loaded in BootScene; everything else is drawn here. */
export function generatePlaceholders(scene: Phaser.Scene): void {
  const t = scene.textures;
  if (!t.exists(TEX.TILES)) t.addCanvas(TEX.TILES, makeTiles());
  if (!t.exists(TEX.PLAYER)) addSheet(scene, TEX.PLAYER, makePersonSheet(PLAYER_PALETTE), PERSON_W, PERSON_H);
  if (!t.exists(TEX.NPC_JASPER)) addSheet(scene, TEX.NPC_JASPER, makePersonSheet(JASPER_PALETTE), PERSON_W, PERSON_H);
  if (!t.exists(TEX.ICONS)) addSheet(scene, TEX.ICONS, makeIcons(), 16, 16);
}

// ---------------------------------------------------------------------------
// Tiles: one 16x16 tile per index, laid out in a strip.
// ---------------------------------------------------------------------------
function makeTiles(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE_SIZE * TILE_COUNT, TILE_SIZE);
  for (let i = 0; i < TILE_COUNT; i++) {
    ctx.save();
    ctx.translate(i * TILE_SIZE, 0);
    drawTile(ctx, i);
    ctx.restore();
  }
  return c;
}

/** Soft ground shadow, the main trick that stops tall objects looking pasted on. */
function shadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.2) {
  ctx.fillStyle = `rgba(20, 14, 8, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Grass in two sun levels. Deliberately almost flat: any shape big enough to notice
 * repeats on every tile and turns a lawn into visible patchwork, so the variety comes
 * from scattered single blades plus the separate flower and alt-grass tiles.
 */
function grass(ctx: Ctx, sun = false) {
  rect(ctx, 0, 0, 16, 16, sun ? PAL.grassSun : PAL.grass);
  // Blades: a short vertical pair reads as a tuft at this size. Kept sparse and
  // asymmetric so the eye does not pick out a grid.
  const blades: [number, number][] = sun
    ? [[2, 11], [12, 4], [7, 14]]
    : [[4, 6], [11, 12], [14, 2], [1, 9]];
  for (const [x, y] of blades) {
    rect(ctx, x, y, 1, 2, PAL.grassDark);
    rect(ctx, x + 1, y + 1, 1, 1, PAL.grassLight);
  }
}

function drawTile(ctx: Ctx, i: number) {
  const P = (x: number, y: number, w: number, h: number, col: string) => rect(ctx, x, y, w, h, col);
  switch (i) {
    case TILE.GRASS: grass(ctx); break;
    case TILE.GRASS_ALT: grass(ctx, true); break;

    case TILE.DIRT: {
      P(0, 0, 16, 16, PAL.clay);
      // Cart ruts plus scattered grit; keeps long paths from reading as flat colour.
      ctx.globalAlpha = 0.5;
      P(0, 4, 16, 2, PAL.clayDark);
      P(0, 11, 16, 1, PAL.clayDark);
      ctx.globalAlpha = 1;
      for (const [x, y] of [[3, 2], [11, 7], [6, 13], [14, 9]]) P(x, y, 2, 1, PAL.clayLight);
      for (const [x, y] of [[8, 3], [2, 9], [13, 14]]) P(x, y, 1, 1, PAL.pebble);
      break;
    }

    case TILE.WATER: {
      P(0, 0, 16, 16, PAL.waterMid);
      P(0, 0, 16, 5, PAL.waterDeep);
      P(0, 12, 16, 4, PAL.waterDeep);
      // Ripple highlights, offset so neighbouring tiles do not line up.
      P(2, 7, 5, 1, PAL.waterLight);
      P(9, 9, 4, 1, PAL.waterLight);
      P(11, 6, 3, 1, PAL.foam);
      P(4, 10, 2, 1, PAL.foam);
      break;
    }

    case TILE.FENCE_H: {
      grass(ctx);
      shadow(ctx, 8, 14, 7, 2);
      P(0, 5, 16, 2, PAL.wood); P(0, 5, 16, 1, PAL.woodLight);
      P(0, 9, 16, 2, PAL.wood); P(0, 9, 16, 1, PAL.woodLight);
      P(7, 2, 3, 12, PAL.woodDark); P(7, 2, 1, 12, PAL.wood); P(7, 2, 3, 1, PAL.woodLight);
      break;
    }

    case TILE.FENCE_V: {
      grass(ctx);
      shadow(ctx, 9, 14, 5, 2);
      P(6, 0, 3, 16, PAL.wood); P(6, 0, 1, 16, PAL.woodLight); P(8, 0, 1, 16, PAL.woodDark);
      P(4, 3, 8, 2, PAL.woodDark); P(4, 11, 8, 2, PAL.woodDark);
      break;
    }

    case TILE.FENCE_POST: {
      grass(ctx);
      shadow(ctx, 9, 14, 5, 2);
      P(5, 1, 5, 13, PAL.wood);
      P(5, 1, 1, 13, PAL.woodLight);
      P(9, 1, 1, 13, PAL.woodDark);
      P(5, 1, 5, 1, PAL.woodLight);
      P(6, 5, 3, 1, PAL.woodDark); // grain
      break;
    }

    case TILE.TREE: {
      grass(ctx);
      shadow(ctx, 8, 14, 6, 2.5, 0.25);
      P(7, 10, 3, 5, PAL.woodDark); P(7, 10, 1, 5, PAL.wood);
      // Layered canopy: dark base, mid body, sunlit cap.
      ctx.fillStyle = PAL.leafDark; ctx.beginPath(); ctx.ellipse(8, 7, 7.5, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.leafMid; ctx.beginPath(); ctx.ellipse(8, 6.5, 6, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.leafLight; ctx.beginPath(); ctx.ellipse(6, 4.5, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }

    case TILE.BARN_WALL: {
      P(0, 0, 16, 16, PAL.barn);
      P(0, 0, 16, 1, PAL.barnLight);
      for (const y of [5, 11]) P(0, y, 16, 1, PAL.barnDark);
      for (const x of [4, 11]) P(x, 0, 1, 16, PAL.barnDark);
      P(1, 2, 2, 1, PAL.barnLight);
      break;
    }

    case TILE.BARN_ROOF: {
      P(0, 0, 16, 16, PAL.roof);
      // Shingle courses, offset row to row.
      for (const y of [0, 5, 10, 15]) P(0, y, 16, 1, PAL.roofDark);
      for (const [y, off] of [[1, 0], [6, 4], [11, 2]] as [number, number][]) {
        for (let x = off; x < 16; x += 8) P(x, y, 1, 4, PAL.roofDark);
      }
      P(0, 1, 16, 1, PAL.roofLight);
      break;
    }

    case TILE.HOUSE_WALL: {
      P(0, 0, 16, 16, PAL.wall);
      for (const y of [5, 11]) { P(0, y, 16, 1, PAL.wallDark); P(0, y + 1, 16, 1, '#e6d0a8'); }
      P(3, 2, 1, 2, PAL.wallDark);
      break;
    }

    case TILE.HOUSE_ROOF: {
      P(0, 0, 16, 16, PAL.roof);
      for (const y of [0, 6, 12]) P(0, y, 16, 1, PAL.roofDark);
      for (const [y, off] of [[1, 2], [7, 6], [13, 0]] as [number, number][]) {
        for (let x = off; x < 16; x += 8) P(x, y, 1, 5, PAL.roofDark);
      }
      P(0, 1, 16, 1, PAL.roofLight);
      break;
    }

    case TILE.HAY: {
      grass(ctx);
      shadow(ctx, 8, 14, 7, 2);
      P(1, 3, 14, 11, PAL.hayDark);
      P(2, 4, 12, 9, PAL.hay);
      // Straw ends and the two binding cords.
      for (const [x, y] of [[3, 6], [7, 5], [10, 9], [5, 11], [12, 7]]) P(x, y, 2, 1, PAL.hayDark);
      P(5, 4, 1, 9, PAL.hayDark); P(10, 4, 1, 9, PAL.hayDark);
      P(2, 3, 12, 1, '#e8c96a');
      break;
    }

    case TILE.TROUGH: {
      grass(ctx);
      shadow(ctx, 8, 14, 7, 2);
      P(1, 4, 14, 10, PAL.woodDark);
      P(1, 4, 14, 1, PAL.woodLight);
      P(3, 6, 10, 6, PAL.waterMid);
      P(3, 6, 10, 1, PAL.waterDeep);
      P(4, 8, 3, 1, PAL.waterLight);
      break;
    }

    case TILE.FLOWERS: {
      grass(ctx);
      // Three species, the signature scatter of the ranch.
      const bloom = (x: number, y: number, c: string) => {
        P(x, y + 2, 1, 2, PAL.grassDark);
        P(x - 1, y, 3, 2, c);
        P(x, y, 1, 1, '#fff6d8');
      };
      bloom(4, 4, '#e0596f');
      bloom(11, 8, '#f0cf52');
      bloom(7, 12, '#f2f0e4');
      bloom(13, 3, '#b872d8');
      break;
    }

    case TILE.SIGN: {
      grass(ctx);
      shadow(ctx, 8, 15, 5, 1.5);
      P(7, 8, 2, 7, PAL.woodDark);
      P(2, 2, 12, 7, PAL.wood);
      P(2, 2, 12, 1, PAL.woodLight);
      P(2, 8, 12, 1, PAL.woodDark);
      P(4, 4, 8, 1, PAL.woodDark);
      P(4, 6, 5, 1, PAL.woodDark);
      break;
    }

    case TILE.BARN_DOOR: {
      P(0, 0, 16, 16, PAL.woodDark);
      P(0, 0, 16, 1, PAL.wood);
      // Cross-braced barn door.
      for (let k = 1; k < 15; k++) { P(k, k, 1, 1, PAL.wood); P(15 - k, k, 1, 1, PAL.wood); }
      P(0, 0, 1, 16, INK); P(15, 0, 1, 16, INK);
      P(0, 7, 16, 1, PAL.wood);
      break;
    }

    case TILE.HOUSE_DOOR: {
      P(0, 0, 16, 16, PAL.wall);
      P(3, 1, 10, 15, PAL.woodDark);
      P(4, 2, 8, 14, PAL.wood);
      P(4, 2, 8, 1, PAL.woodLight);
      P(7, 2, 1, 14, PAL.woodDark); // plank seam
      P(10, 9, 2, 2, '#f0cf52'); // handle
      break;
    }

    case TILE.GATE: {
      P(0, 0, 16, 16, PAL.clay);
      ctx.globalAlpha = 0.5; P(0, 4, 16, 2, PAL.clayDark); ctx.globalAlpha = 1;
      // Open gate: a post either side, nothing across the middle.
      P(0, 1, 3, 13, PAL.wood); P(0, 1, 1, 13, PAL.woodLight);
      P(13, 1, 3, 13, PAL.wood); P(13, 1, 1, 13, PAL.woodLight);
      shadow(ctx, 1, 14, 2, 1.5); shadow(ctx, 14, 14, 2, 1.5);
      break;
    }

    case TILE.BUSH: {
      grass(ctx);
      shadow(ctx, 8, 13, 6, 2);
      ctx.fillStyle = PAL.leafDark; ctx.beginPath(); ctx.ellipse(8, 9, 6.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.leafMid; ctx.beginPath(); ctx.ellipse(8, 8.5, 5, 3.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.leafLight; ctx.beginPath(); ctx.ellipse(6, 7, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      // A few berries to break up the mass.
      P(10, 9, 1, 1, '#e0596f'); P(6, 11, 1, 1, '#e0596f');
      break;
    }

    case TILE.ROCK: {
      grass(ctx);
      shadow(ctx, 8, 13, 6, 2);
      ctx.fillStyle = PAL.stoneDark; ctx.beginPath(); ctx.ellipse(8, 10, 5.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.stone; ctx.beginPath(); ctx.ellipse(8, 9, 5, 3.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.stoneLight; ctx.beginPath(); ctx.ellipse(6.5, 7.5, 2.2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      P(10, 11, 2, 1, PAL.stoneDark); // crack
      break;
    }

    default:
      P(0, 0, 16, 16, '#ff00ff');
  }
}

// ---------------------------------------------------------------------------
// People: 16x32 frames, 3 columns (stand, step A, step B) x 4 rows (down, left, right, up).
// Feet sit on the bottom edge of the frame so sprites can use a bottom origin.
// ---------------------------------------------------------------------------
function makePersonSheet(pal: PersonPalette): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(PERSON_W * PERSON_COLS, PERSON_H * DIRS.length);
  DIRS.forEach((dir, r) => {
    for (let f = 0; f < PERSON_COLS; f++) {
      ctx.save();
      ctx.translate(f * PERSON_W, r * PERSON_H);
      drawPerson(ctx, dir, f, pal);
      ctx.restore();
    }
  });
  return c;
}

function drawPerson(ctx: Ctx, dir: Facing, frame: number, pal: PersonPalette) {
  const P = (x: number, y: number, w: number, h: number, col: string) => rect(ctx, x, y, w, h, col);
  const back = dir === 'up';

  shadow(ctx, 8, 31, 5, 1.5, 0.22);

  // Legs: one steps forward on frame 1, the other on frame 2.
  const leftLen = frame === 2 ? 7 : 9;
  const rightLen = frame === 1 ? 7 : 9;
  P(5, 22, 3, leftLen, pal.pants); P(5, 22 + leftLen, 3, 31 - (22 + leftLen), pal.boots);
  P(9, 22, 3, rightLen, pal.pants); P(9, 22 + rightLen, 3, 31 - (22 + rightLen), pal.boots);

  // Torso
  P(4, 13, 8, 9, pal.shirt);
  P(4, 13, 8, 1, '#ffffff22');
  P(4, 20, 8, 2, pal.pants); // belt line
  // Arms, swinging opposite the legs
  const lArm = frame === 1 ? 14 : 13;
  const rArm = frame === 2 ? 14 : 13;
  P(2, lArm, 2, 6, pal.shirt); P(2, lArm + 6, 2, 2, pal.skin);
  P(12, rArm, 2, 6, pal.shirt); P(12, rArm + 6, 2, 2, pal.skin);

  // Head
  P(4, 5, 8, 8, pal.skin);
  if (back) P(4, 5, 8, 8, pal.hair);
  else {
    P(4, 5, 8, 2, pal.hair); // fringe
    P(3, 6, 1, 5, pal.hair); P(12, 6, 1, 5, pal.hair); // hair at the sides
  }
  P(5, 13, 6, 1, pal.skin); // neck

  // Hat: crown plus a wide brim, the most readable cowgirl cue at this size.
  P(5, 0, 6, 4, pal.hat);
  P(5, 0, 6, 1, '#ffffff22');
  P(2, 4, 12, 2, pal.hat);
  P(2, 5, 12, 1, INK);

  // Eyes
  if (dir === 'down') { P(6, 9, 1, 2, INK); P(9, 9, 1, 2, INK); }
  if (dir === 'left') P(5, 9, 1, 2, INK);
  if (dir === 'right') P(10, 9, 1, 2, INK);
}

// ---------------------------------------------------------------------------
// Hotbar icons: 16x16, 8 frames in hotbar order.
// ---------------------------------------------------------------------------
function makeIcons(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(16 * 8, 16);
  const P = (x: number, y: number, w: number, h: number, col: string) => rect(ctx, x, y, w, h, col);
  const at = (i: number, fn: () => void) => { ctx.save(); ctx.translate(i * 16, 0); fn(); ctx.restore(); };
  at(0, () => { P(2, 8, 9, 3, PAL.wood); P(10, 4, 4, 9, PAL.stone); P(10, 4, 4, 1, PAL.stoneLight); }); // hammer
  at(1, () => { ctx.strokeStyle = '#c9a35a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(7, 7, 5, 0, Math.PI * 2); ctx.stroke(); P(11, 10, 2, 5, '#c9a35a'); }); // lasso
  at(2, () => { P(4, 4, 8, 9, PAL.stone); P(3, 3, 10, 2, PAL.stoneLight); P(5, 6, 1, 6, PAL.stoneLight); ctx.strokeStyle = PAL.stoneDark; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(8, 4, 5, Math.PI, 0); ctx.stroke(); }); // bucket
  at(3, () => { P(3, 5, 10, 4, PAL.wood); P(4, 5, 8, 1, PAL.woodLight); P(3, 9, 10, 4, '#e8d27a'); }); // brush
  at(4, () => { P(6, 5, 4, 6, '#f28c28'); P(7, 11, 2, 3, '#f28c28'); P(5, 2, 6, 3, PAL.leafMid); P(7, 1, 2, 2, PAL.leafMid); }); // carrot
  at(5, () => { P(7, 8, 2, 6, PAL.leafMid); P(4, 4, 3, 3, '#e0596f'); P(9, 4, 3, 3, '#f0cf52'); P(6, 2, 3, 3, '#f2f0e4'); }); // flowers
  at(6, () => { P(3, 5, 10, 6, PAL.woodDark); P(4, 3, 3, 3, PAL.woodDark); P(5, 11, 6, 2, INK); P(4, 6, 8, 1, PAL.woodLight); }); // saddle
  at(7, () => { ctx.strokeStyle = PAL.stone; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI); ctx.stroke(); P(2, 4, 3, 5, PAL.stone); P(11, 4, 3, 5, PAL.stone); }); // horseshoe
  return c;
}
