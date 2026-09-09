import Phaser from 'phaser';
import { TEX } from '../../config/keys';
import { FARM_FRAME_H, PLANT_BASE } from '../../gfx/CropTextures';
import { Sfx } from '../../core/Sfx';
import { WateringModel } from '../../systems/minigames/WateringModel';
import { COLORS, makeText } from '../Panel';
import type { GameContext, GameInput, GameView, MiniGameSpec } from './MiniGameHost';

type Spec = Extract<MiniGameSpec, { kind: 'watering' }>;

/** Where the soil surface sits in the close-up, and how far down the profile goes. */
const SURFACE = 0.3;

/**
 * Watering the way it is actually judged: by how far down the water has soaked. The
 * close-up is a cut through the soil - the plant on top, its roots reaching down - and
 * pouring sends a dark wet front sinking through it. Stop when the front reaches the root
 * tips. Stop short and the roots stay dry; keep going and the profile waterlogs.
 */
export class WateringView implements GameView {
  finished = false;
  private readonly ctx: GameContext;
  private readonly spec: Spec;
  private readonly model: WateringModel;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly plant: Phaser.GameObjects.Image;
  private readonly bucket: Phaser.GameObjects.Graphics;
  private readonly depthLabel: Phaser.GameObjects.Text;
  private wasDown = false;
  private drops: { x: number; y: number; vy: number }[] = [];
  private settled = false;
  private pulse = 0;

  constructor(ctx: GameContext, spec: Spec) {
    this.ctx = ctx;
    this.spec = spec;
    this.model = new WateringModel(spec.params);
    const { field } = ctx;
    this.g = ctx.scene.add.graphics().setDepth(ctx.depth);
    this.bucket = ctx.scene.add.graphics().setDepth(ctx.depth + 2);
    this.plant = ctx.scene.add.image(field.x + field.size / 2, field.y + field.size * SURFACE, TEX.FARM, spec.stageFrame)
      .setScale(5).setOrigin(0.5, PLANT_BASE / FARM_FRAME_H).setDepth(ctx.depth + 1);
    this.depthLabel = makeText(ctx.scene, field.x + field.size - 6, field.y + field.size * SURFACE + 4, '', 12, '#fff0c0').setOrigin(1, 0).setDepth(ctx.depth + 3);
    const depth = spec.params.rootDepth;
    const how = depth < 0.35 ? 'shallow' : depth < 0.55 ? 'middling' : 'deep';
    ctx.setInstructions(`A cut through the row. The roots reach ${how} today; the band marks where they drink.\n\nHold to pour and watch the wet front sink. Let go when it reaches the root tips. Short, and the roots stay dry. Long, and the soil waterlogs.`);
    ctx.setFeedback('', COLORS.inkLight);
    this.draw();
  }

  update(dt: number, input: GameInput): void {
    this.pulse += dt;
    if (this.settled) {
      this.animate(dt);
      this.draw();
      return;
    }
    const down = input.confirmDown;
    if (down && !this.wasDown) {
      this.model.startPour();
      Sfx.startPour();
    }
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

    if (this.model.pouring) {
      const { field } = this.ctx;
      for (let i = 0; i < 3; i++) this.drops.push({ x: field.x + field.size / 2 + 20 + Math.random() * 14, y: field.y + field.size * 0.06, vy: 140 + Math.random() * 80 });
    }
    this.animate(dt);
    this.draw();
  }

  destroy(): void {
    Sfx.stopPour();
    this.g.destroy();
    this.bucket.destroy();
    this.plant.destroy();
    this.depthLabel.destroy();
  }

  private animate(dt: number): void {
    for (const d of this.drops) d.y += d.vy * dt / 1000;
    this.drops = this.drops.filter((d) => d.y < this.ctx.field.y + this.ctx.field.size * SURFACE);
  }

  private finish(verdict: ReturnType<WateringModel['stopPour']>): void {
    if (this.settled || !verdict) return;
    this.settled = true;
    this.finished = true;
    Sfx.stopPour();
    const lines = {
      perfect: ['Soaked right down to the roots.', '#3d7a2c', 'good'],
      under: ['Only the top is wet. The roots are still dry underneath.', COLORS.accent, 'dull'],
      over: ['Waterlogged. The roots are sitting in mud.', COLORS.accent, 'splash'],
    } as const;
    this.ctx.setFeedback(lines[verdict][0], lines[verdict][1]);
    Sfx.play(lines[verdict][2]);
    this.spec.onDone(verdict);
  }

  private draw(): void {
    const { field } = this.ctx;
    const m = this.model;
    const g = this.g;
    g.clear();

    const top = field.y + field.size * SURFACE;
    const profile = field.size * (1 - SURFACE);
    const depthY = (fraction: number) => top + fraction * profile;

    // Dry soil, with a faint layering so depth reads as depth.
    g.fillStyle(0xa1734a);
    g.fillRect(field.x, top, field.size, profile);
    g.fillStyle(0x8a6038, 0.6);
    for (let i = 1; i < 8; i++) g.fillRect(field.x, depthY(i / 8), field.size, 2);
    // A few stones.
    g.fillStyle(0x8f8b82);
    for (const [fx, fy] of [[0.12, 0.55], [0.8, 0.35], [0.9, 0.8], [0.2, 0.9]]) g.fillEllipse(field.x + fx * field.size, depthY(fy), 10, 6);

    // The wet front sinking from the surface.
    if (m.level > 0) {
      const wetH = m.level * profile;
      g.fillStyle(0x5f4026);
      g.fillRect(field.x, top, field.size, wetH);
      // A ragged edge, so it reads as water finding its way down and not a bar.
      g.fillStyle(0x5f4026);
      for (let i = 0; i < 12; i++) {
        const fx = field.x + (i + 0.5) * (field.size / 12);
        const wobble = 3 + 5 * Math.abs(Math.sin(i * 1.7 + this.pulse / 400));
        g.fillEllipse(fx, top + wetH, field.size / 12 + 4, wobble * 2);
      }
      // Puddling on the surface once the ground is past taking it.
      if (m.level > m.zoneHi) {
        g.fillStyle(0x3d86c4, 0.75);
        g.fillEllipse(field.x + field.size / 2, top - 2, field.size * 0.6 * Math.min(1, (m.level - m.zoneHi) * 4 + 0.3), 8);
      }
    }

    // The roots, drawn to today's depth.
    const rx = field.x + field.size / 2;
    g.lineStyle(3, 0xe8dcc0, 0.95);
    const tip = depthY(m.rootDepth);
    g.lineBetween(rx, top, rx + 2, tip);
    for (let i = 1; i <= 4; i++) {
      const y0 = top + (tip - top) * (i / 5);
      const side = i % 2 === 0 ? 1 : -1;
      g.lineStyle(2, 0xe8dcc0, 0.85);
      g.lineBetween(rx, y0, rx + side * (18 + i * 4), y0 + 16 + i * 3);
      g.lineBetween(rx + side * (18 + i * 4), y0 + 16 + i * 3, rx + side * (26 + i * 5), y0 + 22 + i * 4);
    }

    // The band the front should stop in - where the roots drink.
    const zTop = depthY(m.zoneLo);
    const zBot = depthY(m.zoneHi);
    g.fillStyle(0x7cc46a, 0.28);
    g.fillRect(field.x, zTop, field.size, zBot - zTop);
    g.lineStyle(2, 0x9fd68a, 0.9);
    g.lineBetween(field.x, zTop, field.x + field.size, zTop);
    g.lineBetween(field.x, zBot, field.x + field.size, zBot);
    this.depthLabel.setPosition(field.x + field.size - 6, zTop - 16).setText('roots');

    // Grass line at the surface.
    g.fillStyle(0x6a9c4a);
    g.fillRect(field.x, top - 4, field.size, 5);

    // Falling water.
    g.fillStyle(0x5aa3dd);
    for (const d of this.drops) g.fillRect(d.x, d.y, 3, 7);

    // The bucket, tipping as it pours.
    const b = this.bucket;
    b.clear();
    const bx = field.x + field.size / 2 + 40;
    const by = field.y + field.size * 0.07;
    b.save();
    b.translateCanvas(bx, by);
    b.rotateCanvas(m.pouring ? -0.95 : -0.25);
    b.fillStyle(0x6b6b63);
    b.fillRect(-16, -14, 32, 28);
    b.fillStyle(0x8a8a80);
    b.fillRect(-16, -14, 32, 4);
    b.lineStyle(3, 0x4f4f48);
    b.strokeRect(-16, -14, 32, 28);
    b.restore();
  }
}
