import Phaser from 'phaser';
import { TEX } from '../../config/keys';
import { PLANT_X, SOIL_Y, WeedingModel, type Weed } from '../../systems/minigames/WeedingModel';
import { COLORS, makeText } from '../Panel';
import type { GameContext, GameInput, GameView, MiniGameSpec } from './MiniGameHost';

type Spec = Extract<MiniGameSpec, { kind: 'weeding' }>;

const WEED = 0x7d8a3c;
const WEED_DARK = 0x5b662a;
const WEED_LIGHT = 0x9aa84e;
const ROOT = 0x8a6a3c;

/**
 * Pull the weeds by the base, not the plant. Each weed shows its root clump at the soil
 * line; that clump is the only grab that pulls it. Grab the stalk and it snaps and stays;
 * grab the crop and you tear a leaf, which costs the plant its prize.
 */
export class WeedingView implements GameView {
  finished = false;
  private readonly ctx: GameContext;
  private readonly spec: Spec;
  private readonly model: WeedingModel;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly plant: Phaser.GameObjects.Image;
  private readonly tally: Phaser.GameObjects.Text;
  private shake = 0;
  private flyaways: { x: number; y: number; vy: number; t: number }[] = [];

  constructor(ctx: GameContext, spec: Spec) {
    this.ctx = ctx;
    this.spec = spec;
    this.model = new WeedingModel(spec.params);
    const { side } = ctx;
    this.g = ctx.scene.add.graphics().setDepth(ctx.depth);
    // Bare soil has no crop in the close-up: the weeds are the whole picture.
    this.plant = ctx.scene.add.image(this.sx(PLANT_X), this.sy(SOIL_Y), TEX.FARM, Math.max(0, spec.stageFrame))
      .setScale(5).setOrigin(0.5, 14 / 16).setDepth(ctx.depth + 1).setVisible(spec.stageFrame >= 0);
    this.tally = makeText(ctx.scene, side.x, side.y + 182, '', 17).setDepth(ctx.depth + 1);
    ctx.setInstructions(spec.stageFrame >= 0
      ? 'Grab each weed where it meets the soil - the dark clump at its foot - and it comes out roots and all.\n\nGrab the stalk and it snaps off short. Grab the crop and you tear a leaf.'
      : 'Grab each weed where it meets the soil - the dark clump at its foot - and it comes out roots and all.\n\nGrab the stalk and it snaps off short.');
    ctx.setFeedback('', COLORS.inkLight);
    this.refreshTally();
    this.draw();
  }

  update(dt: number, input: GameInput, hand: { x: number; y: number }): void {
    if (this.finished) {
      this.animate(dt);
      this.draw(hand);
      return;
    }
    if (input.cancelJust) {
      this.settle();
      return;
    }
    if (input.confirmJust) {
      const outcome = this.model.grab(this.fx(hand.x), this.fy(hand.y));
      switch (outcome) {
        case 'pulled':
          this.flyaways.push({ x: hand.x, y: hand.y, vy: -220, t: 0 });
          this.ctx.setFeedback('Out it comes, roots and all.', '#3d7a2c');
          break;
        case 'snapped':
          this.ctx.setFeedback('Snapped off - it will grow back. Go for the base.', COLORS.accent);
          break;
        case 'plant':
          this.shake = 320;
          this.ctx.setFeedback("That's the crop! You tore a leaf.", COLORS.accent);
          break;
        default:
          this.ctx.setFeedback('Nothing there but soil.', COLORS.inkLight);
      }
      this.refreshTally();
      if (this.model.done) this.settle();
    }
    this.animate(dt);
    this.draw(hand);
  }

  destroy(): void {
    this.g.destroy();
    this.plant.destroy();
    this.tally.destroy();
  }

  private settle(): void {
    this.finished = true;
    const pulled = this.model.weeds.filter((w) => w.pulled).length;
    if (this.model.done) this.ctx.setFeedback(this.model.damage > 0 ? 'Clear, but the crop took some tearing.' : 'Clear. The row can breathe.', '#3d7a2c');
    else this.ctx.setFeedback(`You leave ${this.model.remaining} standing.`, COLORS.inkLight);
    this.spec.onDone({ pulled, remaining: this.model.remaining, damage: this.model.damage });
  }

  private refreshTally(): void {
    const total = this.model.weeds.length;
    const pulled = total - this.model.remaining;
    const torn = this.model.damage;
    this.tally.setText(`Weeds pulled  ${pulled} / ${total}\nLeaves torn   ${torn}`);
  }

  private animate(dt: number): void {
    this.shake = Math.max(0, this.shake - dt);
    this.plant.setX(this.sx(PLANT_X) + (this.shake > 0 ? Math.sin(this.shake / 18) * 4 : 0));
    for (const f of this.flyaways) {
      f.t += dt;
      f.y += f.vy * dt / 1000;
      f.vy += 500 * dt / 1000;
    }
    this.flyaways = this.flyaways.filter((f) => f.t < 600);
  }

  private draw(hand?: { x: number; y: number }): void {
    const { field } = this.ctx;
    const g = this.g;
    const { baseRadius } = this.spec.params;
    g.clear();

    // Soil line and the ground below it.
    g.fillStyle(0x8a6038);
    g.fillRect(field.x, this.sy(SOIL_Y), field.size, field.y + field.size - this.sy(SOIL_Y));
    g.fillStyle(0x6f4a29);
    for (let i = 0; i < 4; i++) g.fillRect(field.x, this.sy(SOIL_Y) + 12 + i * 14, field.size, 2);

    const hx = hand ? this.fx(hand.x) : -1;
    const hy = hand ? this.fy(hand.y) : -1;
    for (const w of this.model.weeds) {
      if (w.pulled) continue;
      this.drawWeed(w, Math.hypot(w.x - hx, w.baseY - hy) <= baseRadius, baseRadius);
    }

    // Weeds on their way out of the frame.
    g.fillStyle(WEED);
    for (const f of this.flyaways) {
      g.fillRect(f.x - 2, f.y - 18, 4, 22);
      g.fillStyle(ROOT);
      g.fillRect(f.x - 5, f.y, 10, 5);
      g.fillStyle(WEED);
    }
  }

  private drawWeed(w: Weed, hot: boolean, baseRadius: number): void {
    const g = this.g;
    const x = this.sx(w.x);
    const base = this.sy(w.baseY);
    const top = this.sy(w.topY);
    // Stalk with leaves either side, thinner near the top.
    g.lineStyle(4, WEED_DARK);
    g.lineBetween(x, base, x + 3, top);
    g.lineStyle(2, WEED_LIGHT);
    g.lineBetween(x - 1, base - 4, x + 2, top + 4);
    const h = base - top;
    for (let i = 1; i <= 3; i++) {
      const ly = base - (h * i) / 4;
      const side = i % 2 === 0 ? 1 : -1;
      g.fillStyle(WEED);
      g.fillEllipse(x + side * 9, ly, 16, 6);
      g.fillStyle(WEED_DARK);
      g.fillEllipse(x + side * 11, ly + 1, 7, 3);
    }
    // Seed head.
    g.fillStyle(0xd6cf6a);
    g.fillCircle(x + 3, top - 2, 4);
    // The root clump: the grab target. Brighter when the hand is over it.
    const r = baseRadius * this.ctx.field.size;
    g.fillStyle(hot ? 0xb08a52 : ROOT, hot ? 1 : 0.9);
    g.fillEllipse(x, base + 2, r * 1.6, r * 0.9);
    g.fillStyle(0x5c3c22);
    g.fillEllipse(x, base + 4, r * 0.9, r * 0.4);
    if (hot) {
      g.lineStyle(2, 0xfff0c0, 0.9);
      g.strokeEllipse(x, base + 2, r * 1.8, r * 1.1);
    }
  }

  private sx(fx: number): number { return this.ctx.field.x + fx * this.ctx.field.size; }
  private sy(fy: number): number { return this.ctx.field.y + fy * this.ctx.field.size; }
  private fx(sx: number): number { return (sx - this.ctx.field.x) / this.ctx.field.size; }
  private fy(sy: number): number { return (sy - this.ctx.field.y) / this.ctx.field.size; }
}
