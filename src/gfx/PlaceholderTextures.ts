import Phaser from 'phaser';
import { TEX } from '../config/keys';
import { TILE, TILE_COUNT, TILE_SIZE } from '../config/tiles';
import type { Facing } from '../state/GameState';

/**
 * Draws every texture the game needs onto canvases at boot, so the game runs with no
 * downloaded art. Each texture key here can later be replaced by a real sheet loaded
 * in BootScene.preload; the frame layout is documented per sheet.
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

function grass(ctx: Ctx, base = '#5fa14a', speck = '#4f8c3e') {
  rect(ctx, 0, 0, 16, 16, base);
  for (const [x, y] of [[3, 5], [9, 2], [12, 10], [6, 13], [14, 7], [1, 11]]) rect(ctx, x, y, 1, 1, speck);
}

function drawTile(ctx: Ctx, i: number) {
  const P = (x: number, y: number, w: number, h: number, col: string) => rect(ctx, x, y, w, h, col);
  switch (i) {
    case TILE.GRASS: grass(ctx); break;
    case TILE.GRASS_ALT: grass(ctx, '#63a84e', '#75ba5c'); break;
    case TILE.DIRT:
      P(0, 0, 16, 16, '#b98a5a');
      for (const [x, y] of [[2, 3], [8, 6], [13, 2], [5, 11], [11, 13], [14, 9]]) P(x, y, 2, 1, '#a67a4c');
      break;
    case TILE.WATER:
      P(0, 0, 16, 16, '#4a8fd1');
      P(2, 4, 6, 1, '#6fb0e8'); P(9, 11, 5, 1, '#6fb0e8'); P(11, 3, 3, 1, '#3d7bbd');
      break;
    case TILE.FENCE_H:
      grass(ctx);
      P(0, 5, 16, 2, '#8a6236'); P(0, 10, 16, 2, '#8a6236'); P(7, 3, 2, 11, '#6b4a2a'); P(7, 3, 2, 1, '#8a6236');
      break;
    case TILE.FENCE_V:
      grass(ctx);
      P(7, 0, 2, 16, '#8a6236'); P(5, 2, 6, 2, '#6b4a2a'); P(5, 12, 6, 2, '#6b4a2a');
      break;
    case TILE.FENCE_POST:
      grass(ctx);
      P(6, 2, 4, 12, '#6b4a2a'); P(6, 2, 4, 1, '#8a6236');
      break;
    case TILE.TREE:
      grass(ctx);
      P(7, 11, 3, 5, '#5a3a1e');
      ctx.fillStyle = '#2f6b32'; ctx.beginPath(); ctx.ellipse(8, 7, 7, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d8a3f'; ctx.beginPath(); ctx.ellipse(6, 5, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case TILE.BARN_WALL:
      P(0, 0, 16, 16, '#a63a2b'); P(0, 5, 16, 1, '#8a2e22'); P(0, 11, 16, 1, '#8a2e22'); P(4, 0, 1, 16, '#8a2e22'); P(11, 0, 1, 16, '#8a2e22');
      break;
    case TILE.BARN_ROOF:
      P(0, 0, 16, 16, '#6b3b2a'); P(0, 4, 16, 1, '#5a3020'); P(0, 9, 16, 1, '#5a3020'); P(0, 14, 16, 1, '#5a3020');
      break;
    case TILE.HOUSE_WALL:
      P(0, 0, 16, 16, '#d8c39a'); P(0, 5, 16, 1, '#c4ad83'); P(0, 11, 16, 1, '#c4ad83');
      break;
    case TILE.HOUSE_ROOF:
      P(0, 0, 16, 16, '#7a5230'); P(0, 4, 16, 1, '#684426'); P(0, 9, 16, 1, '#684426'); P(0, 14, 16, 1, '#684426');
      break;
    case TILE.HAY:
      grass(ctx);
      P(1, 3, 14, 11, '#a88a2e'); P(2, 4, 12, 9, '#d8b84a'); P(5, 4, 1, 9, '#c2a33d'); P(10, 4, 1, 9, '#c2a33d');
      break;
    case TILE.TROUGH:
      grass(ctx);
      P(1, 4, 14, 9, '#6d4a2c'); P(3, 6, 10, 5, '#4a8fd1'); P(4, 7, 4, 1, '#6fb0e8');
      break;
    case TILE.FLOWERS:
      grass(ctx);
      P(3, 4, 2, 2, '#e85d75'); P(10, 8, 2, 2, '#f2d34b'); P(6, 12, 2, 2, '#f8f8f8'); P(12, 3, 2, 2, '#c96be0');
      break;
    case TILE.SIGN:
      grass(ctx);
      P(7, 6, 2, 10, '#6b4a2a'); P(2, 2, 12, 7, '#8a6236'); P(3, 3, 10, 5, '#b98a5a'); P(4, 4, 8, 1, '#5a3a1e'); P(4, 6, 5, 1, '#5a3a1e');
      break;
    case TILE.BARN_DOOR:
      P(0, 0, 16, 16, '#5a2d20'); P(0, 0, 1, 16, '#3d1d14'); P(15, 0, 1, 16, '#3d1d14');
      for (let k = 0; k < 16; k++) { P(k, k, 1, 1, '#7a4030'); P(15 - k, k, 1, 1, '#7a4030'); }
      break;
    case TILE.HOUSE_DOOR:
      P(0, 0, 16, 16, '#d8c39a'); P(4, 2, 8, 14, '#6d4a2c'); P(5, 3, 6, 12, '#7d5a38'); P(10, 9, 1, 1, '#f2d34b');
      break;
    case TILE.GATE:
      P(0, 0, 16, 16, '#b98a5a'); P(1, 2, 2, 12, '#6b4a2a'); P(13, 2, 2, 12, '#6b4a2a');
      break;
    case TILE.BUSH:
      grass(ctx);
      ctx.fillStyle = '#3f7f3a'; ctx.beginPath(); ctx.ellipse(8, 9, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4f9a48'; ctx.beginPath(); ctx.ellipse(6, 7, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case TILE.ROCK:
      grass(ctx);
      ctx.fillStyle = '#6f6f6b'; ctx.beginPath(); ctx.ellipse(8, 10, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8b8b86'; ctx.beginPath(); ctx.ellipse(8, 9, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a5a5a0'; ctx.beginPath(); ctx.ellipse(6, 8, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
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

  // Legs: one steps forward on frame 1, the other on frame 2.
  const leftLen = frame === 2 ? 7 : 9;
  const rightLen = frame === 1 ? 7 : 9;
  P(5, 22, 3, leftLen, pal.pants); P(5, 22 + leftLen, 3, 32 - (22 + leftLen), pal.boots);
  P(9, 22, 3, rightLen, pal.pants); P(9, 22 + rightLen, 3, 32 - (22 + rightLen), pal.boots);

  // Torso
  P(4, 13, 8, 9, pal.shirt);
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
  P(2, 4, 12, 2, pal.hat);

  // Eyes
  const eye = '#2a1a10';
  if (dir === 'down') { P(6, 9, 1, 2, eye); P(9, 9, 1, 2, eye); }
  if (dir === 'left') P(5, 9, 1, 2, eye);
  if (dir === 'right') P(10, 9, 1, 2, eye);
}

// ---------------------------------------------------------------------------
// Hotbar icons: 16x16, 8 frames in hotbar order.
// ---------------------------------------------------------------------------
function makeIcons(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(16 * 8, 16);
  const P = (x: number, y: number, w: number, h: number, col: string) => rect(ctx, x, y, w, h, col);
  const at = (i: number, fn: () => void) => { ctx.save(); ctx.translate(i * 16, 0); fn(); ctx.restore(); };
  at(0, () => { P(2, 8, 9, 3, '#8a5a2b'); P(10, 4, 4, 9, '#8b8b86'); P(10, 4, 4, 1, '#a5a5a0'); }); // hammer
  at(1, () => { ctx.strokeStyle = '#c9a35a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(7, 7, 5, 0, Math.PI * 2); ctx.stroke(); P(11, 10, 2, 5, '#c9a35a'); }); // lasso
  at(2, () => { P(4, 4, 8, 9, '#8b8b86'); P(3, 3, 10, 2, '#a5a5a0'); P(5, 6, 1, 6, '#a5a5a0'); ctx.strokeStyle = '#6f6f6b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(8, 4, 5, Math.PI, 0); ctx.stroke(); }); // bucket
  at(3, () => { P(3, 5, 10, 4, '#8a5a2b'); P(4, 5, 8, 1, '#a06d3a'); P(3, 9, 10, 4, '#e8d27a'); }); // brush
  at(4, () => { P(6, 5, 4, 6, '#f28c28'); P(7, 11, 2, 3, '#f28c28'); P(5, 2, 6, 3, '#4caf50'); P(7, 1, 2, 2, '#4caf50'); }); // carrot
  at(5, () => { P(7, 8, 2, 6, '#4caf50'); P(4, 4, 3, 3, '#e85d75'); P(9, 4, 3, 3, '#f2d34b'); P(6, 2, 3, 3, '#f8f8f8'); }); // flowers
  at(6, () => { P(3, 5, 10, 6, '#5a3a1e'); P(4, 3, 3, 3, '#5a3a1e'); P(5, 11, 6, 2, '#3a2414'); P(4, 6, 8, 1, '#7a5230'); }); // saddle
  at(7, () => { ctx.strokeStyle = '#8b8b86'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI); ctx.stroke(); P(2, 4, 3, 5, '#8b8b86'); P(11, 4, 3, 5, '#8b8b86'); }); // horseshoe
  return c;
}
