import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TEX } from '../config/keys';
import { personIdleFrame } from '../gfx/PlaceholderTextures';
import type { Facing } from '../state/GameState';
import type { Horse } from './Horse';

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing;

  constructor(scene: Phaser.Scene, x: number, y: number, facing: Facing = 'down') {
    super(scene, x, y, TEX.PLAYER, personIdleFrame(facing));
    this.facing = facing;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Bottom-centre origin, matching the horse: position is where the feet are.
    this.setOrigin(0.5, 1);
    this.setCollideWorldBounds(true);
    this.arcadeBody.setSize(10, 6).setOffset(3, 26);
    this.setDepth(100 + y);
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  move(dx: number, dy: number, run: boolean): void {
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speed = run ? BALANCE.player.runSpeed : BALANCE.player.walkSpeed;
      this.arcadeBody.setVelocity((dx / len) * speed, (dy / len) * speed);
      this.facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
      this.anims.play(`${TEX.PLAYER}-walk-${this.facing}`, true);
      this.anims.msPerFrame = run ? 80 : 125;
    } else {
      this.halt();
    }
    this.setDepth(100 + this.y);
  }

  halt(): void {
    this.arcadeBody.setVelocity(0, 0);
    this.anims.stop();
    this.setFrame(personIdleFrame(this.facing));
  }

  setMounted(mounted: boolean): void {
    this.arcadeBody.enable = !mounted;
    this.arcadeBody.setVelocity(0, 0);
    this.anims.stop();
    if (!mounted) this.setRotation(0);
  }

  /**
   * Sit the rider on the saddle, facing the way the horse is going. The horse leans into
   * turns, so the saddle offset is swung round with her and the rider leans to match -
   * otherwise she would float upright beside a tilted horse.
   */
  rideOn(horse: Horse): void {
    this.facing = horse.facing;
    const off = horse.saddleOffsetY;
    this.setPosition(horse.x - off * Math.sin(horse.rotation), horse.y + off * Math.cos(horse.rotation));
    this.setRotation(horse.rotation);
    this.setFrame(personIdleFrame(this.facing));
    this.setDepth(horse.depth + 1);
  }
}
