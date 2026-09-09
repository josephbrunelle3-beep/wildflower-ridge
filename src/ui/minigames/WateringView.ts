import Phaser from 'phaser';
import { TEX } from '../../config/keys';
import { WateringModel } from '../../systems/minigames/WateringModel';
import { COLORS, makeText } from '../Panel';
import type { GameContext, GameInput, GameView, MiniGameSpec } from './MiniGameHost';

type Spec = Extract<MiniGameSpec, { kind: 'watering' }>;

const BAR_W = 46;

/**
 * Hold to pour, let go in the green. The plant stands in the close-up with a bucket
 * tipping over it; the bar on the right is what you are actually watching.
 */
export class WateringView implements GameView {
  finished = false;
  private readonly ctx: GameContext;
  private readonly spec: Spec;
  private readonly model: WateringModel;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly plant: Phaser.GameObjects.Image;
  private readonly bucket: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bar: { x: number; y: number; h: number };
  private wasDown = false;
  private drops: { x: number; y: number; vy: number }[] = [];
  private settled = false;

  constructor(ctx: GameContext, spec: Spec) {
    this.ctx = ctx;
    this.spec = spec;
    this.model = new WateringModel(spec.params);
    const { field, side } = ctx;
    this.g = ctx.scene.add.graphics().setDepth(ctx.depth);
    this.bucket = ctx.scene.add.graphics().setDepth(ctx.depth + 2);
    this.plant = ctx.scene.add.image(field.x + field.size / 2, field.y + field.size * 0.78, TEX.FARM, spec.stageFrame)
      .setScale(6).setOrigin(0.5, 14 / 16).setDepth(ctx.depth + 1);
    this.bar = { x: side.x + side.w / 2 - BAR_W / 2, y: side.y + 30, h: side.h - 60 };
    this.label = makeText(ctx.scene, side.x + side.w / 2, side.y + 6, 'Hold to pour', 15, COLORS.inkLight).setOrigin(0.5, 0).setDepth(ctx.depth + 1);
    ctx.setInstructions('');
    ctx.setFeedback(`Hold E (or the mouse button) to pour. Let go in the green - ${describe(spec.params.zoneWidth)}.`, COLORS.inkLight);
    this.draw();
  }

  update(dt: number, input: GameInput): void {
    if (this.settled) return;
    const down = input.confirmDown;
    if (down && !this.wasDown) this.model.startPour();
    if (!down && this.wasDown && this.model.pouring) this.finish(this.model.stopPour());
    if (input.cancelJust) {
      if (this.model.pouring) this.finish(this.model.stopPour());
      else {
        this.spec.onCancel?.();
        this.ctx.close();
        return;
      }
    }
    this.wasDown = down;

    this.model.update(dt / 1000);
    if (this.model.done && !this.settled) this.finish(this.model.verdict);

    // Water falling from the bucket while it is tipped.
    if (this.model.pouring) {
      const { field } = this.ctx;
      for (let i = 0; i < 3; i++) this.drops.push({ x: field.x + field.size / 2 + 18 + Math.random() * 14, y: field.y + field.size * 0.36, vy: 120 + Math.random() * 80 });
    }
    for (const d of this.drops) d.y += d.vy * dt / 1000;
    this.drops = this.drops.filter((d) => d.y < this.ctx.field.y + this.ctx.field.size * 0.78);
    this.draw();
  }

  destroy(): void {
    this.g.destroy();
    this.bucket.destroy();
    this.plant.destroy();
    this.label.destroy();
  }

  private finish(verdict: ReturnType<WateringModel['stopPour']>): void {
    if (this.settled || !verdict) return;
    this.settled = true;
    this.finished = true;
    const lines = {
      perfect: ['Just right.', '#3d7a2c'],
      under: ['Not enough - the soil is still dry underneath.', COLORS.accent],
      over: ['Too much - the roots are sitting in mud.', COLORS.accent],
    } as const;
    this.ctx.setFeedback(lines[verdict][0], lines[verdict][1]);
    this.spec.onDone(verdict);
  }

  private draw(): void {
    const { field } = this.ctx;
    const m = this.model;
    const g = this.g;
    g.clear();

    // Ground under the plant, then the bar.
    g.fillStyle(m.level > 0 ? 0x5f4026 : 0x8a6038);
    g.fillRect(field.x, field.y + field.size * 0.78, field.size, field.size * 0.22);
    // Wet patch spreads with the pour.
    if (m.level > 0) {
      g.fillStyle(0x4a301c, 0.9);
      const w = field.size * (0.2 + m.level * 0.7);
      g.fillRect(field.x + field.size / 2 - w / 2, field.y + field.size * 0.78, w, field.size * 0.22);
    }

    const { x, y, h } = this.bar;
    g.fillStyle(COLORS.meterBg);
    g.fillRoundedRect(x - 3, y - 3, BAR_W + 6, h + 6, 6);
    g.fillStyle(0xe6d0a0);
    g.fillRect(x, y, BAR_W, h);
    // Sweet spot, measured from the bottom.
    const zoneTop = y + h - m.zoneHi * h;
    const zoneH = (m.zoneHi - m.zoneLo) * h;
    g.fillStyle(0x7cc46a);
    g.fillRect(x, zoneTop, BAR_W, zoneH);
    g.lineStyle(2, 0x3d7a2c);
    g.strokeRect(x, zoneTop, BAR_W, zoneH);
    // The water.
    const fillH = m.level * h;
    g.fillStyle(0x3d86c4, 0.85);
    g.fillRect(x + 3, y + h - fillH, BAR_W - 6, fillH);
    g.fillStyle(0x5aa3dd);
    g.fillRect(x + 3, y + h - fillH, BAR_W - 6, Math.min(3, fillH));

    // Falling drops.
    g.fillStyle(0x5aa3dd);
    for (const d of this.drops) g.fillRect(d.x, d.y, 3, 6);

    // The bucket, tipping as it pours.
    const b = this.bucket;
    b.clear();
    const bx = field.x + field.size / 2 + 34;
    const by = field.y + field.size * 0.3;
    b.save();
    b.translateCanvas(bx, by);
    b.rotateCanvas(m.pouring ? -0.9 : -0.25);
    b.fillStyle(0x6b6b63);
    b.fillRect(-16, -14, 32, 28);
    b.fillStyle(0x8a8a80);
    b.fillRect(-16, -14, 32, 4);
    b.lineStyle(3, 0x4f4f48);
    b.strokeRect(-16, -14, 32, 28);
    b.restore();
  }
}

function describe(width: number): string {
  return width >= 0.22 ? 'a wide mark, this one is easy going' : width >= 0.16 ? 'a fair mark' : 'a narrow mark, this one is fussy';
}
