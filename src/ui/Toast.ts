import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/keys';
import { bus, EV } from '../core/EventBus';
import { COLORS, makeText } from './Panel';

/** Interaction prompt ("[E] Talk to Jasper") and short fading notifications. */
export class Toast {
  private readonly scene: Phaser.Scene;
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly promptBg: Phaser.GameObjects.Rectangle;
  private readonly toast: Phaser.GameObjects.Text;
  private readonly toastBg: Phaser.GameObjects.Rectangle;
  private tween?: Phaser.Tweens.Tween;
  private readonly unsubs: (() => void)[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const py = GAME_HEIGHT - 96;
    this.promptBg = scene.add.rectangle(GAME_WIDTH / 2, py, 10, 30, 0x1b1610, 0.65).setDepth(20).setVisible(false);
    this.prompt = makeText(scene, GAME_WIDTH / 2, py, '', 17, COLORS.cream).setOrigin(0.5).setDepth(21).setVisible(false);

    const ty = GAME_HEIGHT - 140;
    this.toastBg = scene.add.rectangle(GAME_WIDTH / 2, ty, 10, 34, 0x3b2414, 0.9).setDepth(20).setAlpha(0);
    this.toast = makeText(scene, GAME_WIDTH / 2, ty, '', 18, '#ffe9b8').setOrigin(0.5).setDepth(21).setAlpha(0);

    this.unsubs.push(
      bus.on(EV.PROMPT, (text: string | null) => this.setPrompt(text)),
      bus.on(EV.TOAST, (text: string) => this.show(text)),
    );
  }

  setPrompt(text: string | null): void {
    const visible = !!text;
    this.prompt.setVisible(visible);
    this.promptBg.setVisible(visible);
    if (text) {
      this.prompt.setText(text);
      this.promptBg.setSize(this.prompt.width + 24, 30);
    }
  }

  show(text: string): void {
    this.toast.setText(text);
    this.toastBg.setSize(this.toast.width + 28, 34);
    this.tween?.stop();
    this.toast.setAlpha(1);
    this.toastBg.setAlpha(1);
    this.tween = this.scene.tweens.add({
      targets: [this.toast, this.toastBg],
      alpha: 0,
      delay: Math.min(5000, 1800 + text.length * 40),
      duration: 400,
    });
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.tween?.stop();
    this.prompt.destroy();
    this.promptBg.destroy();
    this.toast.destroy();
    this.toastBg.destroy();
  }
}
