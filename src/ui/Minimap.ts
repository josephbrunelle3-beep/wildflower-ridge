import Phaser from 'phaser';
import { GAME_WIDTH, MAP, TEX } from '../config/keys';
import { TILE, TILE_COLORS } from '../config/tiles';
import { COLORS } from './Panel';

const PX = 2; // pixels per tile on the minimap canvas
const SCALE = 1.5;
const X = GAME_WIDTH - 16 - 120;
const Y = 16;

interface TiledLayer { type: string; name: string; data?: number[]; width?: number; height?: number }
interface TiledMap { width: number; height: number; layers: TiledLayer[] }

/** Tiny painted map of the ranch with player and horse markers. */
export class Minimap {
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly image: Phaser.GameObjects.Image;
  private readonly playerDot: Phaser.GameObjects.Rectangle;
  private readonly horseDot: Phaser.GameObjects.Rectangle;
  private readonly mapW: number;
  private readonly mapH: number;

  constructor(scene: Phaser.Scene) {
    const data = scene.cache.tilemap.get(MAP.RANCH)?.data as TiledMap | undefined;
    const w = data?.width ?? 40;
    const h = data?.height ?? 30;
    this.mapW = w * 16;
    this.mapH = h * 16;

    if (!scene.textures.exists(TEX.MINIMAP)) {
      const canvas = document.createElement('canvas');
      canvas.width = w * PX;
      canvas.height = h * PX;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = TILE_COLORS[TILE.GRASS];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const layer of data?.layers ?? []) {
        if (layer.type !== 'tilelayer' || !layer.data) continue;
        layer.data.forEach((gid, i) => {
          if (gid === 0) return;
          const color = TILE_COLORS[gid - 1];
          if (!color) return;
          ctx.fillStyle = color;
          ctx.fillRect((i % w) * PX, Math.floor(i / w) * PX, PX, PX);
        });
      }
      scene.textures.addCanvas(TEX.MINIMAP, canvas);
    }

    const dw = w * PX * SCALE;
    const dh = h * PX * SCALE;
    this.frame = scene.add.graphics().setDepth(10);
    this.frame.fillStyle(0x000000, 0.25);
    this.frame.fillRoundedRect(X - 1, Y + 2, dw + 8, dh + 8, 6);
    this.frame.fillStyle(COLORS.wood);
    this.frame.fillRoundedRect(X - 4, Y - 4, dw + 8, dh + 8, 6);
    this.image = scene.add.image(X, Y, TEX.MINIMAP).setOrigin(0).setScale(SCALE).setDepth(11);
    this.horseDot = scene.add.rectangle(0, 0, 5, 5, 0x8b5a2b).setStrokeStyle(1, 0x2b1a10).setDepth(12);
    this.playerDot = scene.add.rectangle(0, 0, 5, 5, 0xffffff).setStrokeStyle(1, 0x3b2414).setDepth(13);
    // N marker
    scene.add.text(X + dw / 2, Y - 4, 'N', { fontFamily: 'sans-serif', fontSize: '10px', color: '#fff3d6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(14);
  }

  update(px: number, py: number, hx: number, hy: number): void {
    const sx = (PX * SCALE) / 16;
    this.playerDot.setPosition(X + Phaser.Math.Clamp(px, 0, this.mapW) * sx, Y + Phaser.Math.Clamp(py, 0, this.mapH) * sx);
    this.horseDot.setPosition(X + Phaser.Math.Clamp(hx, 0, this.mapW) * sx, Y + Phaser.Math.Clamp(hy, 0, this.mapH) * sx);
  }

  destroy(): void {
    this.frame.destroy();
    this.image.destroy();
    this.playerDot.destroy();
    this.horseDot.destroy();
  }
}
