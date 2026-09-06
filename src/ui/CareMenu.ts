import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/keys';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import { type CareAction, moodOf } from '../systems/HorseCareSystem';
import { ListMenu } from './ListMenu';
import { COLORS, drawMeter, drawPanel, makeText, meterColor } from './Panel';

const W = 340;
const H = 372;
const X = (GAME_WIDTH - W) / 2;
const Y = (GAME_HEIGHT - H) / 2 - 20;

/** Feed / Brush / Groom / Tack Up / Bond / Ride menu, opened by interacting with the horse. */
export class CareMenu {
  isOpen = false;
  private readonly scene: Phaser.Scene;
  private g?: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.Text;
  private meterLabels: Phaser.GameObjects.Text[] = [];
  private menu?: ListMenu;
  private hint?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.g = this.scene.add.graphics().setDepth(30);
    this.title = makeText(this.scene, X + W / 2, Y + 20, '', 24).setOrigin(0.5, 0).setDepth(31);
    this.menu = new ListMenu(this.scene, X + 40, Y + 170, 26, 19);
    this.menu.container.setDepth(31);
    this.hint = makeText(this.scene, X + W / 2, Y + H - 22, 'W/S choose · E select · Esc close', 13, COLORS.inkLight).setOrigin(0.5).setDepth(31);
    this.refresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.g?.destroy();
    this.title?.destroy();
    this.menu?.destroy();
    this.hint?.destroy();
    this.meterLabels.forEach((t) => t.destroy());
    this.meterLabels = [];
  }

  move(dir: number): void {
    this.menu?.move(dir);
  }

  select(): void {
    this.menu?.select();
  }

  refresh(): void {
    if (!this.isOpen || !this.g || !this.title || !this.menu) return;
    const h = G.state.horse;
    this.g.clear();
    drawPanel(this.g, X, Y, W, H, 10);
    this.title.setText(`${h.name}  ·  ${moodOf(h)}`);

    this.meterLabels.forEach((t) => t.destroy());
    this.meterLabels = [];
    const meters: [string, number][] = [['Hunger', h.hunger], ['Clean', h.cleanliness], ['Energy', h.energy], ['Bond', h.bond]];
    meters.forEach(([label, value], i) => {
      const my = Y + 60 + i * 26;
      this.meterLabels.push(makeText(this.scene, X + 30, my - 2, label, 15).setDepth(31));
      drawMeter(this.g!, X + 100, my, 180, 16, value / 100, label === 'Bond' ? 0xe85d75 : meterColor(value / 100));
      this.meterLabels.push(makeText(this.scene, X + 290, my - 2, `${Math.round(value)}`, 14, COLORS.inkLight).setDepth(31));
    });

    const act = (action: CareAction) => () => {
      if (action === 'ride') {
        this.close();
        bus.emit(EV.CARE_ACTION, action);
        return;
      }
      bus.emit(EV.CARE_ACTION, action);
      this.refresh();
    };
    this.menu.setOptions([
      { label: 'Feed', onSelect: act('feed') },
      { label: 'Brush', onSelect: act('brush') },
      { label: 'Groom hooves', onSelect: act('groom') },
      { label: h.tacked ? 'Untack' : 'Tack Up', onSelect: act('tack') },
      { label: 'Bond (pet)', onSelect: act('bond') },
      { label: 'Ride', disabled: !h.tacked, onSelect: act('ride') },
    ]);
  }
}
