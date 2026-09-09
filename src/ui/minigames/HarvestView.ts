import Phaser from 'phaser';
import { TEX } from '../../config/keys';
import { Sfx } from '../../core/Sfx';
import { HarvestModel, type Piece } from '../../systems/minigames/HarvestModel';
import { COLORS, makeText } from '../Panel';
import type { GameContext, GameInput, GameView, MiniGameSpec } from './MiniGameHost';

type Spec = Extract<MiniGameSpec, { kind: 'harvest' }>;

const GREEN = Phaser.Display.Color.ValueToColor('#6aa855');

/**
 * Harvesting as it is actually done: look the plant over for what is ready, take hold,
 * and ease it off with a steady pull. Ripe pieces are full-coloured and plump; under-ripe
 * ones still carry green at the shoulder; over-ripe ones have gone dull and spotted.
 * There is no clock - only judgement, and not yanking.
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
  private wasDown = false;
  private hand = { x: 0, y: 0 };

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
    const where = spec.crop.fruitAt === 'top' ? 'on the plant' : 'showing along the row';
    ctx.setInstructions(`Look over what is ${where}. Full colour and plump is ready; green at the shoulder is not; dull and spotted has gone over.\n\nHold on a ready one and pull steady - let go as it comes free. Yank and it snaps; grab green and it bruises. Leave the rest ${spec.crop.fruitAt === 'top' ? 'on the plant' : 'in the ground'}.`);
    ctx.setFeedback(spec.params.ripe === 0 ? 'Nothing here is ready.' : '', COLORS.inkLight);
    this.refreshTally();
    this.draw();
  }

  private get modelRipeTotal(): number {
    return this.spec.params.ripe;
  }

  update(dt: number, input: GameInput, hand: { x: number; y: number }): void {
    this.hand = hand;
    if (this.finished) {
      this.animate(dt);
      this.draw();
      return;
    }
    if (input.cancelJust) {
      // Nothing picked yet: leave the plant as it was. Otherwise, take what you have.
      if (this.model.picked === 0) {
        this.spec.onCancel?.();
        this.ctx.close();
      } else {
        this.settle();
      }
      return;
    }

    const down = input.confirmDown;
    if (down && !this.wasDown) {
      const grabbed = this.model.grab(this.fx(hand.x), this.fy(hand.y));
      if (grabbed === 'held') Sfx.play('tick');
    }
    const snapped = this.model.update(dt / 1000);
    if (snapped === 'snapped') this.report('snapped');
    if (!down && this.wasDown) this.report(this.model.release());
    this.wasDown = down;

    if (this.model.done) this.settle();
    this.animate(dt);
    this.draw();
  }

  destroy(): void {
    this.g.destroy();
    this.plant.destroy();
    this.tally.destroy();
    this.popTexts.forEach((t) => t.destroy());
  }

  private report(outcome: ReturnType<HarvestModel['release']>): void {
    const notes = {
      picked: ['+1', '#3d7a2c', 'Came away clean.', 'pluck'],
      early: ['', COLORS.inkLight, 'Not free yet - keep a steady pull on it.', null],
      snapped: ['snapped', COLORS.accent, 'Too hard - the stem snapped and that one is lost.', 'bruise'],
      unripe: ['bruised', COLORS.accent, 'That one was still green. It bruised coming off.', 'bruise'],
      over: ['gone', COLORS.accent, 'Gone over - it came away as mush.', 'dull'],
      nothing: ['', COLORS.inkLight, '', null],
    } as const;
    const [pop, color, line, sound] = notes[outcome];
    if (pop) this.pops.push({ x: this.hand.x, y: this.hand.y - 10, t: 0, text: pop, color });
    if (line) this.ctx.setFeedback(line, color);
    if (sound) Sfx.play(sound);
    this.refreshTally();
  }

  private settle(): void {
    this.finished = true;
    const n = this.model.picked;
    const all = n >= this.modelRipeTotal && this.modelRipeTotal > 0;
    const lost = this.model.pieces.filter((p) => p.state === 'lost').length;
    this.ctx.setFeedback(
      all && lost === 0 ? 'Every ready piece, clean. That is how it is done.' : n === 0 ? 'Nothing worth keeping.' : `${n} in the basket.`,
      all && lost === 0 ? '#3d7a2c' : COLORS.inkLight,
    );
    if (all && lost === 0) Sfx.play('good');
    this.spec.onDone(n);
  }

  private refreshTally(): void {
    const lost = this.model.pieces.filter((p) => p.state === 'lost').length;
    this.tally.setText(`Picked   ${this.model.picked} / ${this.modelRipeTotal} ready\nLost     ${lost}`);
  }

  private animate(dt: number): void {
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 700);
    this.popTexts.forEach((t) => t.destroy());
    this.popTexts = this.pops.map((p) =>
      makeText(this.ctx.scene, p.x, p.y - p.t * 0.05, p.text, 16, p.color, { stroke: '#3b2414', strokeThickness: 3 })
        .setOrigin(0.5).setDepth(this.ctx.depth + 4).setAlpha(1 - p.t / 700));
  }

  private draw(): void {
    const { field } = this.ctx;
    const g = this.g;
    g.clear();
    g.fillStyle(0x8a6038);
    g.fillRect(field.x, field.y + field.size * 0.78, field.size, field.size * 0.22);
    const hx = this.fx(this.hand.x);
    const hy = this.fy(this.hand.y);
    const live = this.model.pieces.filter((p) => p.state === 'onPlant');
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
    if (this.model.holding === p) {
      // The pull gauge: a ring that closes as the piece comes free, green through the window.
      const t = Math.min(1.3, this.model.tension);
      const w = this.spec.params.window;
      const inWindow = t >= 1 - w && t <= 1 + w;
      g.lineStyle(5, inWindow ? 0x7cc46a : 0xfff0c0, 0.95);
      g.beginPath();
      g.arc(x, y, r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t / (1 + w)), false);
      g.strokePath();
      // Tick marks for where the window is.
      g.lineStyle(2, 0x3d7a2c, 0.9);
      for (const k of [1 - w, 1 + w]) {
        const a = -Math.PI / 2 + Math.PI * 2 * (k / (1 + w));
        g.lineBetween(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7), x + Math.cos(a) * (r + 17), y + Math.sin(a) * (r + 17));
      }
      return;
    }
    if (hot) {
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(x, y, r + 10);
    }
  }

  private drawPiece(p: Piece): void {
    const g = this.g;
    const x = this.fieldX(p.x);
    // A held piece lifts a little with the pull.
    const lift = this.model.holding === p ? Math.min(1, this.model.tension) * 10 : 0;
    const y = this.fieldY(p.y) - lift;
    const base = this.ctx.field.size * 0.055;
    const r = p.ripeness === 'ripe' ? base * 1.08 : base * 0.92;
    const sub = this.spec.params.subtlety;

    // Stem.
    g.lineStyle(3, 0x3d6b2c);
    g.lineBetween(x, y - r, x + 3, y - r - 10 - lift);

    // Body colour by ripeness. Under-ripe is most of the way there - that is the judgement.
    let fill: number;
    if (p.ripeness === 'over') {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(this.ripe, Phaser.Display.Color.ValueToColor('#6b4a2e'), 100, 55);
      fill = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    } else if (p.ripeness === 'under') {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(GREEN, this.ripe, 100, Math.round(sub * 100));
      fill = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    } else {
      fill = this.ripe.color;
    }
    g.fillStyle(fill);
    g.fillCircle(x, y, r);
    g.fillStyle(p.ripeness === 'ripe' ? this.ripeDark : 0x000000, p.ripeness === 'ripe' ? 0.9 : 0.25);
    g.fillEllipse(x, y + r * 0.45, r * 1.3, r * 0.6);
    // Under-ripe keeps green at the shoulder; over-ripe carries spots.
    if (p.ripeness === 'under') {
      g.fillStyle(GREEN.color, 0.9);
      g.fillEllipse(x, y - r * 0.55, r * 1.1, r * 0.5);
    }
    if (p.ripeness === 'over') {
      g.fillStyle(0x3b2414, 0.7);
      for (const [dx, dy] of [[-0.3, -0.2], [0.35, 0.1], [0, 0.4]]) g.fillCircle(x + dx * r, y + dy * r, r * 0.16);
    }
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.3);
  }

  private fieldX(fx: number): number { return this.ctx.field.x + fx * this.ctx.field.size; }
  private fieldY(fy: number): number { return this.ctx.field.y + fy * this.ctx.field.size; }
  private fx(sx: number): number { return (sx - this.ctx.field.x) / this.ctx.field.size; }
  private fy(sy: number): number { return (sy - this.ctx.field.y) / this.ctx.field.size; }
}
