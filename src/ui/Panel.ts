import Phaser from 'phaser';
import { FONT } from '../config/keys';

/** Wood-and-parchment palette echoing the concept art HUD. */
export const COLORS = {
  parchment: 0xf3e2b8,
  parchmentDark: 0xe6d0a0,
  wood: 0x6b4423,
  woodLight: 0xc8985a,
  ink: '#3b2414',
  inkLight: '#6b4a2a',
  accent: '#b3261e',
  cream: '#fff3d6',
  gold: 0xf2d34b,
  meterBg: 0x7a5230,
};

export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, radius = 8): void {
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(x + 3, y + 4, w, h, radius);
  g.fillStyle(COLORS.wood);
  g.fillRoundedRect(x, y, w, h, radius);
  g.fillStyle(COLORS.parchment);
  g.fillRoundedRect(x + 3, y + 3, w - 6, h - 6, Math.max(2, radius - 2));
  g.lineStyle(2, COLORS.woodLight);
  g.strokeRoundedRect(x + 6, y + 6, w - 12, h - 12, Math.max(1, radius - 4));
}

export function drawMeter(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, color: number): void {
  g.fillStyle(COLORS.meterBg);
  g.fillRoundedRect(x, y, w, h, 3);
  const fw = Math.max(0, Math.min(w - 4, (w - 4) * frac));
  if (fw > 0) {
    g.fillStyle(color);
    g.fillRoundedRect(x + 2, y + 2, fw, h - 4, 2);
  }
}

export function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 16,
  color: string = COLORS.ink,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, ...extra });
}

export const meterColor = (frac: number): number => (frac < 0.3 ? 0xd9534f : frac < 0.6 ? 0xf2b134 : 0x5cb85c);
