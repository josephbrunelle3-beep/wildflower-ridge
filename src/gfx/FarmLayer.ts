import Phaser from 'phaser';
import { CROP_BY_ID, CROPS, FARM, inSeason, seedPacketLabel } from '../config/crops';
import { TEX } from '../config/keys';
import { TILE, TILE_SIZE } from '../config/tiles';
import { bus, EV } from '../core/EventBus';
import { G } from '../core/Session';
import { selectedItem } from '../systems/HorseCareSystem';
import type { InteractionSystem } from '../systems/InteractionSystem';
import {
  buySeeds, clear, cropOf, growthStage, harvest, plantableSeeds, plant, plotAt, plotKey,
  produceCount, produceValue, seedPacketCost, sellProduce, stageOf, till, water,
} from '../systems/FarmingSystem';
import { FARM_FRAME, cropFrame, generateFarmTextures } from './CropTextures';
import type { ShopRow, ShopSpec } from '../ui/ShopMenu';

const SOIL_DEPTH = 2;
const PLANT_DEPTH = 3;

const toast = (text: string) => bus.emit(EV.TOAST, text);

/**
 * The kitchen garden in the world: soil and crop sprites over the ground layer, one
 * interactable per square, and the two crates. All the rules live in
 * `systems/FarmingSystem`; this class only draws them and turns an [E] into a call.
 */
export class FarmLayer {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  private readonly scene: Phaser.Scene;
  private readonly decor: Phaser.Tilemaps.TilemapLayer;
  private readonly soil = new Map<string, Phaser.GameObjects.Image>();
  private readonly plants = new Map<string, Phaser.GameObjects.Image>();
  private readonly unsubs: (() => void)[] = [];

  constructor(scene: Phaser.Scene, decor: Phaser.Tilemaps.TilemapLayer, interactions: InteractionSystem) {
    this.scene = scene;
    this.decor = decor;
    generateFarmTextures(scene);
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

    this.addCrate(FARM.seedCrate.x, FARM.seedCrate.y, FARM_FRAME.SEED_CRATE, interactions, {
      prompt: () => '[E] Seed crate',
      interact: () => bus.emit(EV.SHOP_OPEN, this.seedShop()),
    });
    this.addCrate(FARM.shipCrate.x, FARM.shipCrate.y, FARM_FRAME.SHIP_CRATE, interactions, {
      prompt: () => '[E] Shipping crate',
      interact: () => bus.emit(EV.SHOP_OPEN, this.shipShop()),
    });

    this.unsubs.push(bus.on(EV.FARM_CHANGED, () => this.refresh()));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.refresh();
  }

  /** Redraw every tilled square from state. Cheap: the plot is a couple of dozen tiles. */
  refresh(): void {
    const p = FARM.plot;
    for (let ty = p.y0; ty <= p.y1; ty++) {
      for (let tx = p.x0; tx <= p.x1; tx++) this.refreshTile(tx, ty);
    }
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.soil.forEach((i) => i.destroy());
    this.plants.forEach((i) => i.destroy());
    this.soil.clear();
    this.plants.clear();
  }

  // --- Drawing ---------------------------------------------------------------

  private refreshTile(tx: number, ty: number): void {
    const key = plotKey(tx, ty);
    const plotState = plotAt(G.state, tx, ty);
    if (!plotState) {
      this.soil.get(key)?.destroy();
      this.plants.get(key)?.destroy();
      this.soil.delete(key);
      this.plants.delete(key);
      return;
    }

    // Hoeing takes the wildflowers with it.
    const decorTile = this.decor.getTileAt(tx, ty);
    if (decorTile && decorTile.index - 1 === TILE.FLOWERS) this.decor.removeTileAt(tx, ty);

    const x = tx * TILE_SIZE + TILE_SIZE / 2;
    const y = ty * TILE_SIZE + TILE_SIZE / 2;
    const frame = plotState.watered ? FARM_FRAME.SOIL_WET : FARM_FRAME.SOIL_DRY;
    const soil = this.soil.get(key) ?? this.scene.add.image(x, y, TEX.FARM, frame).setDepth(SOIL_DEPTH);
    soil.setFrame(frame);
    this.soil.set(key, soil);

    const plantFrame = plotState.withered
      ? FARM_FRAME.WITHERED
      : plotState.crop
        ? cropFrame(plotState.crop, growthStage(plotState))
        : -1;
    let plant = this.plants.get(key);
    if (plantFrame < 0) {
      plant?.destroy();
      this.plants.delete(key);
      return;
    }
    plant = plant ?? this.scene.add.image(x, y, TEX.FARM, plantFrame).setDepth(PLANT_DEPTH);
    plant.setFrame(plantFrame);
    this.plants.set(key, plant);
  }

  private addCrate(
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
    (image.body as Phaser.Physics.Arcade.StaticBody).setSize(14, 10).setOffset(1, 5);
    (image.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    interactions.add({ x, y, radius: 20, ...def });
  }

  // --- Interaction -----------------------------------------------------------

  private promptFor(tx: number, ty: number): string {
    const state = G.state;
    switch (stageOf(state, tx, ty)) {
      case 'wild':
        return '[E] Till the soil';
      case 'tilled':
        return plantableSeeds(state).length ? '[E] Sow seed' : '[E] Bare soil — buy seed at the crate';
      case 'withered':
        return '[E] Clear dead stalks';
      case 'ripe': {
        const crop = cropOf(plotAt(state, tx, ty));
        return `[E] Harvest ${crop?.name.toLowerCase() ?? 'crop'}`;
      }
      default: {
        const plotState = plotAt(state, tx, ty)!;
        const crop = cropOf(plotState)!;
        const left = Math.max(1, crop.days - plotState.growth);
        if (plotState.watered) return `${crop.name} · watered · ${left} ${left === 1 ? 'day' : 'days'} to go`;
        return selectedItem(state) === 'bucket'
          ? `[E] Water the ${crop.name.toLowerCase()}`
          : `${crop.name}: dry — select the bucket (3)`;
      }
    }
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
        this.apply(water(state, tx, ty));
      }
    }
  }

  private apply(result: { ok: boolean; message: string }): void {
    toast(result.message);
    if (result.ok) bus.emit(EV.FARM_CHANGED);
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
      return {
        title: 'Shipping crate',
        subtitle: `${produceCount(state)} crops waiting  ·  ${state.gold.toLocaleString('en-US')}g in the tin`,
        rows,
        refresh: build,
      };
    };
    return build();
  }
}
