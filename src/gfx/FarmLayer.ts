import Phaser from 'phaser';
import { CROP_BY_ID, CROPS, FARM, inSeason, seedPacketLabel, type CropDef } from '../config/crops';
import { TEX } from '../config/keys';
import { TILE, TILE_SIZE } from '../config/tiles';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import { Sfx } from '../core/Sfx';
import type { InteractionSystem } from '../systems/InteractionSystem';
import {
  activePlot, applyHarvest, applyWatering, applyWeeding, buySeeds, canWater, clear, cropOf, describePlot,
  expandGarden, growthStage, harvestSpread, isWilting, nextTier, plantableSeeds, plant, plotAt, plotKey,
  produceCount, produceValue, refillBucket, seedPacketCost, sellProduce, soilDamp, stageOf, till, type FarmResult,
} from '../systems/FarmingSystem';
import { harvestParams, wateringParams, weedingParams } from '../systems/minigames/tuning';
import { FARM_FRAME, cropFrame, generateFarmTextures, weedFrame } from './CropTextures';
import { buildFarmYard } from './FarmYard';
import type { MiniGameSpec } from '../ui/minigames/MiniGameHost';
import type { ShopRow, ShopSpec } from '../ui/ShopMenu';

const SOIL_DEPTH = 2;
const PLANT_DEPTH = 3;
const OVERLAY_DEPTH = 4;
const MARKER_DEPTH = 2.5;

/** A thirsty crop goes sallow, then bleached, before it dies. */
const WILT_TINTS = [0xffffff, 0xd8c07e, 0xb49a62];

const toast = (text: string) => bus.emit(EV.TOAST, text);

/**
 * The farmyard in the world: the fence and track, soil and crop sprites, the string line
 * marking how much of it is yours yet, one interactable per square, the crates and the
 * pump. All the rules live in `systems/FarmingSystem`; this class draws them, turns an
 * [E] into a plant card, and hands the tending games their parameters.
 */
export class FarmLayer {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  private readonly scene: Phaser.Scene;
  private readonly decor: Phaser.Tilemaps.TilemapLayer;
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly soil = new Map<string, Phaser.GameObjects.Image>();
  private readonly plants = new Map<string, Phaser.GameObjects.Image>();
  private readonly overlays = new Map<string, Phaser.GameObjects.Image>();
  private readonly unsubs: (() => void)[] = [];

  constructor(
    scene: Phaser.Scene,
    ground: Phaser.Tilemaps.TilemapLayer,
    decor: Phaser.Tilemaps.TilemapLayer,
    interactions: InteractionSystem,
  ) {
    this.scene = scene;
    this.decor = decor;
    generateFarmTextures(scene);
    buildFarmYard(ground, decor);
    this.solids = scene.physics.add.staticGroup();
    this.marker = scene.add.graphics().setDepth(MARKER_DEPTH);

    const p = FARM.plot;
    for (let ty = p.y0; ty <= p.y1; ty++) {
      for (let tx = p.x0; tx <= p.x1; tx++) {
        interactions.add({
          x: tx * TILE_SIZE + TILE_SIZE / 2,
          y: ty * TILE_SIZE + TILE_SIZE / 2,
          radius: 13,
          prompt: () => this.promptFor(tx, ty),
          interact: () => this.interactWith(tx, ty),
        });
      }
    }

    this.addFixture(FARM.seedCrate.x, FARM.seedCrate.y, FARM_FRAME.SEED_CRATE, interactions, {
      prompt: () => '[E] Seed crate',
      interact: () => bus.emit(EV.SHOP_OPEN, this.seedShop()),
    });
    this.addFixture(FARM.shipCrate.x, FARM.shipCrate.y, FARM_FRAME.SHIP_CRATE, interactions, {
      prompt: () => '[E] Shipping crate',
      interact: () => bus.emit(EV.SHOP_OPEN, this.shipShop()),
    });
    this.addFixture(FARM.pump.x, FARM.pump.y, FARM_FRAME.PUMP, interactions, {
      prompt: () => `[E] Pump  ·  bucket ${G.state.farm.water}/${FARM.care.bucketCapacity}`,
      interact: () => {
        const result = refillBucket(G.state);
        toast(result.message);
        if (result.ok) bus.emit(EV.INVENTORY_CHANGED);
      },
    });

    this.unsubs.push(bus.on(EV.FARM_CHANGED, () => this.refresh()));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.refresh();
  }

  /** Redraw every square from state. Cheap: the plot is a couple of dozen tiles. */
  refresh(): void {
    const p = FARM.plot;
    for (let ty = p.y0; ty <= p.y1; ty++) {
      for (let tx = p.x0; tx <= p.x1; tx++) this.refreshTile(tx, ty);
    }
    this.drawMarker();
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.marker.destroy();
    for (const map of [this.soil, this.plants, this.overlays]) {
      map.forEach((i) => i.destroy());
      map.clear();
    }
  }

  // --- Drawing ---------------------------------------------------------------

  /** A string line on stakes around the ground that is yours so far. */
  private drawMarker(): void {
    const r = activePlot(G.state);
    const g = this.marker;
    g.clear();
    const x0 = r.x0 * TILE_SIZE + 1;
    const y0 = r.y0 * TILE_SIZE + 1;
    const x1 = (r.x1 + 1) * TILE_SIZE - 1;
    const y1 = (r.y1 + 1) * TILE_SIZE - 1;
    g.lineStyle(1, 0xf3e2b8, 0.55);
    const dash = (ax: number, ay: number, bx: number, by: number) => {
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.floor(len / 6);
      for (let i = 0; i < n; i += 2) {
        const t0 = i / n;
        const t1 = Math.min(1, (i + 1) / n);
        g.lineBetween(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1);
      }
    };
    dash(x0, y0, x1, y0);
    dash(x1, y0, x1, y1);
    dash(x1, y1, x0, y1);
    dash(x0, y1, x0, y0);
    g.fillStyle(0x7a5231);
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) g.fillRect(x - 1, y - 3, 3, 5);
  }

  private refreshTile(tx: number, ty: number): void {
    const key = plotKey(tx, ty);
    const plotState = plotAt(G.state, tx, ty);
    if (!plotState) {
      this.clearTile(key);
      return;
    }

    // Hoeing takes the wildflowers with it.
    const decorTile = this.decor.getTileAt(tx, ty);
    if (decorTile && decorTile.index - 1 === TILE.FLOWERS) this.decor.removeTileAt(tx, ty);

    const x = tx * TILE_SIZE + TILE_SIZE / 2;
    const y = ty * TILE_SIZE + TILE_SIZE / 2;
    this.setImage(this.soil, key, x, y, plotState.watered ? FARM_FRAME.SOIL_WET : FARM_FRAME.SOIL_DRY, SOIL_DEPTH);

    const plantFrame = plotState.withered
      ? FARM_FRAME.WITHERED
      : plotState.crop
        ? cropFrame(plotState.crop, growthStage(plotState))
        : -1;
    const plant = this.setImage(this.plants, key, x, y, plantFrame, PLANT_DEPTH);
    // A wilting crop is tinted rather than replaced, so you can still see what is planted
    // while it is in trouble - and how much trouble it is in.
    plant?.setTint(WILT_TINTS[Math.min(plotState.dryDays, WILT_TINTS.length - 1)]);

    // Weeds and the dry crust lie over the crop, never instead of it. Weeds win: they are
    // the thing you can do something about right now.
    const overlay = plotState.weeds > 0 ? weedFrame(plotState.weeds) : isWilting(plotState) ? FARM_FRAME.WILT : -1;
    this.setImage(this.overlays, key, x, y, overlay, OVERLAY_DEPTH);
  }

  private setImage(
    store: Map<string, Phaser.GameObjects.Image>,
    key: string,
    x: number,
    y: number,
    frame: number,
    depth: number,
  ): Phaser.GameObjects.Image | null {
    const existing = store.get(key);
    if (frame < 0) {
      existing?.destroy();
      store.delete(key);
      return null;
    }
    if (existing) {
      existing.setFrame(frame);
      return existing;
    }
    const image = this.scene.add.image(x, y, TEX.FARM, frame).setDepth(depth);
    store.set(key, image);
    return image;
  }

  private clearTile(key: string): void {
    for (const map of [this.soil, this.plants, this.overlays]) {
      map.get(key)?.destroy();
      map.delete(key);
    }
  }

  private addFixture(
    tx: number,
    ty: number,
    frame: number,
    interactions: InteractionSystem,
    def: { prompt: () => string | null; interact: () => void },
  ): void {
    const x = tx * TILE_SIZE + TILE_SIZE / 2;
    const y = ty * TILE_SIZE + TILE_SIZE / 2;
    const image = this.solids.create(x, y, TEX.FARM, frame) as Phaser.Physics.Arcade.Sprite;
    image.setDepth(100 + y);
    const body = image.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(14, 10).setOffset(1, 5);
    body.updateFromGameObject();
    interactions.add({ x, y, radius: 20, ...def });
  }

  // --- Interaction -----------------------------------------------------------

  private promptFor(tx: number, ty: number): string | null {
    const state = G.state;
    const plotState = plotAt(state, tx, ty);
    switch (stageOf(state, tx, ty)) {
      case 'locked': {
        const next = nextTier(state);
        return next ? `Outside the garden — stake out more at the seed crate (${next.cost}g)` : null;
      }
      case 'wild':
        return '[E] Till the soil';
      case 'tilled':
        if (plotState!.weeds > 0) return '[E] Pull the weeds from the bare soil';
        return plantableSeeds(state).length ? '[E] Sow seed' : '[E] Bare soil — buy seed at the crate';
      case 'withered':
        return '[E] Clear the dead crop';
      default: {
        const crop = cropOf(plotState)!;
        return `[E] ${crop.name}  ·  ${describePlot(plotState!)}`;
      }
    }
  }

  private interactWith(tx: number, ty: number): void {
    const state = G.state;
    const plotState = plotAt(state, tx, ty);
    switch (stageOf(state, tx, ty)) {
      case 'locked': {
        const next = nextTier(state);
        toast(next ? `The garden ends at the string line. The seed crate sells more ground for ${next.cost}g.` : 'The yard fence is as far as the garden goes.');
        break;
      }
      case 'wild':
        this.apply(till(state, tx, ty), 'dig');
        break;
      case 'tilled':
        if (plotState!.weeds > 0) this.openWeeding(tx, ty);
        else this.openSowMenu(tx, ty);
        break;
      case 'withered':
        this.apply(clear(state, tx, ty), 'pull');
        break;
      default:
        Sfx.play('tick');
        bus.emit(EV.SHOP_OPEN, this.plantCard(tx, ty));
    }
  }

  /** Toast the outcome, redraw, sound it, and put the time the work took on the clock. */
  private apply(result: FarmResult, sound?: Parameters<typeof Sfx.play>[0]): void {
    toast(result.message);
    if (!result.ok) return;
    if (sound) Sfx.play(sound);
    if (result.message.startsWith('Prize')) Sfx.play('prize');
    bus.emit(EV.FARM_CHANGED);
    bus.emit(EV.INVENTORY_CHANGED);
    if (result.minutes) bus.emit(EV.TIME_SPEND, result.minutes);
  }

  // --- The plant card ----------------------------------------------------------

  /**
   * The popup for a growing plant: how it is doing, and what you can do about it. Each
   * choice hands off to one of the tending games; the card closes so the game has the
   * screen.
   */
  private plantCard(tx: number, ty: number): ShopSpec {
    const build = (): ShopSpec => {
      const state = G.state;
      const plotState = plotAt(state, tx, ty)!;
      const crop = cropOf(plotState)!;
      const water = canWater(state, tx, ty);
      const ripe = stageOf(state, tx, ty) === 'ripe';
      const fussy = ['easy going', 'particular', 'fussy'][crop.difficulty - 1];
      const rows: ShopRow[] = [];

      rows.push({
        label: 'Water',
        detail: water.ok ? `bucket ${state.farm.water}/${FARM.care.bucketCapacity}` : water.message,
        disabled: !water.ok,
        onSelect: () => {
          this.openWatering(tx, ty);
          return false;
        },
      });
      if (plotState.weeds > 0) {
        rows.push({
          label: 'Pull the weeds',
          detail: ['a few', 'spreading', 'choking it'][Math.min(2, plotState.weeds - 1)],
          onSelect: () => {
            this.openWeeding(tx, ty);
            return false;
          },
        });
      }
      if (ripe) {
        const spread = harvestSpread(plotState);
        rows.push({
          label: 'Harvest',
          detail: `${spread.ripe} of ${crop.harvestItems} ready${plotState.neglect === 0 ? '  ·  prize if clean' : ''}`,
          onSelect: () => {
            this.openHarvest(tx, ty);
            return false;
          },
        });
      }
      rows.push({ label: 'Leave it', onSelect: () => false });

      const lines = [describePlot(plotState)];
      if (plotState.neglect === 0 && !ripe) lines.push('No slip-ups so far - prize crop if it stays that way');
      else if (plotState.neglect > 0) lines.push(`${plotState.neglect} ${plotState.neglect === 1 ? 'slip-up' : 'slip-ups'} - no prize this time`);

      return {
        title: crop.name,
        subtitle: `${fussy} to tend  ·  ${crop.days} days`,
        portrait: {
          texture: TEX.FARM,
          frame: plotState.withered ? FARM_FRAME.WITHERED : cropFrame(crop.id, growthStage(plotState)),
          tint: WILT_TINTS[Math.min(plotState.dryDays, WILT_TINTS.length - 1)],
          overlay: plotState.weeds > 0 ? weedFrame(plotState.weeds) : isWilting(plotState) ? FARM_FRAME.WILT : undefined,
        },
        lines,
        rows,
        refresh: build,
      };
    };
    return build();
  }

  // --- The tending games --------------------------------------------------------

  private openWatering(tx: number, ty: number): void {
    const state = G.state;
    const can = canWater(state, tx, ty);
    if (!can.ok) return toast(can.message);
    const plotState = plotAt(state, tx, ty)!;
    const crop = cropOf(plotState)!;
    const spec: MiniGameSpec = {
      kind: 'watering',
      crop,
      stageFrame: cropFrame(crop.id, growthStage(plotState)),
      // Roots deepen as the plant grows, so a seedling wants a shallower soak.
      params: wateringParams(crop, plotState.growth / crop.days),
      onDone: (verdict) => this.apply(applyWatering(state, tx, ty, verdict)),
    };
    bus.emit(EV.MINIGAME_OPEN, spec);
  }

  private openWeeding(tx: number, ty: number): void {
    const state = G.state;
    const plotState = plotAt(state, tx, ty);
    if (!plotState || plotState.weeds <= 0) return;
    const crop = cropOf(plotState);
    // Bare soil has nothing to tear, so the weeds are judged against the easiest crop and
    // the plant is left out of the close-up.
    const judge: CropDef = crop ?? CROPS[0];
    const params = weedingParams(judge, plotState.weeds, soilDamp(state, plotState));
    const spec: MiniGameSpec = {
      kind: 'weeding',
      crop: judge,
      stageFrame: crop ? cropFrame(crop.id, growthStage(plotState)) : -1,
      params: crop ? params : { ...params, canopyRadius: 0 },
      onDone: (result) => this.apply(applyWeeding(state, tx, ty, result)),
    };
    bus.emit(EV.MINIGAME_OPEN, spec);
  }

  private openHarvest(tx: number, ty: number): void {
    const state = G.state;
    const plotState = plotAt(state, tx, ty);
    const crop = cropOf(plotState);
    if (!plotState || !crop || stageOf(state, tx, ty) !== 'ripe') return;
    const spec: MiniGameSpec = {
      kind: 'harvest',
      crop,
      stageFrame: cropFrame(crop.id, growthStage(plotState)),
      // What is ready on the plant is a record of how it was kept.
      params: harvestParams(crop, harvestSpread(plotState)),
      onDone: (bagged) => this.apply(applyHarvest(state, tx, ty, bagged)),
    };
    bus.emit(EV.MINIGAME_OPEN, spec);
  }

  // --- Menus -----------------------------------------------------------------

  private openSowMenu(tx: number, ty: number): void {
    const state = G.state;
    const owned = plantableSeeds(state);
    if (!owned.length) {
      toast('No seed in your pockets. The seed crate is by the gate.');
      return;
    }
    const spec: ShopSpec = {
      title: 'Sow a row',
      subtitle: 'Only this season’s crops will take.',
      rows: owned.map((crop) => ({
        label: crop.name,
        detail: `×${state.farm.seeds[crop.id] ?? 0}  ·  ${crop.days}d  ·  ${['easy', 'particular', 'fussy'][crop.difficulty - 1]}`,
        disabled: !inSeason(crop, state.time.season),
        onSelect: () => {
          this.apply(plant(state, tx, ty, crop.id), 'sow');
          return false;
        },
      })),
    };
    bus.emit(EV.SHOP_OPEN, spec);
  }

  private seedShop(): ShopSpec {
    const build = (): ShopSpec => {
      const state = G.state;
      const rows: ShopRow[] = CROPS.map((crop) => {
        const cost = seedPacketCost(crop);
        const wrongSeason = !inSeason(crop, state.time.season);
        return {
          label: crop.name,
          // In season the crate quotes a price; out of season it says when to come back.
          detail: wrongSeason ? seedPacketLabel(crop) : `${cost}g`,
          disabled: wrongSeason || state.gold < cost,
          onSelect: () => {
            const result = buySeeds(state, crop.id);
            toast(result.message);
            if (result.ok) {
              bus.emit(EV.GOLD_CHANGED, state.gold);
              bus.emit(EV.FARM_CHANGED);
            }
          },
        };
      });
      const next = nextTier(state);
      if (next) {
        rows.push({
          label: `Expand garden to ${next.w}×${next.h}`,
          detail: `${next.cost}g`,
          disabled: state.gold < next.cost,
          onSelect: () => {
            const result = expandGarden(state);
            toast(result.message);
            if (result.ok) {
              bus.emit(EV.GOLD_CHANGED, state.gold);
              bus.emit(EV.FARM_CHANGED);
            }
          },
        });
      }
      return {
        title: 'Seed crate',
        subtitle: `${state.gold.toLocaleString('en-US')}g  ·  ${FARM.seedsPerPacket} seeds a packet`,
        rows,
        refresh: build,
      };
    };
    return build();
  }

  private shipShop(): ShopSpec {
    const build = (): ShopSpec => {
      const state = G.state;
      const held = Object.entries(state.farm.produce).filter(([, n]) => n > 0);
      const rows: ShopRow[] = held.map(([id, n]) => {
        const crop = CROP_BY_ID[id];
        return {
          label: `${crop?.name ?? id} ×${n}`,
          detail: `${(crop?.sellPrice ?? 0) * n}g`,
          disabled: true,
          onSelect: () => {},
        };
      });
      rows.push({
        label: held.length ? 'Ship the lot' : 'Nothing to ship',
        detail: held.length ? `${produceValue(state)}g` : '',
        disabled: !held.length,
        onSelect: () => {
          const result = sellProduce(state);
          toast(result.message);
          if (result.ok) {
            bus.emit(EV.GOLD_CHANGED, state.gold);
            bus.emit(EV.FARM_CHANGED);
          }
          return false;
        },
      });
      const prizes = state.farm.prizes > 0 ? `  ·  ${state.farm.prizes} prize` : '';
      return {
        title: 'Shipping crate',
        subtitle: `${produceCount(state)} crops waiting  ·  ${state.gold.toLocaleString('en-US')}g in the tin${prizes}`,
        rows,
        refresh: build,
      };
    };
    return build();
  }
}
