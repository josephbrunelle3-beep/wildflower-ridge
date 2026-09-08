import Phaser from 'phaser';
import { personIdleFrame } from '../gfx/PlaceholderTextures';
import type { Facing } from '../state/GameState';
import type { Interactable } from '../systems/InteractionSystem';

export class Npc extends Phaser.Physics.Arcade.Sprite {
  readonly id: string;
  readonly displayName: string;
  facing: Facing = 'down';

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, id: string, displayName: string) {
    super(scene, x, y, texture, personIdleFrame('down'));
    this.id = id;
    this.displayName = displayName;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 6).setOffset(3, 26);
    body.moves = false;
    this.setImmovable(true);
    this.setDepth(100 + y);
  }

  faceToward(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.setFrame(personIdleFrame(this.facing));
  }

  asInteractable(onInteract: () => void): Interactable {
    return {
      x: this.x,
      y: this.y,
      radius: 26,
      prompt: () => `[E] Talk to ${this.displayName}`,
      interact: onInteract,
    };
  }
}
