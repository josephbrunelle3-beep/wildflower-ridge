import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TEX } from '../config/keys';
import { horseAnimKey, horseIdleFrame, jumpAnimKey, type Gait, type HorseSheet } from '../config/sprites';
import type { Facing, HorseState } from '../state/GameState';
import type { Interactable } from '../systems/InteractionSystem';
import { angleDelta, canJump, createMoveState, facingFor, gaitFor, stepMovement, type MoveState } from '../systems/HorseMovement';

type Mode = 'idle' | 'wander' | 'eat' | 'mounted';

const TEXTURE_FOR: Record<HorseSheet, string> = {
  base: TEX.HORSE,
  tacked: TEX.HORSE_TACKED,
  ridden: TEX.HORSE_RIDDEN,
};

/** How far the sprite may lean off its drawn direction, in radians. */
const LEAN_SIDE = 0.38;
const LEAN_HEAD_ON = 0.18;

/** Screen-space heading in radians for each drawn facing (y grows downward). */
const HEADING_FOR: Record<Facing, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: (3 * Math.PI) / 2,
};

export class Horse extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = 'left';
  readonly stats: HorseState;
  private mode: Mode = 'idle';
  private modeTimer = 1200;
  private target = { x: 0, y: 0 };
  /** Speed and heading while ridden; see systems/HorseMovement.ts. */
  private move: MoveState = createMoveState();
  private jumping = false;

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

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  /**
   * Which of onfe's sheets suits the horse's current state.
   *
   * Mounted uses the ridden sheet, where the rider is part of the same art: she is posed
   * and bobs with each gait frame, which a separate sprite sitting on top never did.
   * onfe draws that rider unclothed as a base to paint over, so tools/paint-rider.mjs
   * dresses her before the sheet reaches the game.
   */
  get sheet(): HorseSheet {
    if (this.mode === 'mounted') return 'ridden';
    return this.stats.tacked ? 'tacked' : 'base';
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
    // Start from a standstill pointed the way she is already facing.
    this.move = createMoveState(HEADING_FOR[this.facing]);
    this.jumping = false;
    this.setRotation(0);
    this.refreshTexture();
    if (!mounted) {
      this.stats.anchorX = this.x;
      this.stats.anchorY = this.y;
    }
    this.showIdle();
  }

  /**
   * Player-driven movement while mounted. Steering and throttle go through the momentum
   * model rather than straight to the body, so she carries speed, runs on when the reins
   * go loose, and needs room to turn at pace.
   */
  ride(dx: number, dy: number, gallop: boolean, dt: number): { braking: boolean } {
    if (this.airborne) {
      // Committed: the leap carries her on her takeoff heading.
      this.move.speed = Math.max(this.move.speed, BALANCE.horse.jump.airSpeed);
      const vx = Math.cos(this.move.heading) * this.move.speed;
      const vy = Math.sin(this.move.heading) * this.move.speed;
      this.arcadeBody.setVelocity(vx, vy);
      this.setDepth(100 + this.y);
      return { braking: false };
    }

    const r = stepMovement(this.move, { dx, dy, gallop }, dt / 1000);
    this.arcadeBody.setVelocity(r.vx, r.vy);

    const gait = gaitFor(this.move.speed);
    if (gait === 'idle') {
      this.showIdle();
    } else {
      this.facing = facingFor(this.move.heading);
      this.play(horseAnimKey(this.sheet, gait, this.facing), true);
    }
    this.applyLean();
    this.setDepth(100 + this.y);
    return { braking: r.braking };
  }

  /** Current speed in px/s, for the HUD and for gating a jump. */
  get speed(): number {
    return this.move.speed;
  }

  get gait(): Gait {
    return gaitFor(this.move.speed);
  }

  /** True from take-off until the jump animation finishes. */
  get airborne(): boolean {
    return this.jumping;
  }

  /**
   * Take off, if she has the impulsion. While airborne the scene lets her pass over low
   * obstacles; the pack's jump art carries the whole arc, so there is no separate hop.
   */
  tryJump(): boolean {
    if (this.jumping || !canJump(this.move)) return false;
    this.jumping = true;
    this.facing = facingFor(this.move.heading);
    this.setTexture(TEX.HORSE_JUMP);
    this.play(jumpAnimKey(this.facing), true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.jumping = false;
      // Back to the gait sheets, landing at whatever speed she carried over.
      this.setTexture(this.textureKey, horseIdleFrame(this.sheet, this.facing));
      this.showIdle();
    });
    return true;
  }

  halt(): void {
    this.move.speed = 0;
    this.arcadeBody.setVelocity(0, 0);
    this.setRotation(0);
    if (!this.jumping) this.showIdle();
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

  /**
   * onfe's art has four drawn directions, so a continuous heading would otherwise snap
   * ninety degrees at a time. Leaning the sprite toward the true heading turns that pop
   * into a smooth swing: the drawn direction still changes at the diagonal, but by then
   * the sprite has already rotated most of the way there.
   *
   * Side-on views take a bigger lean than head-on ones, where rotation reads as roll
   * rather than turn.
   */
  private applyLean(): void {
    // Standing still she is square on her feet, not tilted.
    if (this.move.speed <= BALANCE.horse.pivotSpeed) {
      this.setRotation(0);
      return;
    }
    const headOn = this.facing === 'up' || this.facing === 'down';
    const max = headOn ? LEAN_HEAD_ON : LEAN_SIDE;
    const residual = angleDelta(HEADING_FOR[this.facing], this.move.heading);
    this.setRotation(Phaser.Math.Clamp(residual, -max, max));
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
