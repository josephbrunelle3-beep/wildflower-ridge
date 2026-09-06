import Phaser from 'phaser';
import { MAP, SCENE, TEX } from '../config/keys';
import { DIRS, generatePlaceholders, HORSE_COLS, PERSON_COLS } from '../gfx/PlaceholderTextures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.BOOT);
  }

  preload(): void {
    this.load.tilemapTiledJSON(MAP.RANCH, 'assets/maps/ranch.json');
    // Real art goes here later, e.g.:
    // this.load.spritesheet(TEX.PLAYER, 'assets/sprites/player.png', { frameWidth: 16, frameHeight: 16 });
  }

  create(): void {
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
    for (const tex of [TEX.HORSE, TEX.HORSE_TACKED]) {
      DIRS.forEach((dir, d) => {
        const base = d * HORSE_COLS;
        const walk = [base + 1, base, base + 2, base].map((frame) => ({ key: tex, frame }));
        this.anims.create({ key: `${tex}-walk-${dir}`, frames: walk, frameRate: 6, repeat: -1 });
        this.anims.create({ key: `${tex}-gallop-${dir}`, frames: walk, frameRate: 14, repeat: -1 });
        this.anims.create({
          key: `${tex}-eat-${dir}`,
          frames: [base + 3, base + 3, base + 3, base].map((frame) => ({ key: tex, frame })),
          frameRate: 2,
          repeat: -1,
        });
      });
    }
  }
}
