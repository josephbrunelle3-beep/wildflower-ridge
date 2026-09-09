import Phaser from 'phaser';
import { MAP, SCENE, TEX } from '../config/keys';
import { BALANCE } from '../config/balance';
import {
  FACINGS, GAITS, HORSE_FRAME_H, HORSE_FRAME_W, JUMP_FRAME_H, JUMP_FRAME_W,
  horseAnimKey, horseFrames, jumpAnimKey, jumpFrames, type Gait, type HorseSheet,
} from '../config/sprites';
import { generateFarmTextures } from '../gfx/CropTextures';
import { DIRS, generatePlaceholders, PERSON_COLS } from '../gfx/PlaceholderTextures';
import { buildRanchMap } from '../gfx/RanchMap';

/** Texture key per horse sheet variant. */
const HORSE_SHEETS: Record<HorseSheet, string> = {
  base: TEX.HORSE,
  tacked: TEX.HORSE_TACKED,
  ridden: TEX.HORSE_RIDDEN,
};

/** How fast each gait plays, in frames per second. */
const HORSE_FPS: Record<Gait, number> = { idle: 6, walk: 10, trot: 12, canter: 13, gallop: 14 };

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.BOOT);
  }

  preload(): void {
    const frame = { frameWidth: HORSE_FRAME_W, frameHeight: HORSE_FRAME_H };
    this.load.spritesheet(TEX.HORSE, 'assets/sprites/horse-base.png', frame);
    this.load.spritesheet(TEX.HORSE_TACKED, 'assets/sprites/horse-tacked.png', frame);
    // onfe's ridden sheet with our cowgirl painted on; see tools/paint-rider.mjs.
    this.load.spritesheet(TEX.HORSE_RIDDEN, 'assets/sprites/horse-ridden.png', frame);
    // The jump sheet has taller frames, so it gets its own texture rather than a row.
    this.load.spritesheet(TEX.HORSE_JUMP, 'assets/sprites/horse-jump.png', {
      frameWidth: JUMP_FRAME_W,
      frameHeight: JUMP_FRAME_H,
    });
  }

  create(): void {
    this.cache.tilemap.add(MAP.RANCH, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: buildRanchMap() });
    generatePlaceholders(this);
    generateFarmTextures(this);
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
      for (const gait of GAITS) {
        for (const facing of FACINGS) {
          this.anims.create({
            key: horseAnimKey(sheet, gait, facing),
            frames: horseFrames(sheet, facing, gait).map((frame) => ({ key, frame })),
            frameRate: HORSE_FPS[gait],
            repeat: -1,
          });
        }
      }
    }

    // The jump plays once; the horse lands when it completes.
    for (const facing of FACINGS) {
      this.anims.create({
        key: jumpAnimKey(facing),
        frames: jumpFrames(facing).map((frame) => ({ key: TEX.HORSE_JUMP, frame })),
        frameRate: BALANCE.horse.jump.frameRate,
        repeat: 0,
      });
    }
  }
}
