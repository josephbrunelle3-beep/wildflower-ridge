import Phaser from 'phaser';
import { CROP_BY_ID, CROPS, FARM, inSeason, seedPacketLabel } from '../config/crops';
import { TEX } from '../config/keys';
import { TILE, TILE_SIZE } from '../config/tiles';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import { selectedItem } from '../systems/HorseCareSystem';
import type { InteractionSystem } from '../systems/InteractionSystem';
import {
  buySeeds, clear, cropOf, daysToDeath, growthStage, harvest, isWilting, plantableSeeds, plant,
  plotAt, plotKey, produceCount, produceValue, pullWeeds, refillBucket, seedPacketCost, sellProduce,
  stageOf, till, water, type FarmResult,
} from '../systems/FarmingSystem';
import { FARM_FRAME, cropFrame, generateFarmTextures } from './CropTextures';
import { buildFarmYard } from './FarmYard';
import type { ShopRow, ShopSpec } from '../ui/ShopMenu';

const SOIL_DEPTH = 2;
const PLANT_DEPTH = 3;
const OVERLAY_DEPTH = 4;

/** A thirsty crop goes sallow, then bleached, before it dies. */
const WILT_TINTS = [0xffffff, 0xd8c07e, 0xb49a62];

const toast = (text: string) => bus.emit(EV.TOAST, text);

/**
 * The farmyard in the world: the fence and track, soil and crop sprites, one interactable
 * per square, the crates and the pump. All the rules live in `systems/FarmingSystem`; this
 * class draws them and turns an [E] into a call.
 */
export class FarmLayer {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  private readonly scene: Phaser.Scene;
  private readonly decor: Phaser.Tilemaps.TilemapLayer;
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
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    for (const map of [this.soil, this.plants, this.overlays]) {
      map.forEach((i) => i.destroy());
      map.clear();
    }
  }

  // --- Drawing ---------------------------------------------------------------

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

    // Weeds and the dry crust lie over the crop, never instead of it.
    const overlay = plotState.weedy ? FARM_FRAME.WEEDS : isWilting(plotState) ? FARM_FRAME.WILT : -1;
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

  private promptFor(tx: number, ty: number): string {
    const state = G.state;
    const plotState = plotAt(state, tx, ty);
    switch (stageOf(state, tx, ty)) {
      case 'wild':
        return '[E] Till the soil';
      case 'tilled':
        return plantableSeeds(state).length ? '[E] Sow seed' : '[E] Bare soil — buy seed at the crate';
      case 'weedy':
        return '[E] Pull the weeds';
      case 'withered':
        return '[E] Clear the dead crop';
      case 'ripe': {
        const crop = cropOf(plotState);
        return `[E] Harvest ${crop?.name.toLowerCase() ?? 'crop'}${plotState?.neglect === 0 ? ' (prize crop!)' : ''}`;
      }
      case 'thirsty': {
        const left = daysToDeath(plotState!);
        const urgency = left <= 1 ? 'dying' : 'wilting';
        return this.canWater()
          ? `[E] Water the ${urgency} ${cropOf(plotState)!.name.toLowerCase()} — ${left} ${left === 1 ? 'day' : 'days'} left`
          : `${cropOf(plotState)!.name}: ${urgency}! ${this.waterHint()}`;
      }
      default: {
        const crop = cropOf(plotState)!;
        const left = Math.max(1, crop.days - plotState!.growth);
        if (plotState!.watered) return `${crop.name} · watered · ${left} ${left === 1 ? 'day' : 'days'} to go`;
        return this.canWater() ? `[E] Water the ${crop.name.toLowerCase()}` : `${crop.name}: dry — ${this.waterHint()}`;
      }
    }
  }

  private canWater(): boolean {
    return selectedItem(G.state) === 'bucket' && G.state.farm.water > 0;
  }

  private waterHint(): string {
    if (selectedItem(G.state) !== 'bucket') return 'select the bucket (3)';
    return 'the bucket is empty, refill at the pump';
  }

  private interactWith(tx: number, ty: number): void {
    const state = G.state;
    switch (stageOf(state, tx, ty)) {
      case 'wild':
        this.apply(till(state, tx, ty));
        break;
      case 'tilled':
        this.openSowMenu(tx, ty);
        break;
      case 'weedy':
        this.apply(pullWeeds(state, tx, ty));
        break;
      case 'withered':
        this.apply(clear(state, tx, ty));
        break;
      case 'ripe': {
        const result = harvest(state, tx, ty);
        this.apply(result);
        if (result.ok) bus.emit(EV.INVENTORY_CHANGED);
        break;
      }
      default: {
        if (selectedItem(state) !== 'bucket') {
          toast('Select the bucket (3) to water the garden.');
          return;
        }
        const result = water(state, tx, ty);
        this.apply(result);
        if (result.ok) bus.emit(EV.INVENTORY_CHANGED);
      }
    }
  }

  /** Toast the outcome, redraw, and put the time the work took on the clock. */
  private apply(result: FarmResult): void {
    toast(result.message);
    if (!result.ok) return;
    bus.emit(EV.FARM_CHANGED);
    if (result.minutes) bus.emit(EV.TIME_SPEND, result.minutes);
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
        detail: `×${state.farm.seeds[crop.id] ?? 0}  ·  ${crop.days}d`,
        disabled: !inSeason(crop, state.time.season),
        onSelect: () => {
          this.apply(plant(state, tx, ty, crop.id));
          return false;
        },
      })),
    };
    bus.emit(EV.SHOP_OPEN, spec);
  }

  private seedShop(): ShopSpec {
    const build = (): ShopSpec => {
      const state = G.state;
      return {
        title: 'Seed crate',
        subtitle: `${state.gold.toLocaleString('en-US')}g  ·  ${FARM.seedsPerPacket} seeds a packet`,
        rows: CROPS.map((crop) => {
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
        }),
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
