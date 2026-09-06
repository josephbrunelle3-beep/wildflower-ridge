import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH, SCENE } from '../config/keys';
import { startNewSession } from '../core/Session';
import { createNewGame } from '../state/GameState';
import { hasSave, loadGame } from '../systems/SaveSystem';
import { COLORS, makeText } from '../ui/Panel';

export const TAGLINE = 'Live your life. Ride your dreams.';

export class TitleScene extends Phaser.Scene {
  private options: { label: string; enabled: boolean; run: () => void }[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private index = 0;
  private confirmingOverwrite = false;
  private hint!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super(SCENE.TITLE);
  }

  create(): void {
    this.drawBackdrop();

    const title = makeText(this, GAME_WIDTH / 2, 120, 'Wildflower Ridge', 72, COLORS.cream, { stroke: '#5a3a1e', strokeThickness: 10 }).setOrigin(0.5);
    this.tweens.add({ targets: title, y: 126, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    makeText(this, GAME_WIDTH / 2, 190, TAGLINE, 24, COLORS.cream, { stroke: '#5a3a1e', strokeThickness: 5 }).setOrigin(0.5);

    const saved = hasSave();
    this.options = [
      {
        label: 'New Game',
        enabled: true,
        run: () => {
          if (saved && !this.confirmingOverwrite) {
            this.confirmingOverwrite = true;
            this.hint.setText('This will overwrite your saved ranch. Press Enter again to confirm, Esc to cancel.');
            return;
          }
          startNewSession(createNewGame());
          this.scene.start(SCENE.RANCH);
        },
      },
      {
        label: 'Continue',
        enabled: saved,
        run: () => {
          const loaded = loadGame();
          if (!loaded) return;
          startNewSession(loaded);
          this.scene.start(SCENE.RANCH);
        },
      },
    ];
    this.index = saved ? 1 : 0;

    this.labels = this.options.map((o, i) => {
      const t = makeText(this, GAME_WIDTH / 2, 310 + i * 48, o.label, 32, COLORS.cream, { stroke: '#5a3a1e', strokeThickness: 6 }).setOrigin(0.5);
      t.setInteractive({ useHandCursor: o.enabled });
      t.on('pointerover', () => { if (o.enabled) { this.index = i; this.refresh(); } });
      t.on('pointerdown', () => { if (o.enabled) { this.index = i; this.refresh(); o.run(); } });
      return t;
    });

    this.hint = makeText(this, GAME_WIDTH / 2, GAME_HEIGHT - 70, 'Arrows / W S to choose, Enter to select', 16, COLORS.cream, { stroke: '#5a3a1e', strokeThickness: 4 }).setOrigin(0.5);
    makeText(this, GAME_WIDTH / 2, GAME_HEIGHT - 28, 'WASD move · Shift run · E interact · 1-8 tools · Esc menu', 14, '#e8d8b0', { stroke: '#5a3a1e', strokeThickness: 3 }).setOrigin(0.5);

    this.keys = this.input.keyboard!.addKeys('UP,DOWN,W,S,ENTER,SPACE,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.refresh();
  }

  update(): void {
    const k = this.keys;
    const JD = Phaser.Input.Keyboard.JustDown;
    if (JD(k.UP) || JD(k.W)) this.move(-1);
    if (JD(k.DOWN) || JD(k.S)) this.move(1);
    if (JD(k.ENTER) || JD(k.SPACE)) this.options[this.index].run();
    if (JD(k.ESC) && this.confirmingOverwrite) {
      this.confirmingOverwrite = false;
      this.hint.setText('Arrows / W S to choose, Enter to select');
    }
  }

  private move(dir: number): void {
    const n = this.options.length;
    let i = this.index;
    for (let tries = 0; tries < n; tries++) {
      i = (i + dir + n) % n;
      if (this.options[i].enabled) break;
    }
    this.index = i;
    this.confirmingOverwrite = false;
    this.hint.setText('Arrows / W S to choose, Enter to select');
    this.refresh();
  }

  private refresh(): void {
    this.labels.forEach((t, i) => {
      const o = this.options[i];
      const selected = i === this.index;
      t.setText(`${selected ? '▸ ' : ''}${o.label}${selected ? ' ◂' : ''}`);
      t.setColor(!o.enabled ? '#9c8a6a' : selected ? '#ffe28a' : COLORS.cream);
    });
  }

  private drawBackdrop(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0xf7a25a, 0xf7a25a, 0x6a3f78, 0x6a3f78, 1);
    g.fillRect(0, 0, GAME_WIDTH, 250);
    g.fillStyle(0xffd76a);
    g.fillCircle(GAME_WIDTH / 2 + 220, 235, 46);
    g.fillStyle(0x3b5f8a);
    g.fillEllipse(GAME_WIDTH / 2 - 260, 260, 620, 120);
    g.fillEllipse(GAME_WIDTH / 2 + 260, 270, 700, 130);
    g.fillStyle(0x3f7f3a);
    g.fillRect(0, 250, GAME_WIDTH, GAME_HEIGHT - 250);
    g.fillEllipse(200, 260, 700, 90);
    g.fillEllipse(760, 255, 600, 70);
    g.fillStyle(0x4f9a48);
    g.fillEllipse(480, 330, 900, 160);
    g.fillStyle(0x5fa14a);
    g.fillRect(0, 340, GAME_WIDTH, GAME_HEIGHT - 340);
    // wildflowers
    const colors = [0xe85d75, 0xf2d34b, 0xf8f8f8, 0xc96be0];
    let seed = 20260906;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 120; i++) {
      const x = Math.floor(rand() * GAME_WIDTH);
      const y = 345 + Math.floor(rand() * (GAME_HEIGHT - 355));
      g.fillStyle(0x3f7f3a);
      g.fillRect(x + 1, y + 3, 2, 4);
      g.fillStyle(colors[Math.floor(rand() * colors.length)]);
      g.fillRect(x, y, 4, 4);
    }
    g.fillStyle(0x1b1610, 0.35);
    g.fillRoundedRect(GAME_WIDTH / 2 - 190, 270, 380, 140, 12);
    this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 8, 'v0.1 vertical slice', { fontFamily: FONT, fontSize: '12px', color: '#e8d8b0' }).setOrigin(1, 1);
  }
}
