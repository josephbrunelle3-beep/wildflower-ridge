import type Phaser from 'phaser';
import { FARM } from '../config/crops';
import { TILE } from '../config/tiles';

/**
 * Fences the garden off into a farmyard: a rail around `FARM.yard`, a two-tile gate on the
 * east side and a track from it back to the house path.
 *
 * This is painted into the tilemap at scene start rather than baked into `RanchMap`, so the
 * yard stays entirely inside the farming feature - the map generator keeps owning the ranch
 * proper. Trees already standing on the fence line are left alone: a rail running up to a
 * trunk reads better than a tree deleted for a fence, and it costs nothing to skip the tile.
 */
export function buildFarmYard(ground: Phaser.Tilemaps.TilemapLayer, decor: Phaser.Tilemaps.TilemapLayer): void {
  const { yard, gate, pathRow } = FARM;

  /** Only ever write into empty ground cover, never over a tree, rock or building. */
  const free = (x: number, y: number): boolean => {
    const tile = decor.getTileAt(x, y);
    return !tile || tile.index - 1 === TILE.FLOWERS;
  };
  const putDecor = (x: number, y: number, index: number) => {
    if (free(x, y)) decor.putTileAt(index + 1, x, y);
  };
  const isGate = (x: number, y: number) => x === gate.x && y >= gate.y0 && y <= gate.y1;

  for (let x = yard.x0; x <= yard.x1; x++) {
    for (const y of [yard.y0, yard.y1]) putDecor(x, y, TILE.FENCE_H);
  }
  for (let y = yard.y0; y <= yard.y1; y++) {
    for (const x of [yard.x0, yard.x1]) {
      if (isGate(x, y)) continue;
      putDecor(x, y, TILE.FENCE_V);
    }
  }
  for (const [x, y] of [[yard.x0, yard.y0], [yard.x1, yard.y0], [yard.x0, yard.y1], [yard.x1, yard.y1]]) {
    putDecor(x, y, TILE.FENCE_POST);
  }

  // The gateway and the track out to the house path.
  for (let y = gate.y0; y <= gate.y1; y++) {
    decor.removeTileAt(gate.x, y);
    ground.putTileAt(TILE.DIRT + 1, gate.x, y);
  }
  for (let x = pathRow.x0; x <= pathRow.x1; x++) {
    if (!free(x, pathRow.y)) continue;
    ground.putTileAt(TILE.DIRT + 1, x, pathRow.y);
  }
}
