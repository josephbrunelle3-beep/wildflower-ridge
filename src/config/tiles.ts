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

/**
 * Obstacles low enough for a horse to jump. Everything else in SOLID_TILES stays solid
 * even mid-air: you cannot leap a barn, a tree, or a pond.
 */
export const JUMPABLE_TILES: number[] = [
  TILE.FENCE_H,
  TILE.FENCE_V,
  TILE.FENCE_POST,
  TILE.BUSH,
  TILE.ROCK,
  TILE.TROUGH,
];

/** Approximate colour per tile, used by the minimap. */
export const TILE_COLORS: Record<number, string> = {
  [TILE.GRASS]: '#6a9c4a',
  [TILE.GRASS_ALT]: '#76a750',
  [TILE.DIRT]: '#b58757',
  [TILE.WATER]: '#3d86c4',
  [TILE.FENCE_H]: '#7a5231',
  [TILE.FENCE_V]: '#7a5231',
  [TILE.FENCE_POST]: '#7a5231',
  [TILE.TREE]: '#2f5f34',
  [TILE.BARN_WALL]: '#a8392b',
  [TILE.BARN_ROOF]: '#7d5334',
  [TILE.HOUSE_WALL]: '#d9c096',
  [TILE.HOUSE_ROOF]: '#7d5334',
  [TILE.HAY]: '#d4ad4a',
  [TILE.TROUGH]: '#5c3c22',
  [TILE.FLOWERS]: '#7fb35a',
  [TILE.SIGN]: '#7a5231',
  [TILE.BARN_DOOR]: '#5c3c22',
  [TILE.HOUSE_DOOR]: '#5c3c22',
  [TILE.GATE]: '#b58757',
  [TILE.BUSH]: '#3e7a3f',
  [TILE.ROCK]: '#8f8b82',
};
