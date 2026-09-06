import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/keys';
import { G } from './core/Session';
import { BootScene } from './scenes/BootScene';
import { RanchScene } from './scenes/RanchScene';
import { TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1b1610',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  // ?st=1 steps with setTimeout instead of requestAnimationFrame so the game keeps running
  // in a hidden tab (useful for automated testing).
  fps: { forceSetTimeOut: new URLSearchParams(location.search).has('st') },
  scene: [BootScene, TitleScene, RanchScene, UIScene],
};

async function boot(): Promise<void> {
  // Give the pixel font a moment to arrive so the first text objects use it.
  try {
    await Promise.race([
      document.fonts.load('16px "Pixelify Sans"'),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* font is optional */
  }
  const game = new Phaser.Game(config);
  if (import.meta.env.DEV) Object.assign(window, { __game: game, __G: G });
}

void boot();
