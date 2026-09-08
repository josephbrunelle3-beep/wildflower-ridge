import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { MAP, SCENE, TEX, WORLD_ZOOM } from '../config/keys';
import { JUMPABLE_TILES, SOLID_TILES } from '../config/tiles';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import { Horse } from '../entities/Horse';
import { Npc } from '../entities/Npc';
import { Player } from '../entities/Player';
import {
  brush, canGallop, canRide, drainGallop, feed, groom, pet, tack, applyHourlyDecay, type CareAction,
} from '../systems/HorseCareSystem';
import { InteractionSystem, type Interactable } from '../systems/InteractionSystem';
import { allQuestsDone, completeQuest, initQuests, isQuestActive } from '../systems/QuestSystem';
import { saveGame } from '../systems/SaveSystem';
import { TimeSystem, type TimeTick } from '../systems/TimeSystem';

type Keys = Record<string, Phaser.Input.Keyboard.Key>;
type TiledObject = Phaser.Types.Tilemaps.TiledObject;

export class RanchScene extends Phaser.Scene {
  private player!: Player;
  private horse!: Horse;
  private npc!: Npc;
  private clock!: TimeSystem;
  private keys!: Keys;
  private slotKeys: Phaser.Input.Keyboard.Key[] = [];
  private interactions = new InteractionSystem();
  private pastureZone?: Phaser.Geom.Rectangle;
  private mounted = false;
  private lastPrompt: string | null = null;
  private galloping = false;
  private unsubs: (() => void)[] = [];

  constructor() {
    super(SCENE.RANCH);
  }

  create(): void {
    const state = G.state;
    initQuests(state);

    // --- Map ---------------------------------------------------------------
    const map = this.make.tilemap({ key: MAP.RANCH });
    const tiles = map.addTilesetImage('tiles', TEX.TILES)!;
    map.createLayer('ground', tiles)!.setDepth(0);
    const decor = map.createLayer('decor', tiles)!.setDepth(1);
    decor.setCollision(SOLID_TILES.map((i) => i + 1));
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    const objects = map.getObjectLayer('objects')?.objects ?? [];
    const find = (name: string) => objects.find((o) => o.name === name);
    const center = (o: TiledObject | undefined, fx = 320, fy = 240) =>
      o ? { x: (o.x ?? 0) + (o.width ?? 16) / 2, y: (o.y ?? 0) + (o.height ?? 16) / 2 } : { x: fx, y: fy };

    // --- Entities ----------------------------------------------------------
    const ps = center(find('player'));
    if (!state.player.placed) {
      state.player.x = ps.x;
      state.player.y = ps.y;
      state.player.placed = true;
    }
    this.player = new Player(this, state.player.x, state.player.y, state.player.facing);

    const hs = center(find('horse'));
    if (state.horse.anchorX === 0 && state.horse.anchorY === 0) {
      state.horse.x = hs.x;
      state.horse.y = hs.y;
      state.horse.anchorX = hs.x;
      state.horse.anchorY = hs.y;
    }
    this.horse = new Horse(this, state.horse);

    const js = center(find('jasper'));
    this.npc = new Npc(this, js.x, js.y, TEX.NPC_JASPER, 'jasper', 'Jasper');

    this.physics.add.collider(this.player, decor);
    // A jumping horse passes over low obstacles. Everything else in the decor layer -
    // trees, buildings, the pond - stays solid whether she is airborne or not.
    this.physics.add.collider(
      this.horse,
      decor,
      undefined,
      (_horse, tile) => !(this.horse.airborne && JUMPABLE_TILES.includes((tile as Phaser.Tilemaps.Tile).index - 1)),
    );
    this.physics.add.collider(this.player, this.npc);
    this.physics.add.collider(this.player, this.horse);

    // --- Interactables -----------------------------------------------------
    this.interactions.add(this.horse.asInteractable(() => {
      this.horse.faceToward(this.player.x, this.player.y);
      bus.emit(EV.CARE_OPEN);
    }));
    this.interactions.add(this.npc.asInteractable(() => {
      this.npc.faceToward(this.player.x, this.player.y);
      bus.emit(EV.DIALOGUE_START, 'jasper', state.flags.metJasper ? 'repeat' : 'start');
    }));
    for (const o of objects) if (o.type === 'interact') this.addMapInteractable(o);

    const pz = find('pasture');
    if (pz) this.pastureZone = new Phaser.Geom.Rectangle(pz.x ?? 0, pz.y ?? 0, pz.width ?? 0, pz.height ?? 0);

    // --- Camera ------------------------------------------------------------
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setZoom(WORLD_ZOOM);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setRoundPixels(true);

    // --- Clock -------------------------------------------------------------
    this.clock = new TimeSystem(state.time, (tick) => this.onTick(tick));

    // --- Input -------------------------------------------------------------
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E,ESC,SPACE') as Keys;
    this.slotKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'].map((k) => kb.addKey(k));

    // --- Events ------------------------------------------------------------
    this.unsubs.push(
      bus.on(EV.CARE_ACTION, (action: CareAction) => this.onCareAction(action)),
      bus.on(EV.DIALOGUE_END, (npcId: string, end: string) => this.onDialogueEnd(npcId, end)),
      bus.on(EV.SAVE_REQUEST, () => this.saveNow(true)),
      bus.on(EV.QUIT_TO_TITLE, () => this.quitToTitle()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
    });

    this.scene.launch(SCENE.UI);
    cam.fadeIn(500, 0, 0, 0);

    if (!state.flags.welcomed) {
      state.flags.welcomed = true;
      this.time.delayedCall(700, () => bus.emit(EV.TOAST, `Welcome to Wildflower Ridge. ${state.horse.name} is waiting in the north pasture.`));
    }
  }

  update(_t: number, dt: number): void {
    const state = G.state;
    this.clock.update(dt);

    const k = this.keys;
    const JD = Phaser.Input.Keyboard.JustDown;

    if (G.uiLocked) {
      if (!this.mounted) this.player.halt();
      this.horse.halt();
      // Consume presses that the menu handled so they don't fire here once it closes.
      for (const key of Object.values(k)) JD(key);
      for (const key of this.slotKeys) JD(key);
      return;
    }

    this.slotKeys.forEach((key, i) => {
      if (JD(key)) {
        state.selectedSlot = i;
        bus.emit(EV.HOTBAR_CHANGED, i);
      }
    });
    if (JD(k.ESC)) {
      bus.emit(EV.PAUSE_OPEN);
      return;
    }

    const dx = (k.A.isDown || k.LEFT.isDown ? -1 : 0) + (k.D.isDown || k.RIGHT.isDown ? 1 : 0);
    const dy = (k.W.isDown || k.UP.isDown ? -1 : 0) + (k.S.isDown || k.DOWN.isDown ? 1 : 0);
    const run = k.SHIFT.isDown;

    if (this.mounted) {
      const gallop = run && canGallop(state.horse);
      if (JD(k.SPACE)) this.tryJump();
      const { braking } = this.horse.ride(dx, dy, gallop, dt);
      this.player.rideOn(this.horse);

      // Galloping costs condition; only the real thing, not merely asking for it.
      if (gallop && this.horse.gait === 'gallop') {
        drainGallop(state.horse, dt / 1000);
        this.galloping = true;
      } else if (this.galloping) {
        this.galloping = false;
        bus.emit(EV.HORSE_CHANGED);
      }

      this.setPrompt(this.ridePrompt(braking, run, gallop));
      if (JD(k.E)) this.tryDismount();
    } else {
      this.player.move(dx, dy, run);
      this.horse.updateAI(dt);
      const target = this.interactions.findNearest(this.player.x, this.player.y, this.player.facing);
      this.setPrompt(target ? target.prompt() : null);
      if (target && JD(k.E)) target.interact();
    }

    if (this.pastureZone && isQuestActive(state, 'pasture') && this.pastureZone.contains(this.player.x, this.player.y)) {
      this.finishQuest('pasture');
    }

    this.syncState();
  }

  /** Positions for the minimap. */
  getPositions(): { px: number; py: number; hx: number; hy: number } {
    return { px: this.player.x, py: this.player.y, hx: this.horse.x, hy: this.horse.y };
  }

  // ---------------------------------------------------------------------------

  private addMapInteractable(o: TiledObject): void {
    const state = G.state;
    const x = (o.x ?? 0) + (o.width ?? 16) / 2 + (o.name === 'barn' ? 8 : 0);
    const y = (o.y ?? 0) + (o.height ?? 16) / 2;
    const toast = (text: string) => bus.emit(EV.TOAST, text);
    const table: Record<string, Pick<Interactable, 'prompt' | 'interact'>> = {
      hay: {
        prompt: () => '[E] Take hay',
        interact: () => {
          if (state.inventory.hay >= BALANCE.maxHay) return toast("You're carrying all the hay you can.");
          state.inventory.hay += 1;
          bus.emit(EV.INVENTORY_CHANGED);
          toast(`You grab an armful of hay. (${state.inventory.hay}/${BALANCE.maxHay})`);
        },
      },
      trough: {
        prompt: () => '[E] Water trough',
        interact: () => toast(`Clear water. ${state.horse.name} drinks here when she's thirsty.`),
      },
      bed: {
        prompt: () => '[E] Go to bed',
        interact: () => this.trySleep(),
      },
      barn: {
        prompt: () => '[E] Barn',
        interact: () => toast('The tack room. Your brush, saddle and hoof pick are on the tool bar (keys 1-8).'),
      },
      sign: {
        prompt: () => '[E] Read sign',
        interact: () => toast('"← Wildflower Ridge   ·   Town & General Store →  (road opens in a future update)"'),
      },
    };
    const def = table[o.name];
    if (!def) return;
    this.interactions.add({ x, y, radius: o.name === 'barn' ? 30 : 22, ...def });
  }

  private setPrompt(text: string | null): void {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    bus.emit(EV.PROMPT, text);
  }

  private onTick(tick: TimeTick): void {
    const state = G.state;
    bus.emit(EV.TIME_MINUTE, state.time);
    if (tick.hours > 0) {
      applyHourlyDecay(state.horse, tick.hours, this.mounted);
      bus.emit(EV.HORSE_CHANGED);
      bus.emit(EV.TIME_HOUR, tick.hours);
    }
    if (tick.days > 0) bus.emit(EV.TIME_DAY, state.time);
  }

  private onCareAction(action: CareAction): void {
    const state = G.state;
    const toast = (text: string) => bus.emit(EV.TOAST, text);
    switch (action) {
      case 'feed': {
        const r = feed(state);
        toast(r.message);
        if (r.ok) {
          bus.emit(EV.INVENTORY_CHANGED);
          this.horse.halt();
        }
        break;
      }
      case 'brush': toast(brush(state).message); break;
      case 'groom': toast(groom(state).message); break;
      case 'bond': toast(pet(state).message); break;
      case 'tack': {
        toast(tack(state).message);
        this.horse.refreshTexture();
        break;
      }
      case 'ride': {
        const r = canRide(state);
        if (!r.ok) {
          toast(r.message);
          return;
        }
        this.mount();
        break;
      }
    }
    bus.emit(EV.HORSE_CHANGED);
  }

  private mount(): void {
    this.mounted = true;
    this.player.setMounted(true);
    this.horse.setMounted(true);
    this.horse.faceToward(this.player.x, this.player.y);
    this.player.rideOn(this.horse);
    this.cameras.main.startFollow(this.horse, true, 0.12, 0.12);
    bus.emit(EV.MOUNT);
    bus.emit(EV.TOAST, 'WASD to ride, Shift to gallop, E to dismount.');
  }

  private dismount(): void {
    this.mounted = false;
    this.galloping = false;
    this.horse.setMounted(false);
    this.player.setMounted(false);
    // Step off to the horse's left, clear of its body.
    this.player.setPosition(this.horse.x - 20, this.horse.y);
    this.player.facing = 'down';
    this.player.halt();
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.setPrompt(null);
    bus.emit(EV.DISMOUNT);
    bus.emit(EV.HORSE_CHANGED);
  }

  /** You cannot step off a moving horse; rein her in first. */
  private tryDismount(): void {
    if (this.horse.airborne) return;
    if (this.horse.gait !== 'idle') {
      bus.emit(EV.TOAST, `Rein ${G.state.horse.name} in before you get down.`);
      return;
    }
    this.dismount();
  }

  private tryJump(): void {
    if (this.horse.tryJump()) return;
    if (!this.horse.airborne) {
      bus.emit(EV.TOAST, `${G.state.horse.name} needs more pace to jump.`);
    }
  }

  /** One line of contextual coaching under the horse while riding. */
  private ridePrompt(braking: boolean, run: boolean, gallop: boolean): string | null {
    const name = G.state.horse.name;
    if (this.horse.airborne) return null;
    if (braking) return `Reining ${name} in…`;
    if (run && !gallop) return `${name} is too tired to gallop`;
    switch (this.horse.gait) {
      case 'idle':
        return '[E] Dismount  ·  WASD to ride  ·  Shift to gallop';
      case 'gallop':
      case 'canter':
        return '[Space] Jump  ·  hold back on the reins to slow';
      default:
        return '[Space] Jump  ·  Shift to gallop';
    }
  }

  private onDialogueEnd(npcId: string, end: string): void {
    if (npcId !== 'jasper') return;
    if (end === 'met') {
      G.state.flags.metJasper = true;
      this.finishQuest('jasper');
    }
  }

  private finishQuest(id: string): void {
    const state = G.state;
    if (!completeQuest(state, id)) return;
    bus.emit(EV.QUEST_CHANGED);
    const done = allQuestsDone(state);
    bus.emit(EV.TOAST, done ? 'Quest complete! That is everything for now. Enjoy the ranch.' : 'Quest complete!');
  }

  private trySleep(): void {
    const m = G.state.time.minutes;
    if (m >= 6 * 60 && m < 18 * 60) {
      bus.emit(EV.TOAST, "It's too early to sleep. Come back after 6 PM.");
      return;
    }
    if (this.mounted) this.dismount();
    G.uiLocked = true;
    this.player.halt();
    const cam = this.cameras.main;
    cam.fadeOut(600, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.clock.sleep();
      this.saveNow(false);
      cam.fadeIn(800, 0, 0, 0);
      G.uiLocked = false;
      bus.emit(EV.TOAST, 'Good morning! Your ranch has been saved.');
    });
  }

  private syncState(): void {
    const state = G.state;
    state.player.x = this.player.x;
    state.player.y = this.player.y;
    state.player.facing = this.player.facing;
    state.horse.x = this.horse.x;
    state.horse.y = this.horse.y;
  }

  private saveNow(announce: boolean): void {
    this.syncState();
    const ok = saveGame(G.state);
    if (announce) bus.emit(EV.TOAST, ok ? 'Game saved.' : 'Could not save (storage unavailable).');
  }

  private quitToTitle(): void {
    this.saveNow(false);
    this.scene.stop(SCENE.UI);
    this.scene.start(SCENE.TITLE);
  }
}
