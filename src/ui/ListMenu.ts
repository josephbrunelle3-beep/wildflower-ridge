import Phaser from 'phaser';
import { COLORS, makeText } from './Panel';

export interface MenuOption {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

/** Vertical keyboard-and-mouse menu used by the care menu, pause menu and dialogue choices. */
export class ListMenu {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private options: MenuOption[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private index = 0;
  private readonly lineHeight: number;
  private readonly fontSize: number;

  constructor(scene: Phaser.Scene, x: number, y: number, lineHeight = 30, fontSize = 20) {
    this.scene = scene;
    this.lineHeight = lineHeight;
    this.fontSize = fontSize;
    this.container = scene.add.container(x, y);
  }

  setOptions(options: MenuOption[], keepIndex = true): void {
    this.options = options;
    this.texts.forEach((t) => t.destroy());
    this.texts = options.map((o, i) => {
      const t = makeText(this.scene, 0, i * this.lineHeight, o.label, this.fontSize);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (!o.disabled) { this.index = i; this.refresh(); } });
      t.on('pointerdown', () => { if (!o.disabled) { this.index = i; this.refresh(); o.onSelect(); } });
      this.container.add(t);
      return t;
    });
    if (!keepIndex || this.index >= options.length || options[this.index]?.disabled) this.index = this.firstEnabled();
    this.refresh();
  }

  move(dir: number): void {
    const n = this.options.length;
    if (!n) return;
    let i = this.index;
    for (let tries = 0; tries < n; tries++) {
      i = (i + dir + n) % n;
      if (!this.options[i].disabled) break;
    }
    this.index = i;
    this.refresh();
  }

  select(): void {
    const o = this.options[this.index];
    if (o && !o.disabled) o.onSelect();
  }

  get height(): number {
    return this.options.length * this.lineHeight;
  }

  destroy(): void {
    this.container.destroy();
  }

  private firstEnabled(): number {
    const i = this.options.findIndex((o) => !o.disabled);
    return i < 0 ? 0 : i;
  }

  private refresh(): void {
    this.texts.forEach((t, i) => {
      const o = this.options[i];
      const sel = i === this.index;
      t.setText(`${sel ? '▸ ' : '   '}${o.label}`);
      t.setColor(o.disabled ? '#9c8a6a' : sel ? COLORS.accent : COLORS.ink);
    });
  }
}
