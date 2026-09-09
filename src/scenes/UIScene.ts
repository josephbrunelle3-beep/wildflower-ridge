import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENE } from '../config/keys';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import { darkness } from '../systems/TimeSystem';
import { CareMenu } from '../ui/CareMenu';
import { DialogueBox } from '../ui/DialogueBox';
import { Hotbar } from '../ui/Hotbar';
import { Hud } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { PauseMenu } from '../ui/PauseMenu';
import { MiniGameHost, type MiniGameSpec } from '../ui/minigames/MiniGameHost';
import { ShopMenu, type ShopSpec } from '../ui/ShopMenu';
import { Toast } from '../ui/Toast';
import type { RanchScene } from './RanchScene';

/**
 * HUD overlay running in parallel with RanchScene. Owns every menu; while one is open it
 * sets G.uiLocked so the world stops taking input.
 */
export class UIScene extends Phaser.Scene {
  private night!: Phaser.GameObjects.Rectangle;
  private sunset!: Phaser.GameObjects.Rectangle;
  private hud!: Hud;
  private minimap!: Minimap;
  private hotbar!: Hotbar;
  private toast!: Toast;
  private care!: CareMenu;
  private dialogue!: DialogueBox;
  private pause!: PauseMenu;
  private shop!: ShopMenu;
  private games!: MiniGameHost;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private justOpened = false;
  private unsubs: (() => void)[] = [];

  constructor() {
    super(SCENE.UI);
  }

  create(): void {
    this.sunset = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff8c42).setOrigin(0).setDepth(0).setAlpha(0).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.night = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b1030).setOrigin(0).setDepth(1).setAlpha(0);

    this.hud = new Hud(this);
    this.minimap = new Minimap(this);
    this.hotbar = new Hotbar(this);
    this.toast = new Toast(this);
    this.care = new CareMenu(this);
    this.dialogue = new DialogueBox(this);
    this.pause = new PauseMenu(this);
    this.shop = new ShopMenu(this);
    this.games = new MiniGameHost(this);

    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,E,ENTER,SPACE,ESC') as Record<string, Phaser.Input.Keyboard.Key>;

    this.unsubs.push(
      bus.on(EV.CARE_OPEN, () => this.openMenu(() => this.care.open())),
      bus.on(EV.DIALOGUE_START, (npcId: string, node: string) => this.openMenu(() => this.dialogue.open(npcId, node))),
      bus.on(EV.PAUSE_OPEN, () => this.openMenu(() => this.pause.open())),
      bus.on(EV.SHOP_OPEN, (spec: ShopSpec) => this.openMenu(() => this.shop.open(spec))),
      bus.on(EV.MINIGAME_OPEN, (spec: MiniGameSpec) => this.openMenu(() => this.games.open(spec))),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  update(_time: number, dt: number): void {
    // Day / night
    const d = darkness(G.state.time.minutes);
    this.night.setAlpha(d * 0.62);
    this.sunset.setAlpha(d > 0 && d < 1 ? (1 - Math.abs(d - 0.5) * 2) * 0.35 : 0);

    // Minimap markers
    const ranch = this.scene.get(SCENE.RANCH) as RanchScene | undefined;
    const pos = ranch?.getPositions?.();
    if (pos) this.minimap.update(pos.px, pos.py, pos.hx, pos.hy);

    this.dialogue.update(dt);

    const k = this.keys;
    const JD = Phaser.Input.Keyboard.JustDown;
    const anyOpen = this.care.isOpen || this.dialogue.isOpen || this.pause.isOpen || this.shop.isOpen || this.games.isOpen;
    G.uiLocked = anyOpen;
    if (!anyOpen || this.justOpened) {
      // Consume the press that opened the menu (or any stray presses while closed).
      this.justOpened = false;
      for (const key of Object.values(k)) JD(key);
      return;
    }
    // The tending games take held keys and the arrows, so they read the keyboard first.
    if (this.games.isOpen) {
      this.games.update(dt, {
        dx: (k.LEFT.isDown || k.A.isDown ? -1 : 0) + (k.RIGHT.isDown || k.D.isDown ? 1 : 0),
        dy: (k.UP.isDown || k.W.isDown ? -1 : 0) + (k.DOWN.isDown || k.S.isDown ? 1 : 0),
        confirmDown: k.E.isDown || k.SPACE.isDown || k.ENTER.isDown,
        confirmJust: JD(k.E) || JD(k.SPACE) || JD(k.ENTER),
        cancelJust: JD(k.ESC),
      });
      return;
    }

    const up = JD(k.UP) || JD(k.W);
    const down = JD(k.DOWN) || JD(k.S);
    const confirm = JD(k.E) || JD(k.ENTER) || JD(k.SPACE);
    const cancel = JD(k.ESC);

    if (this.dialogue.isOpen) {
      if (up) this.dialogue.move(-1);
      if (down) this.dialogue.move(1);
      if (confirm) this.dialogue.advance();
    } else if (this.care.isOpen) {
      if (up) this.care.move(-1);
      if (down) this.care.move(1);
      if (confirm) this.care.select();
      if (cancel) this.care.close();
    } else if (this.pause.isOpen) {
      if (up) this.pause.move(-1);
      if (down) this.pause.move(1);
      if (confirm) this.pause.select();
      if (cancel) this.pause.close();
    } else if (this.shop.isOpen) {
      if (up) this.shop.move(-1);
      if (down) this.shop.move(1);
      if (confirm) this.shop.select();
      if (cancel) this.shop.close();
    }
  }

  private openMenu(fn: () => void): void {
    fn();
    this.justOpened = true;
    G.uiLocked = true;
    bus.emit(EV.PROMPT, null);
  }

  private teardown(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.hud.destroy();
    this.minimap.destroy();
    this.hotbar.destroy();
    this.toast.destroy();
    this.care.close();
    this.dialogue.close();
    this.pause.close();
    this.shop.close();
    this.games.close();
    G.uiLocked = false;
  }
}
