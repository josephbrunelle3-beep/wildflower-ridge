import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TEX } from '../config/keys';
import { horseIdleFrame } from '../gfx/PlaceholderTextures';
import type { Facing, HorseState } from '../state/GameState';
import type { Interactable } from '../systems/InteractionSystem';

type Mode = 'idle' | 'wander' | 'eat' | 'mounted';

export class Horse extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = 'left';
  readonly stats: HorseState;
  private mode: Mode = 'idle';
  private modeTimer = 1200;
  private target = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, stats: HorseState) {
    super(scene, stats.x, stats.y, stats.tacked ? TEX.HORSE_TACKED : TEX.HORSE, horseIdleFrame('left'));
    this.stats = stats;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setImmovable(true);
    // Narrower than a tile (16px) on purpose, so a ridden horse fits through gateways and
    // one-tile gaps between trees rather than snagging on both sides at once.
    this.arcadeBody.setSize(14, 10).setOffset(9, 18);
    this.setDepth(100 + this.y);
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get textureKey(): string {
    return this.stats.tacked ? TEX.HORSE_TACKED : TEX.HORSE;
  }

  /** Swap between the plain and saddled sheets after tacking. */
  refreshTexture(): void {
    if (this.texture.key !== this.textureKey) {
      this.anims.stop();
      this.setTexture(this.textureKey, horseIdleFrame(this.facing));
    }
  }

  get isMounted(): boolean {
    return this.mode === 'mounted';
  }

  setMounted(mounted: boolean): void {
    this.mode = mounted ? 'mounted' : 'idle';
    this.modeTimer = 1500;
    this.arcadeBody.setVelocity(0, 0);
    if (!mounted) {
      this.stats.anchorX = this.x;
      this.stats.anchorY = this.y;
      this.showIdle();
    }
  }

  /** Player-driven movement while mounted. */
  ride(dx: number, dy: number, gallop: boolean): void {
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speed = gallop ? BALANCE.horse.gallopSpeed : BALANCE.horse.walkSpeed;
      this.arcadeBody.setVelocity((dx / len) * speed, (dy / len) * speed);
      this.facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
      this.anims.play(`${this.textureKey}-${gallop ? 'gallop' : 'walk'}-${this.facing}`, true);
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

  /** Idle / wander / eat behaviour when left alone. */
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
            this.anims.play(`${this.textureKey}-eat-${this.facing}`, true);
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
          this.anims.play(`${this.textureKey}-walk-${this.facing}`, true);
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

  private showIdle(): void {
    this.anims.stop();
    this.setFrame(horseIdleFrame(this.facing));
  }

  asInteractable(onInteract: () => void): Interactable {
    const horse = this;
    return {
      get x() { return horse.x; },
      get y() { return horse.y; },
      radius: 30,
      prompt: () => (horse.isMounted ? null : `[E] ${horse.stats.name}`),
      interact: onInteract,
    };
  }
}
