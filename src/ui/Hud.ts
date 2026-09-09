import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/keys';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import { formatGold } from '../systems/Economy';
import { activeQuests } from '../systems/QuestSystem';
import { formatClock, formatDate } from '../systems/TimeSystem';
import { COLORS, drawPanel, makeText } from './Panel';

const MINIMAP_W = 120;
const PANEL_X = GAME_WIDTH - 16 - MINIMAP_W - 8 - 156;
const PANEL_W = 156;

/** Date/time, gold and quest panels in the top-right, laid out like the concept art. */
export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly questG: Phaser.GameObjects.Graphics;
  private readonly dateText: Phaser.GameObjects.Text;
  private readonly clockText: Phaser.GameObjects.Text;
  private readonly goldText: Phaser.GameObjects.Text;
  private questTexts: Phaser.GameObjects.Text[] = [];
  private readonly unsubs: (() => void)[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(10);
    this.questG = scene.add.graphics().setDepth(10);

    // Date / time
    drawPanel(this.g, PANEL_X, 16, PANEL_W, 60);
    this.g.fillStyle(COLORS.gold);
    this.g.fillCircle(PANEL_X + 24, 46, 9);
    this.g.lineStyle(2, COLORS.gold);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.g.lineBetween(PANEL_X + 24 + Math.cos(a) * 12, 46 + Math.sin(a) * 12, PANEL_X + 24 + Math.cos(a) * 15, 46 + Math.sin(a) * 15);
    }
    this.dateText = makeText(scene, PANEL_X + 44, 24, '', 18).setDepth(11);
    this.clockText = makeText(scene, PANEL_X + 44, 46, '', 18).setDepth(11);

    // Gold
    drawPanel(this.g, PANEL_X, 82, PANEL_W, 36, 6);
    this.g.fillStyle(0xb8860b);
    this.g.fillCircle(PANEL_X + 22, 100, 8);
    this.g.fillStyle(COLORS.gold);
    this.g.fillCircle(PANEL_X + 22, 100, 6);
    this.goldText = makeText(scene, PANEL_X + PANEL_W - 14, 90, '', 18).setOrigin(1, 0).setDepth(11);

    this.unsubs.push(
      bus.on(EV.TIME_MINUTE, () => this.refreshTime()),
      bus.on(EV.TIME_DAY, () => this.refreshTime()),
      bus.on(EV.GOLD_CHANGED, () => this.refreshGold()),
      bus.on(EV.QUEST_CHANGED, () => this.refreshQuests()),
    );
    this.refreshTime();
    this.refreshGold();
    this.refreshQuests();
  }

  refreshTime(): void {
    // The garden waters itself on a wet night, so the weather belongs on the clock panel.
    const wet = G.state.farm.rained ? '  ·  Rain' : '';
    this.dateText.setText(`${formatDate(G.state.time)}${wet}`);
    this.clockText.setText(formatClock(G.state.time));
  }

  refreshGold(): void {
    this.goldText.setText(formatGold(G.state.gold));
  }

  refreshQuests(): void {
    this.questTexts.forEach((t) => t.destroy());
    this.questTexts = [];
    this.questG.clear();
    const quests = activeQuests(G.state);
    const x = PANEL_X;
    const y = 126;
    const w = PANEL_W + 8 + MINIMAP_W;
    const lines: Phaser.GameObjects.Text[] = [];
    let cy = y + 12;
    const header = makeText(this.scene, x + 14, cy, 'Current Quest:', 18).setDepth(11);
    lines.push(header);
    cy += 26;
    if (quests.length === 0) {
      lines.push(makeText(this.scene, x + 14, cy, 'Nothing pressing. Enjoy the ranch!', 15, COLORS.inkLight, { wordWrap: { width: w - 28 } }).setDepth(11));
      cy += 22;
    }
    for (const q of quests) {
      const t = makeText(this.scene, x + 14, cy, `○ ${q.title}`, 15, COLORS.ink, { wordWrap: { width: w - 28 } }).setDepth(11);
      lines.push(t);
      cy += t.height + 6;
    }
    drawPanel(this.questG, x, y, w, cy - y + 8, 6);
    this.questTexts = lines;
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.g.destroy();
    this.questG.destroy();
    this.dateText.destroy();
    this.clockText.destroy();
    this.goldText.destroy();
    this.questTexts.forEach((t) => t.destroy());
  }
}
