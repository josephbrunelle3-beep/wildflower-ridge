import Phaser from 'phaser';
import { MAP, SCENE, TEX } from '../config/keys';
import {
  FACINGS, HORSE_ANIMS, HORSE_FRAME_H, HORSE_FRAME_W, horseAnimKey, horseFrames, type HorseSheet,
} from '../config/sprites';
import { DIRS, generatePlaceholders, PERSON_COLS } from '../gfx/PlaceholderTextures';
import { buildRanchMap } from '../gfx/RanchMap';

/** Texture key per horse sheet variant. */
const HORSE_SHEETS: Record<HorseSheet, string> = {
  base: TEX.HORSE,
  tacked: TEX.HORSE_TACKED,
};

/** How fast each gait plays, in frames per second. */
const HORSE_FPS = { idle: 6, walk: 10, gallop: 14 } as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.BOOT);
  }

  preload(): void {
    const frame = { frameWidth: HORSE_FRAME_W, frameHeight: HORSE_FRAME_H };
    this.load.spritesheet(TEX.HORSE, 'assets/sprites/horse-base.png', frame);
    this.load.spritesheet(TEX.HORSE_TACKED, 'assets/sprites/horse-tacked.png', frame);
  }

  create(): void {
    this.cache.tilemap.add(MAP.RANCH, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: buildRanchMap() });
    generatePlaceholders(this);
    this.registerAnimations();
    this.scene.start(SCENE.TITLE);
  }

  private registerAnimations(): void {
    for (const tex of [TEX.PLAYER, TEX.NPC_JASPER]) {
      DIRS.forEach((dir, d) => {
        const base = d * PERSON_COLS;
        this.anims.create({
          key: `${tex}-walk-${dir}`,
          frames: [base + 1, base, base + 2, base].map((frame) => ({ key: tex, frame })),
          frameRate: 8,
          repeat: -1,
        });
      });
    }

    for (const sheet of Object.keys(HORSE_SHEETS) as HorseSheet[]) {
      const key = HORSE_SHEETS[sheet];
      for (const anim of HORSE_ANIMS) {
        for (const facing of FACINGS) {
          const frames = horseFrames(sheet, facing, anim);
          this.anims.create({
            key: horseAnimKey(sheet, anim, facing),
            frames: frames.map((frame) => ({ key, frame })),
            frameRate: HORSE_FPS[anim],
            repeat: -1,
          });
        }
      }
    }
  }
}
