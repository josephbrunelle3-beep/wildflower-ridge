import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/keys';
import { ListMenu } from './ListMenu';
import { COLORS, drawPanel, makeText } from './Panel';

export interface ShopRow {
  label: string;
  /** Right-hand column: a price, a count, a season. */
  detail?: string;
  disabled?: boolean;
  /** Return false to close the menu after choosing; anything else keeps it open. */
  onSelect: () => boolean | void;
}

export interface ShopSpec {
  title: string;
  subtitle?: string;
  rows: ShopRow[];
  /** Rebuilt after every choice, so prices and counts stay live. */
  refresh?: () => ShopSpec;
}

const W = 440;
const X = (GAME_WIDTH - W) / 2;

/**
 * The list-with-prices panel behind the seed crate, the shipping crate and sowing a row.
 * Deliberately generic: it takes rows and callbacks, and knows nothing about farming.
 */
export class ShopMenu {
  isOpen = false;
  private readonly scene: Phaser.Scene;
  private spec?: ShopSpec;
  private g?: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private details: Phaser.GameObjects.Text[] = [];
  private menu?: ListMenu;
  private hint?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(spec: ShopSpec): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.spec = spec;
    this.g = this.scene.add.graphics().setDepth(30);
    this.title = makeText(this.scene, X + W / 2, 0, '', 24).setOrigin(0.5, 0).setDepth(31);
    this.subtitle = makeText(this.scene, X + W / 2, 0, '', 15, COLORS.inkLight).setOrigin(0.5, 0).setDepth(31);
    this.menu = new ListMenu(this.scene, X + 34, 0, 28, 19);
    this.menu.container.setDepth(31);
    this.hint = makeText(this.scene, X + W / 2, 0, 'W/S choose · E select · Esc close', 13, COLORS.inkLight).setOrigin(0.5).setDepth(31);
    this.refresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.spec = undefined;
    this.g?.destroy();
    this.title?.destroy();
    this.subtitle?.destroy();
    this.menu?.destroy();
    this.hint?.destroy();
    this.details.forEach((t) => t.destroy());
    this.details = [];
  }

  move(dir: number): void {
    this.menu?.move(dir);
  }

  select(): void {
    this.menu?.select();
  }

  refresh(): void {
    const spec = this.spec?.refresh?.() ?? this.spec;
    if (!this.isOpen || !spec || !this.g || !this.title || !this.subtitle || !this.menu || !this.hint) return;
    this.spec = { ...spec, refresh: this.spec?.refresh };

    const rows = spec.rows.length;
    const headH = spec.subtitle ? 74 : 54;
    const h = headH + rows * 28 + 34;
    const y = Math.max(20, (GAME_HEIGHT - h) / 2 - 20);

    this.g.clear();
    drawPanel(this.g, X, y, W, h, 10);
    this.title.setPosition(X + W / 2, y + 16).setText(spec.title);
    this.subtitle.setPosition(X + W / 2, y + 44).setText(spec.subtitle ?? '').setVisible(!!spec.subtitle);
    this.menu.container.setPosition(X + 34, y + headH);
    this.hint.setPosition(X + W / 2, y + h - 20);

    this.details.forEach((t) => t.destroy());
    this.details = spec.rows.map((row, i) =>
      makeText(this.scene, X + W - 34, y + headH + i * 28 + 1, row.detail ?? '', 16, row.disabled ? '#9c8a6a' : COLORS.inkLight)
        .setOrigin(1, 0)
        .setDepth(31));

    this.menu.setOptions(spec.rows.map((row) => ({
      label: row.label,
      disabled: row.disabled,
      onSelect: () => {
        if (row.onSelect() === false) this.close();
        else this.refresh();
      },
    })));
  }
}
