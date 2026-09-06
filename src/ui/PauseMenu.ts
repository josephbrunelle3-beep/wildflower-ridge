import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/keys';
import { bus, EV } from '../core/EventBus';
import { ListMenu } from './ListMenu';
import { COLORS, drawPanel, makeText } from './Panel';

const W = 300;
const H = 220;
const X = (GAME_WIDTH - W) / 2;
const Y = (GAME_HEIGHT - H) / 2 - 20;

export class PauseMenu {
  isOpen = false;
  private readonly scene: Phaser.Scene;
  private g?: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private menu?: ListMenu;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.g = this.scene.add.graphics().setDepth(30);
    drawPanel(this.g, X, Y, W, H, 10);
    this.title = makeText(this.scene, X + W / 2, Y + 22, 'Paused', 26).setOrigin(0.5, 0).setDepth(31);
    this.menu = new ListMenu(this.scene, X + 60, Y + 74, 32, 21);
    this.menu.container.setDepth(31);
    this.menu.setOptions([
      { label: 'Resume', onSelect: () => this.close() },
      { label: 'Save Game', onSelect: () => { bus.emit(EV.SAVE_REQUEST); this.close(); } },
      { label: 'Save & Quit', onSelect: () => { this.close(); bus.emit(EV.QUIT_TO_TITLE); } },
    ], false);
    this.hint = makeText(this.scene, X + W / 2, Y + H - 22, 'W/S choose · E select · Esc resume', 13, COLORS.inkLight).setOrigin(0.5).setDepth(31);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.g?.destroy();
    this.title?.destroy();
    this.hint?.destroy();
    this.menu?.destroy();
  }

  move(dir: number): void {
    this.menu?.move(dir);
  }

  select(): void {
    this.menu?.select();
  }
}
