import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TEX } from '../config/keys';
import { horseAnimKey, horseIdleFrame, type HorseSheet } from '../config/sprites';
import type { Facing, HorseState } from '../state/GameState';
import type { Interactable } from '../systems/InteractionSystem';

type Mode = 'idle' | 'wander' | 'eat' | 'mounted';

const TEXTURE_FOR: Record<HorseSheet, string> = {
  base: TEX.HORSE,
  tacked: TEX.HORSE_TACKED,
};

export class Horse extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = 'left';
  readonly stats: HorseState;
  private mode: Mode = 'idle';
  private modeTimer = 1200;
  private target = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, stats: HorseState) {
    super(scene, stats.x, stats.y, TEX.HORSE, 0);
    this.stats = stats;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Bottom-centre origin: the sprite's position is where the hooves are, which keeps
    // depth sorting and map placement honest for an 80x64 frame.
    this.setOrigin(0.5, 1);
    this.setCollideWorldBounds(true);
    this.setImmovable(true);
    // Narrower than a tile so a ridden horse fits through gateways and one-tile gaps.
    this.arcadeBody.setSize(14, 10).setOffset(33, 50);
    this.refreshTexture();
    this.showIdle();
    this.setDepth(100 + this.y);
  }

  /** Where a rider sits, relative to the horse's hooves. */
  get saddleOffsetY(): number {
    return this.facing === 'up' || this.facing === 'down' ? -34 : -30;
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  /**
   * Which of onfe's sheets suits the horse's current state.
   *
   * Note the 'ridden' sheets are deliberately unused: onfe draws the rider as an
   * unclothed base for the developer to paint over, so we use the riderless saddled
   * horse and draw our own dressed rider on top (see Player.rideOn).
   */
  get sheet(): HorseSheet {
    return this.stats.tacked || this.mode === 'mounted' ? 'tacked' : 'base';
  }

  get textureKey(): string {
    return TEXTURE_FOR[this.sheet];
  }

  /** Swap sheets after tacking up or mounting, keeping the pose. */
  refreshTexture(): void {
    const key = this.textureKey;
    if (this.texture.key !== key) {
      this.anims.stop();
      this.setTexture(key, horseIdleFrame(this.sheet, this.facing));
    }
  }

  get isMounted(): boolean {
    return this.mode === 'mounted';
  }

  setMounted(mounted: boolean): void {
    this.mode = mounted ? 'mounted' : 'idle';
    this.modeTimer = 1500;
    this.arcadeBody.setVelocity(0, 0);
    this.refreshTexture();
    if (!mounted) {
      this.stats.anchorX = this.x;
      this.stats.anchorY = this.y;
    }
    this.showIdle();
  }

  /** Player-driven movement while mounted. */
  ride(dx: number, dy: number, gallop: boolean): void {
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speed = gallop ? BALANCE.horse.gallopSpeed : BALANCE.horse.walkSpeed;
      this.arcadeBody.setVelocity((dx / len) * speed, (dy / len) * speed);
      this.facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
      this.play(horseAnimKey(this.sheet, gallop ? 'gallop' : 'walk', this.facing), true);
    } else {
      this.arcadeBody.setVelocity(0, 0);
      this.showIdle();
    }
    this.setDepth(100 + this.y);
  }

  halt(): void {
    this.arcadeBody.setVelocity(0, 0);
    this.showIdle();
  }

  faceToward(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.showIdle();
  }

  /** Idle / wander / graze behaviour when left alone. */
  updateAI(dt: number): void {
    if (this.mode === 'mounted') return;
    this.modeTimer -= dt;
    switch (this.mode) {
      case 'idle':
        this.arcadeBody.setVelocity(0, 0);
        if (this.modeTimer <= 0) {
          if (Math.random() < 0.55) {
            const a = Math.random() * Math.PI * 2;
            const r = 16 + Math.random() * BALANCE.horse.wanderRadius;
            this.target = { x: this.stats.anchorX + Math.cos(a) * r, y: this.stats.anchorY + Math.sin(a) * r };
            this.mode = 'wander';
            this.modeTimer = 2500 + Math.random() * 1500;
          } else {
            this.mode = 'eat';
            this.modeTimer = 2500 + Math.random() * 2000;
            this.showIdle();
          }
        }
        break;
      case 'wander': {
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 4 || this.modeTimer <= 0 || this.arcadeBody.blocked.none === false) {
          this.mode = 'idle';
          this.modeTimer = 1000 + Math.random() * 2500;
          this.arcadeBody.setVelocity(0, 0);
          this.showIdle();
        } else {
          const s = BALANCE.horse.wanderSpeed;
          this.arcadeBody.setVelocity((dx / dist) * s, (dy / dist) * s);
          this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
          this.play(horseAnimKey(this.sheet, 'walk', this.facing), true);
        }
        break;
      }
      case 'eat':
        this.arcadeBody.setVelocity(0, 0);
        if (this.modeTimer <= 0) {
          this.mode = 'idle';
          this.modeTimer = 800 + Math.random() * 1500;
          this.showIdle();
        }
        break;
    }
    this.setDepth(100 + this.y);
  }

  /** The idle loop doubles as the standing pose; it carries the tail swish and blink. */
  private showIdle(): void {
    this.play(horseAnimKey(this.sheet, 'idle', this.facing), true);
  }

  asInteractable(onInteract: () => void): Interactable {
    const horse = this;
    return {
      get x() { return horse.x; },
      get y() { return horse.y; },
      radius: 34,
      prompt: () => (horse.isMounted ? null : `[E] ${horse.stats.name}`),
      interact: onInteract,
    };
  }
}
