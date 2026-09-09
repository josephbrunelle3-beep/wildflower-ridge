import Phaser from 'phaser';
import { TEX } from '../../config/keys';
import { HarvestModel, type Piece } from '../../systems/minigames/HarvestModel';
import { COLORS, makeText } from '../Panel';
import type { GameContext, GameInput, GameView, MiniGameSpec } from './MiniGameHost';

type Spec = Extract<MiniGameSpec, { kind: 'harvest' }>;

const GREEN = Phaser.Display.Color.ValueToColor('#6aa855');
const OVER = 0x7a5a3a;

/**
 * Pick each piece while it is ripe. They colour up one after another and hold for a
 * moment; a piece picked green bruises, and one left too long goes over.
 */
export class HarvestView implements GameView {
  finished = false;
  private readonly ctx: GameContext;
  private readonly spec: Spec;
  private readonly model: HarvestModel;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly plant: Phaser.GameObjects.Image;
  private readonly tally: Phaser.GameObjects.Text;
  private readonly ripe: Phaser.Display.Color;
  private readonly ripeDark: number;
  private pops: { x: number; y: number; t: number; text: string; color: string }[] = [];
  private popTexts: Phaser.GameObjects.Text[] = [];
  private pulse = 0;

  constructor(ctx: GameContext, spec: Spec) {
    this.ctx = ctx;
    this.spec = spec;
    this.model = new HarvestModel(spec.params, spec.crop.fruitAt);
    this.ripe = Phaser.Display.Color.ValueToColor(spec.crop.fruit);
    this.ripeDark = Phaser.Display.Color.ValueToColor(spec.crop.fruitDark).color;
    const { field, side } = ctx;
    this.g = ctx.scene.add.graphics().setDepth(ctx.depth);
    this.plant = ctx.scene.add.image(field.x + field.size / 2, field.y + field.size * 0.78, TEX.FARM, spec.stageFrame)
      .setScale(5).setOrigin(0.5, 14 / 16).setDepth(ctx.depth + 1);
    // The close-up shows the pieces themselves, so the sprite's own fruit would double up.
    this.plant.setAlpha(0.55);
    this.tally = makeText(ctx.scene, side.x, side.y + 182, '', 17).setDepth(ctx.depth + 1);
    const where = spec.crop.fruitAt === 'top' ? 'on the plant' : 'along the row';
    ctx.setInstructions(`Watch the pieces ${where}. Each one colours up, holds ripe for a moment, then goes over.\n\nGrab it while it is bright. Green bruises; brown is lost.`);
    ctx.setFeedback('', COLORS.inkLight);
    this.refreshTally();
    this.draw();
  }

  update(dt: number, input: GameInput, hand: { x: number; y: number }): void {
    this.pulse += dt;
    if (this.finished) {
      this.animate(dt);
      this.draw(hand);
      return;
    }
    if (input.cancelJust) {
      this.spec.onCancel?.();
      this.ctx.close();
      return;
    }
    this.model.update(dt / 1000);
    if (input.confirmJust) {
      const outcome = this.model.pick(this.fx(hand.x), this.fy(hand.y));
      const notes = {
        picked: ['+1', '#3d7a2c', 'Into the basket.'],
        early: ['bruised', COLORS.accent, 'Too soon - that one is bruised.'],
        late: ['gone', COLORS.accent, 'Too late - it went over.'],
        miss: ['', COLORS.inkLight, ''],
      } as const;
      const [pop, color, line] = notes[outcome];
      if (pop) this.pops.push({ x: hand.x, y: hand.y - 10, t: 0, text: pop, color });
      if (line) this.ctx.setFeedback(line, color);
      this.refreshTally();
    }
    if (this.model.done) {
      this.finished = true;
      const n = this.model.picked;
      const all = n >= this.model.pieces.length;
      this.ctx.setFeedback(all ? 'Every piece, clean. That is how it is done.' : n === 0 ? 'Nothing worth keeping.' : `${n} in the basket.`, all ? '#3d7a2c' : COLORS.inkLight);
      this.spec.onDone(n);
    }
    this.animate(dt);
    this.draw(hand);
  }

  destroy(): void {
    this.g.destroy();
    this.plant.destroy();
    this.tally.destroy();
    this.popTexts.forEach((t) => t.destroy());
  }

  private refreshTally(): void {
    const lost = this.model.pieces.filter((p) => p.state === 'over' || p.state === 'bruised').length;
    this.tally.setText(`Picked   ${this.model.picked} / ${this.model.pieces.length}\nLost     ${lost}`);
  }

  private animate(dt: number): void {
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 700);
    this.popTexts.forEach((t) => t.destroy());
    this.popTexts = this.pops.map((p) =>
      makeText(this.ctx.scene, p.x, p.y - p.t * 0.05, p.text, 16, p.color, { stroke: '#3b2414', strokeThickness: 3 })
        .setOrigin(0.5).setDepth(this.ctx.depth + 4).setAlpha(1 - p.t / 700));
  }

  private draw(hand?: { x: number; y: number }): void {
    const { field } = this.ctx;
    const g = this.g;
    g.clear();
    g.fillStyle(0x8a6038);
    g.fillRect(field.x, field.y + field.size * 0.78, field.size, field.size * 0.22);
    const hx = hand ? this.fx(hand.x) : -1;
    const hy = hand ? this.fy(hand.y) : -1;
    const live = this.model.pieces.filter((p) => p.state !== 'picked');
    for (const p of live) this.drawPiece(p);
    // Roots show their shoulders above the soil and no more: the ground is painted back
    // over their lower halves, and only then do the rings go on top.
    if (this.spec.crop.fruitAt === 'ground') {
      g.fillStyle(0x8a6038);
      g.fillRect(field.x, field.y + field.size * 0.78, field.size, field.size * 0.22);
    }
    for (const p of live) this.drawRings(p, Math.hypot(p.x - hx, p.y - hy) <= this.spec.params.pickRadius);
  }

  private drawRings(p: Piece, hot: boolean): void {
    const g = this.g;
    const x = this.fieldX(p.x);
    const y = this.fieldY(p.y);
    const r = this.ctx.field.size * 0.055;
    // Ripe pieces glow with a pulsing ring, so the moment is unmistakable.
    if (p.state === 'ripe') {
      const k = 0.5 + 0.5 * Math.sin(this.pulse / 90);
      g.lineStyle(3, 0xfff0c0, 0.5 + k * 0.5);
      g.strokeCircle(x, y, r + 5 + k * 3);
    }
    if (hot) {
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(x, y, r + 10);
    }
  }

  private drawPiece(p: Piece): void {
    const g = this.g;
    const x = this.fieldX(p.x);
    const y = this.fieldY(p.y);
    const r = this.ctx.field.size * 0.055;
    let fill: number;
    if (p.state === 'over') fill = OVER;
    else if (p.state === 'bruised') fill = 0x4a3a2a;
    else {
      const t = this.model.ripeness(p);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(GREEN, this.ripe, 100, Math.round(t * 100));
      fill = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    }
    // A stem so a piece reads as growing rather than floating.
    g.lineStyle(3, 0x3d6b2c);
    g.lineBetween(x, y - r, x + 3, y - r - 10);
    g.fillStyle(fill);
    g.fillCircle(x, y, r);
    g.fillStyle(p.state === 'ripe' ? this.ripeDark : 0x000000, p.state === 'ripe' ? 0.9 : 0.25);
    g.fillEllipse(x, y + r * 0.45, r * 1.3, r * 0.6);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.3);
    if (p.state === 'bruised') {
      g.lineStyle(3, 0x1b1610);
      g.lineBetween(x - r * 0.5, y - r * 0.5, x + r * 0.5, y + r * 0.5);
      g.lineBetween(x + r * 0.5, y - r * 0.5, x - r * 0.5, y + r * 0.5);
    }
  }

  private fieldX(fx: number): number { return this.ctx.field.x + fx * this.ctx.field.size; }
  private fieldY(fy: number): number { return this.ctx.field.y + fy * this.ctx.field.size; }
  private fx(sx: number): number { return (sx - this.ctx.field.x) / this.ctx.field.size; }
  private fy(sy: number): number { return (sy - this.ctx.field.y) / this.ctx.field.size; }
}
