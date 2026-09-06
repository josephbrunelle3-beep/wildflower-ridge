/** Tile indices into the "tiles" tileset (GID = index + 1 in Tiled JSON). */
export const TILE = {
  GRASS: 0,
  GRASS_ALT: 1,
  DIRT: 2,
  WATER: 3,
  FENCE_H: 4,
  FENCE_V: 5,
  FENCE_POST: 6,
  TREE: 7,
  BARN_WALL: 8,
  BARN_ROOF: 9,
  HOUSE_WALL: 10,
  HOUSE_ROOF: 11,
  HAY: 12,
  TROUGH: 13,
  FLOWERS: 14,
  SIGN: 15,
  BARN_DOOR: 16,
  HOUSE_DOOR: 17,
  GATE: 18,
  BUSH: 19,
  ROCK: 20,
} as const;

export type TileIndex = (typeof TILE)[keyof typeof TILE];

export const TILE_COUNT = 21;
export const TILE_SIZE = 16;

/** Tiles the player and horse cannot walk through. */
export const SOLID_TILES: number[] = [
  TILE.WATER,
  TILE.FENCE_H,
  TILE.FENCE_V,
  TILE.FENCE_POST,
  TILE.TREE,
  TILE.BARN_WALL,
  TILE.BARN_ROOF,
  TILE.HOUSE_WALL,
  TILE.HOUSE_ROOF,
  TILE.HAY,
  TILE.TROUGH,
  TILE.SIGN,
  TILE.BARN_DOOR,
  TILE.HOUSE_DOOR,
  TILE.BUSH,
  TILE.ROCK,
];

/** Approximate colour per tile, used by the minimap. */
export const TILE_COLORS: Record<number, string> = {
  [TILE.GRASS]: '#5fa14a',
  [TILE.GRASS_ALT]: '#64a84e',
  [TILE.DIRT]: '#b98a5a',
  [TILE.WATER]: '#4a8fd1',
  [TILE.FENCE_H]: '#8a6236',
  [TILE.FENCE_V]: '#8a6236',
  [TILE.FENCE_POST]: '#8a6236',
  [TILE.TREE]: '#2f6b32',
  [TILE.BARN_WALL]: '#a63a2b',
  [TILE.BARN_ROOF]: '#6b3b2a',
  [TILE.HOUSE_WALL]: '#d8c39a',
  [TILE.HOUSE_ROOF]: '#7a5230',
  [TILE.HAY]: '#d8b84a',
  [TILE.TROUGH]: '#6d4a2c',
  [TILE.FLOWERS]: '#7fb457',
  [TILE.SIGN]: '#8a6236',
  [TILE.BARN_DOOR]: '#5a2d20',
  [TILE.HOUSE_DOOR]: '#6d4a2c',
  [TILE.GATE]: '#b98a5a',
  [TILE.BUSH]: '#3f7f3a',
  [TILE.ROCK]: '#8b8b86',
};
