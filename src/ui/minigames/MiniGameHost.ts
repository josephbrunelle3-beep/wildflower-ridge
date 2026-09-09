import Phaser from 'phaser';
import type { CropDef } from '../../config/crops';
import { GAME_HEIGHT, GAME_WIDTH, TEX } from '../../config/keys';
import { FARM_FRAME } from '../../gfx/CropTextures';
import type { HarvestParams, WateringParams, WeedingParams } from '../../systems/minigames/tuning';
import type { WateringVerdict } from '../../systems/minigames/WateringModel';
import { COLORS, drawPanel, makeText } from '../Panel';
import { HarvestView } from './HarvestView';
import { WateringView } from './WateringView';
import { WeedingView } from './WeedingView';

export interface WeedingOutcome { pulled: number; remaining: number; damage: number }

export type MiniGameSpec =
  | { kind: 'watering'; crop: CropDef; stageFrame: number; params: WateringParams; onDone: (v: WateringVerdict) => void; onCancel?: () => void }
  | { kind: 'weeding'; crop: CropDef; stageFrame: number; params: WeedingParams; onDone: (r: WeedingOutcome) => void }
  | { kind: 'harvest'; crop: CropDef; stageFrame: number; params: HarvestParams; onDone: (bagged: number) => void; onCancel?: () => void };

/** What the host hands each game every frame. Pointer state is merged in by the host. */
export interface GameInput {
  /** Keyboard nudge for the hand, -1..1 on each axis. */
  dx: number;
  dy: number;
  /** E / Space / Enter / mouse button held. */
  confirmDown: boolean;
  /** ...and pressed this frame. */
  confirmJust: boolean;
  cancelJust: boolean;
}

/** The square close-up every game draws into, in screen pixels. */
export interface Field { x: number; y: number; size: number }

export interface GameView {
  update(dt: number, input: GameInput, hand: { x: number; y: number }): void;
  /** True once the game has settled and the host may close after a beat. */
  readonly finished: boolean;
  destroy(): void;
}

/** Everything a game view gets from the host to draw with. */
export interface GameContext {
  scene: Phaser.Scene;
  field: Field;
  /** Column to the right of the field for bars, tallies and instructions. */
  side: { x: number; y: number; w: number; h: number };
  depth: number;
  setFeedback(text: string, color?: string): void;
  setInstructions(text: string): void;
  close(): void;
}

const W = 600;
const H = 420;
const X = (GAME_WIDTH - W) / 2;
const Y = (GAME_HEIGHT - H) / 2 - 10;
const FIELD = 280;
const HAND_SPEED = 280;
const DEPTH = 40;

/**
 * The popup the tending games play in. Owns the panel, the hand cursor (mouse or arrow
 * keys), pointer wiring and the close-out beat; the game itself is one of the views.
 */
export class MiniGameHost {
  isOpen = false;
  private readonly scene: Phaser.Scene;
  private g?: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.Text;
  private instructions?: Phaser.GameObjects.Text;
  private feedback?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private hand?: Phaser.GameObjects.Image;
  private view?: GameView;
  private handPos = { x: 0, y: 0 };
  private pointerDown = false;
  private pointerJust = false;
  private closing = 0;
  private readonly onPointerMove = (p: Phaser.Input.Pointer) => this.moveHand(p.x, p.y);
  private readonly onPointerDown = (p: Phaser.Input.Pointer) => {
    this.moveHand(p.x, p.y);
    this.pointerDown = true;
    this.pointerJust = true;
  };
  private readonly onPointerUp = () => { this.pointerDown = false; };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(spec: MiniGameSpec): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.closing = 0;
    this.g = this.scene.add.graphics().setDepth(DEPTH);
    drawPanel(this.g, X, Y, W, H, 10);
    // The close-up itself: a darker inset so the field reads as a window onto the row.
    const field = this.field;
    this.g.fillStyle(0x6b4423);
    this.g.fillRoundedRect(field.x - 4, field.y - 4, field.size + 8, field.size + 8, 6);
    this.g.fillStyle(0x9fc46a);
    this.g.fillRect(field.x, field.y, field.size, field.size);

    this.title = makeText(this.scene, X + 20, Y + 14, '', 22).setDepth(DEPTH + 1);
    this.instructions = makeText(this.scene, this.side.x, this.side.y, '', 15, COLORS.ink, { wordWrap: { width: this.side.w } }).setDepth(DEPTH + 1);
    this.feedback = makeText(this.scene, X + 20, Y + H - 54, '', 17, COLORS.accent).setDepth(DEPTH + 1);
    this.hint = makeText(this.scene, X + W / 2, Y + H - 22, 'Move the hand with the mouse or arrows · E / click to grab · Esc to stop', 13, COLORS.inkLight).setOrigin(0.5).setDepth(DEPTH + 1);

    this.hand = this.scene.add.image(0, 0, TEX.FARM, FARM_FRAME.HAND).setScale(3).setOrigin(3 / 16, 1 / 16).setDepth(DEPTH + 5);
    this.moveHand(field.x + field.size / 2, field.y + field.size * 0.6);

    this.scene.input.on('pointermove', this.onPointerMove);
    this.scene.input.on('pointerdown', this.onPointerDown);
    this.scene.input.on('pointerup', this.onPointerUp);

    const ctx: GameContext = {
      scene: this.scene,
      field,
      side: this.side,
      depth: DEPTH + 2,
      setFeedback: (text, color) => this.feedback?.setText(text).setColor(color ?? COLORS.accent),
      setInstructions: (text) => this.instructions?.setText(text),
      close: () => this.close(),
    };
    const titles = { watering: `Watering the ${spec.crop.name.toLowerCase()}`, weeding: `Weeding the ${spec.crop.name.toLowerCase()}`, harvest: `Picking the ${spec.crop.name.toLowerCase()}` };
    this.title.setText(titles[spec.kind]);
    if (spec.kind === 'watering') this.view = new WateringView(ctx, spec);
    else if (spec.kind === 'weeding') this.view = new WeedingView(ctx, spec);
    else this.view = new HarvestView(ctx, spec);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.view?.destroy();
    this.view = undefined;
    for (const o of [this.g, this.title, this.instructions, this.feedback, this.hint, this.hand]) o?.destroy();
    this.g = this.title = this.instructions = this.feedback = this.hint = undefined;
    this.hand = undefined;
    this.pointerDown = false;
    this.pointerJust = false;
  }

  update(dt: number, keys: { dx: number; dy: number; confirmDown: boolean; confirmJust: boolean; cancelJust: boolean }): void {
    if (!this.isOpen || !this.view) return;
    // Keyboard nudges the hand; the mouse simply places it.
    if (keys.dx !== 0 || keys.dy !== 0) {
      const len = Math.hypot(keys.dx, keys.dy);
      this.moveHand(this.handPos.x + (keys.dx / len) * HAND_SPEED * dt / 1000, this.handPos.y + (keys.dy / len) * HAND_SPEED * dt / 1000);
    }
    const input: GameInput = {
      dx: keys.dx,
      dy: keys.dy,
      confirmDown: keys.confirmDown || this.pointerDown,
      confirmJust: keys.confirmJust || this.pointerJust,
      cancelJust: keys.cancelJust,
    };
    this.pointerJust = false;
    this.view.update(dt, input, this.handPos);

    // Give the last outcome a beat to land before the popup goes.
    if (this.view.finished) {
      this.closing += dt;
      if (this.closing > 700) this.close();
    }
  }

  private get field(): Field {
    return { x: X + 20, y: Y + 52, size: FIELD };
  }

  private get side(): { x: number; y: number; w: number; h: number } {
    return { x: X + 20 + FIELD + 24, y: Y + 56, w: W - FIELD - 64, h: FIELD };
  }

  private moveHand(x: number, y: number): void {
    const f = this.field;
    // Keep the fingertip within a small margin of the panel so it cannot wander off.
    this.handPos.x = Math.max(X + 8, Math.min(X + W - 8, x));
    this.handPos.y = Math.max(f.y - 8, Math.min(Y + H - 8, y));
    this.hand?.setPosition(this.handPos.x, this.handPos.y);
  }
}
