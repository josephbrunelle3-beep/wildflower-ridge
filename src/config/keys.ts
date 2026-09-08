/** Texture, animation, scene and map keys. */
export const TEX = {
  TILES: 'tiles',
  PLAYER: 'player',
  NPC_JASPER: 'npc-jasper',
  HORSE: 'horse',
  HORSE_TACKED: 'horse-tacked',
  HORSE_JUMP: 'horse-jump',
  ICONS: 'icons',
  FARM: 'farm',
  MINIMAP: 'minimap',
} as const;

export const SCENE = {
  BOOT: 'Boot',
  TITLE: 'Title',
  RANCH: 'Ranch',
  UI: 'UI',
} as const;

export const MAP = {
  RANCH: 'map-ranch',
} as const;

export const FONT = '"Pixelify Sans", "Courier New", monospace';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
/** World camera zoom. 960/2 x 540/2 => 30 x 17 tiles visible. */
export const WORLD_ZOOM = 2;
