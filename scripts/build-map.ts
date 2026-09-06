/**
 * Paints the ranch layout into a Tiled-format JSON map (public/assets/maps/ranch.json).
 * No Tiled app required. Run with: npm run build:map
 * A hand-authored Tiled map with the same layer/object names can replace the output later.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { TILE, TILE_COUNT, TILE_SIZE } from '../src/config/tiles.ts';

const W = 40;
const H = 30;

type Grid = number[][];
const grid = (fill: number): Grid => Array.from({ length: H }, () => Array(W).fill(fill));

const ground: Grid = grid(TILE.GRASS);
const decor: Grid = grid(-1);

interface MapObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: { name: string; type: string; value: string | number | boolean }[];
}
const objects: MapObject[] = [];
let nextId = 1;

const px = (tx: number) => tx * TILE_SIZE;
const addPoint = (name: string, type: string, tx: number, ty: number, props?: MapObject['properties']) =>
  objects.push({ id: nextId++, name, type, x: px(tx), y: px(ty), width: TILE_SIZE, height: TILE_SIZE, properties: props });
const addRect = (name: string, type: string, tx: number, ty: number, tw: number, th: number) =>
  objects.push({ id: nextId++, name, type, x: px(tx), y: px(ty), width: px(tw), height: px(th) });

const setG = (x: number, y: number, t: number) => { if (x >= 0 && x < W && y >= 0 && y < H) ground[y][x] = t; };
const setD = (x: number, y: number, t: number) => { if (x >= 0 && x < W && y >= 0 && y < H) decor[y][x] = t; };
const fillG = (x0: number, y0: number, x1: number, y1: number, t: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setG(x, y, t); };
const fillD = (x0: number, y0: number, x1: number, y1: number, t: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setD(x, y, t); };

// Deterministic pseudo-random so the map is stable between builds.
let seed = 1337;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// --- Border forest -------------------------------------------------------
fillD(0, 0, W - 1, 1, TILE.TREE);
fillD(0, H - 1, W - 1, H - 1, TILE.TREE);
fillD(0, 0, 0, H - 1, TILE.TREE);
fillD(W - 1, 0, W - 1, H - 1, TILE.TREE);

// --- North pasture (fenced, gate at bottom middle) -----------------------
const P = { x0: 3, y0: 3, x1: 22, y1: 11 };
for (let x = P.x0; x <= P.x1; x++) { setD(x, P.y0, TILE.FENCE_H); setD(x, P.y1, TILE.FENCE_H); }
for (let y = P.y0; y <= P.y1; y++) { setD(P.x0, y, TILE.FENCE_V); setD(P.x1, y, TILE.FENCE_V); }
for (const [x, y] of [[P.x0, P.y0], [P.x1, P.y0], [P.x0, P.y1], [P.x1, P.y1]]) setD(x, y, TILE.FENCE_POST);
const GATE_X = 13;
setD(GATE_X, P.y1, TILE.GATE);
setG(GATE_X, P.y1, TILE.DIRT);
addRect('pasture', 'zone', P.x0 + 1, P.y0 + 1, P.x1 - P.x0 - 1, P.y1 - P.y0 - 1);
setD(5, 4, TILE.TROUGH);
addPoint('trough', 'interact', 5, 4);
addPoint('horse', 'spawn', 12, 7);

// --- Barn ------------------------------------------------------------------
fillD(26, 3, 33, 5, TILE.BARN_ROOF);
fillD(26, 6, 33, 8, TILE.BARN_WALL);
setD(29, 8, TILE.BARN_DOOR);
setD(30, 8, TILE.BARN_DOOR);
addPoint('barn', 'interact', 29, 8, [{ name: 'wide', type: 'int', value: 2 }]);
for (const [x, y] of [[24, 8], [34, 8], [35, 8]]) { setD(x, y, TILE.HAY); addPoint('hay', 'interact', x, y); }

// --- House -----------------------------------------------------------------
fillD(27, 16, 33, 18, TILE.HOUSE_ROOF);
fillD(27, 19, 33, 20, TILE.HOUSE_WALL);
setD(30, 20, TILE.HOUSE_DOOR);
addPoint('bed', 'interact', 30, 20);
addPoint('player', 'spawn', 30, 22);

// --- Paths -----------------------------------------------------------------
fillG(GATE_X, 12, GATE_X, 14, TILE.DIRT);           // gate south
fillG(GATE_X, 14, 30, 14, TILE.DIRT);               // east-west lane
fillG(29, 9, 30, 14, TILE.DIRT);                    // barn door south
fillG(30, 14, 30, 27, TILE.DIRT);                   // lane south past house
fillG(30, 27, 38, 27, TILE.DIRT);                   // road to town
setD(39, 27, -1); setG(39, 27, TILE.DIRT);          // gap in the forest = road out
fillG(29, 21, 31, 21, TILE.DIRT);                   // house porch

// --- Pond ------------------------------------------------------------------
fillG(5, 19, 12, 24, TILE.WATER);
for (const [x, y] of [[5, 19], [12, 19], [5, 24], [12, 24], [6, 19], [11, 24]]) setG(x, y, TILE.GRASS);
for (const [x, y] of [[4, 21], [13, 22], [8, 25], [9, 18]]) setD(x, y, TILE.ROCK);

// --- Sign + townsfolk ------------------------------------------------------
setD(37, 26, TILE.SIGN);
addPoint('sign', 'interact', 37, 26);
addPoint('jasper', 'npc', 36, 28);

// --- Scattered trees & bushes ----------------------------------------------
for (const [x, y] of [[24, 18], [25, 22], [36, 20], [37, 17], [36, 5], [35, 13], [3, 15], [2, 26], [18, 26], [22, 25], [14, 17], [17, 20], [37, 10]]) setD(x, y, TILE.TREE);
for (const [x, y] of [[26, 24], [21, 17], [33, 22], [15, 27], [3, 13], [38, 14]]) setD(x, y, TILE.BUSH);

// --- Flowers & grass variation --------------------------------------------
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (ground[y][x] !== TILE.GRASS || decor[y][x] !== -1) continue;
  const r = rand();
  if (r < 0.06) setD(x, y, TILE.FLOWERS);
  else if (r < 0.22) setG(x, y, TILE.GRASS_ALT);
}

// --- Emit ------------------------------------------------------------------
const flat = (g: Grid) => g.flat().map((i) => (i < 0 ? 0 : i + 1));
const tileLayer = (id: number, name: string, g: Grid) => ({
  data: flat(g), height: H, width: W, id, name, opacity: 1, type: 'tilelayer', visible: true, x: 0, y: 0,
});

const map = {
  compressionlevel: -1,
  height: H,
  width: W,
  tileheight: TILE_SIZE,
  tilewidth: TILE_SIZE,
  infinite: false,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  nextlayerid: 4,
  nextobjectid: nextId,
  layers: [
    tileLayer(1, 'ground', ground),
    tileLayer(2, 'decor', decor),
    { draworder: 'topdown', id: 3, name: 'objects', objects, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
  ],
  tilesets: [{
    firstgid: 1, name: 'tiles', tilewidth: TILE_SIZE, tileheight: TILE_SIZE, tilecount: TILE_COUNT, columns: TILE_COUNT,
    image: 'tiles.png', imagewidth: TILE_SIZE * TILE_COUNT, imageheight: TILE_SIZE, margin: 0, spacing: 0,
  }],
};

mkdirSync('public/assets/maps', { recursive: true });
writeFileSync('public/assets/maps/ranch.json', JSON.stringify(map));

// ASCII preview for sanity checking.
const glyph: Record<number, string> = {
  [TILE.GRASS]: '.', [TILE.GRASS_ALT]: '.', [TILE.DIRT]: ':', [TILE.WATER]: '~', [TILE.FENCE_H]: '-', [TILE.FENCE_V]: '|',
  [TILE.FENCE_POST]: '+', [TILE.TREE]: 'T', [TILE.BARN_WALL]: 'B', [TILE.BARN_ROOF]: 'b', [TILE.HOUSE_WALL]: 'H', [TILE.HOUSE_ROOF]: 'h',
  [TILE.HAY]: '=', [TILE.TROUGH]: 'U', [TILE.FLOWERS]: '*', [TILE.SIGN]: 'S', [TILE.BARN_DOOR]: 'D', [TILE.HOUSE_DOOR]: 'd', [TILE.GATE]: '/', [TILE.BUSH]: 'o', [TILE.ROCK]: '@',
};
const markers: Record<string, string> = { player: 'P', horse: 'Q', jasper: 'J' };
for (let y = 0; y < H; y++) {
  let row = '';
  for (let x = 0; x < W; x++) {
    const o = objects.find((ob) => (ob.type === 'spawn' || ob.type === 'npc') && ob.x === px(x) && ob.y === px(y));
    const d = decor[y][x];
    row += o ? markers[o.name] : d >= 0 ? glyph[d] : glyph[ground[y][x]];
  }
  console.log(row);
}
console.log(`\nWrote public/assets/maps/ranch.json (${W}x${H}, ${objects.length} objects)`);
