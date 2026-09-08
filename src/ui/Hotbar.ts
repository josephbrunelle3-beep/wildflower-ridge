import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TEX } from '../config/keys';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import itemData from '../data/items.json';
import { HOTBAR } from '../systems/HorseCareSystem';
import { COLORS, makeText } from './Panel';

interface ItemDef { id: string; name: string; hint: string }
const ITEMS = itemData as ItemDef[];

const SLOT = 44;
const GAP = 6;
const COUNT = HOTBAR.length;
const WIDTH = COUNT * SLOT + (COUNT - 1) * GAP;
const X0 = (GAME_WIDTH - WIDTH) / 2;
const Y0 = GAME_HEIGHT - 16 - SLOT;

/** The eight-slot tool bar from the concept art. Keys 1-8 select; the label shows the item name. */
export class Hotbar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly counts: Phaser.GameObjects.Text[] = [];
  private readonly label: Phaser.GameObjects.Text;
  private readonly hayText: Phaser.GameObjects.Text;
  private readonly unsubs: (() => void)[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(10);
    for (let i = 0; i < COUNT; i++) {
      const x = X0 + i * (SLOT + GAP);
      const icon = scene.add.image(x + SLOT / 2, Y0 + SLOT / 2, TEX.ICONS, i).setScale(2).setDepth(11);
      icon.setInteractive({ useHandCursor: true });
      icon.on('pointerdown', () => {
        G.state.selectedSlot = i;
        bus.emit(EV.HOTBAR_CHANGED, i);
      });
      this.icons.push(icon);
      scene.add.text(x + 4, Y0 + 2, `${i + 1}`, { fontFamily: 'sans-serif', fontSize: '10px', color: '#6b4a2a' }).setDepth(12);
      this.counts.push(makeText(scene, x + SLOT - 4, Y0 + SLOT - 4, '', 13, COLORS.cream, { stroke: '#3b2414', strokeThickness: 3 }).setOrigin(1, 1).setDepth(12));
    }
    this.label = makeText(scene, GAME_WIDTH / 2, Y0 - 10, '', 15, COLORS.cream, { stroke: '#3b2414', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(12);
    this.hayText = makeText(scene, X0 + WIDTH + 14, Y0 + SLOT / 2, '', 15, COLORS.cream, { stroke: '#3b2414', strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(12);

    this.unsubs.push(
      bus.on(EV.HOTBAR_CHANGED, () => this.refresh()),
      bus.on(EV.INVENTORY_CHANGED, () => this.refresh()),
    );
    this.refresh();
  }

  refresh(): void {
    const sel = G.state.selectedSlot;
    this.g.clear();
    this.g.fillStyle(0x000000, 0.25);
    this.g.fillRoundedRect(X0 - 6 + 3, Y0 - 6 + 4, WIDTH + 12, SLOT + 12, 8);
    this.g.fillStyle(COLORS.wood);
    this.g.fillRoundedRect(X0 - 6, Y0 - 6, WIDTH + 12, SLOT + 12, 8);
    for (let i = 0; i < COUNT; i++) {
      const x = X0 + i * (SLOT + GAP);
      this.g.fillStyle(i === sel ? 0xfff0c0 : COLORS.parchmentDark);
      this.g.fillRoundedRect(x, Y0, SLOT, SLOT, 5);
      if (i === sel) {
        this.g.lineStyle(3, 0xffd34d);
        this.g.strokeRoundedRect(x + 1, Y0 + 1, SLOT - 2, SLOT - 2, 5);
      }
      this.icons[i].setScale(i === sel ? 2.3 : 2);
      const id = HOTBAR[i];
      const count = id === 'carrot' ? G.state.inventory.carrots : id === 'bucket' ? G.state.farm.water : null;
      this.counts[i].setText(count === null ? '' : `${count}`);
    }
    const item = ITEMS.find((it) => it.id === HOTBAR[sel]);
    this.label.setText(item ? `${item.name} — ${item.hint}` : '');
    this.hayText.setText(`Hay ×${G.state.inventory.hay}`);
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.g.destroy();
    this.icons.forEach((i) => i.destroy());
    this.counts.forEach((c) => c.destroy());
    this.label.destroy();
    this.hayText.destroy();
  }
}
