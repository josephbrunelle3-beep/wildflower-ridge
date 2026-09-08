import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { CROP_BY_ID, FALL, FARM, SPRING, SUMMER } from '../src/config/crops';
import { createNewGame } from '../src/state/GameState';
import {
  advanceDay, buySeeds, clear, dayReportMessage, growthStage, harvest, isRipe, plant, plotAt,
  produceValue, seedPacketCost, sellProduce, stageOf, till, water,
} from '../src/systems/FarmingSystem';

const P = FARM.plot;
const X: number = P.x0;
const Y: number = P.y0;

/** Till, sow and water-through a crop to ripeness. */
const grow = (state: ReturnType<typeof createNewGame>, cropId: string, x: number = X, y: number = Y) => {
  till(state, x, y);
  plant(state, x, y, cropId);
  const days = CROP_BY_ID[cropId].days;
  for (let d = 0; d < days; d++) {
    water(state, x, y);
    advanceDay(state);
  }
};

describe('FarmingSystem', () => {
  it('only tills inside the garden plot, and only once', () => {
    const s = createNewGame();
    expect(till(s, P.x1 + 4, Y).ok).toBe(false);
    expect(till(s, X, Y).ok).toBe(true);
    expect(stageOf(s, X, Y)).toBe('tilled');
    expect(till(s, X, Y).ok).toBe(false);
  });

  it('sows only on tilled soil, in season, and spends a seed', () => {
    const s = createNewGame();
    s.time.season = SPRING;
    expect(plant(s, X, Y, 'carrot').ok).toBe(false); // not tilled
    till(s, X, Y);
    expect(plant(s, X, Y, 'pumpkin').ok).toBe(false); // no seed
    s.farm.seeds.pumpkin = 1;
    expect(plant(s, X, Y, 'pumpkin').ok).toBe(false); // fall crop, spring day
    expect(plant(s, X, Y, 'carrot').ok).toBe(true);
    expect(s.farm.seeds.carrot).toBe(2);
    expect(stageOf(s, X, Y)).toBe('growing');
  });

  it('grows only on watered days and dries out overnight', () => {
    const s = createNewGame();
    till(s, X, Y);
    plant(s, X, Y, 'carrot');
    advanceDay(s);
    expect(plotAt(s, X, Y)!.growth).toBe(0);

    expect(water(s, X, Y).ok).toBe(true);
    expect(water(s, X, Y).ok).toBe(false); // already watered today
    advanceDay(s);
    expect(plotAt(s, X, Y)!.growth).toBe(1);
    expect(plotAt(s, X, Y)!.watered).toBe(false);
  });

  it('ripens after the crop’s watered days and reports the morning news', () => {
    const s = createNewGame();
    till(s, X, Y);
    plant(s, X, Y, 'carrot');
    const days = CROP_BY_ID.carrot.days;
    let report = advanceDay(s);
    for (let d = 1; d < days; d++) {
      water(s, X, Y);
      report = advanceDay(s);
    }
    expect(isRipe(plotAt(s, X, Y))).toBe(false);
    water(s, X, Y);
    report = advanceDay(s);
    expect(isRipe(plotAt(s, X, Y))).toBe(true);
    expect(report.ripened).toBe(1);
    expect(dayReportMessage(report)).toContain('ready to pick');
    expect(growthStage(plotAt(s, X, Y)!)).toBe(3);
  });

  it('harvesting a carrot fills the basket and frees the soil', () => {
    const s = createNewGame();
    const before = s.inventory.carrots;
    grow(s, 'carrot');
    expect(harvest(s, X, Y).ok).toBe(true);
    expect(s.inventory.carrots).toBe(before + 1);
    expect(s.farm.harvested).toBe(1);
    expect(stageOf(s, X, Y)).toBe('tilled');
  });

  it('hay goes to the barn until it is full, then to the crate', () => {
    const s = createNewGame();
    s.time.season = SUMMER;
    s.farm.seeds.timothy = 2;
    s.inventory.hay = BALANCE.maxHay - 1;
    grow(s, 'timothy');
    expect(harvest(s, X, Y).ok).toBe(true);
    expect(s.inventory.hay).toBe(BALANCE.maxHay);

    grow(s, 'timothy', X + 1, Y);
    expect(harvest(s, X + 1, Y).ok).toBe(true);
    expect(s.farm.produce.timothy).toBe(1);
  });

  it('a regrowing crop stays in the ground and comes back', () => {
    const s = createNewGame();
    s.time.season = SUMMER;
    s.farm.seeds.tomato = 1;
    grow(s, 'tomato');
    expect(harvest(s, X, Y).ok).toBe(true);
    expect(stageOf(s, X, Y)).toBe('growing');
    const { days, regrowDays } = CROP_BY_ID.tomato;
    expect(plotAt(s, X, Y)!.growth).toBe(days - regrowDays!);
    for (let d = 0; d < regrowDays!; d++) {
      water(s, X, Y);
      advanceDay(s);
    }
    expect(isRipe(plotAt(s, X, Y))).toBe(true);
  });

  it('refuses an unripe harvest and says how long is left', () => {
    const s = createNewGame();
    till(s, X, Y);
    plant(s, X, Y, 'carrot');
    const r = harvest(s, X, Y);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('4');
  });

  it('withers a crop caught by the turn of the season, and it can be cleared', () => {
    const s = createNewGame();
    s.time.season = SPRING;
    s.farm.seeds.sweetpea = 1;
    till(s, X, Y);
    expect(plant(s, X, Y, 'sweetpea').ok).toBe(true);
    s.time.season = SUMMER;
    const report = advanceDay(s);
    expect(report.withered).toBe(1);
    expect(stageOf(s, X, Y)).toBe('withered');
    expect(water(s, X, Y).ok).toBe(false);
    expect(harvest(s, X, Y).ok).toBe(false);
    expect(clear(s, X, Y).ok).toBe(true);
    expect(stageOf(s, X, Y)).toBe('tilled');
  });

  it('buys seed packets against gold and refuses when short', () => {
    const s = createNewGame();
    const cost = seedPacketCost(CROP_BY_ID.pumpkin);
    s.gold = cost;
    expect(buySeeds(s, 'pumpkin').ok).toBe(true);
    expect(s.farm.seeds.pumpkin).toBe(FARM.seedsPerPacket);
    expect(s.gold).toBe(0);
    expect(buySeeds(s, 'pumpkin').ok).toBe(false);
    expect(s.farm.seeds.pumpkin).toBe(FARM.seedsPerPacket);
  });

  it('ships the crate for the sum of its crops', () => {
    const s = createNewGame();
    s.time.season = FALL;
    s.farm.seeds.pumpkin = 1;
    const gold = s.gold;
    grow(s, 'pumpkin');
    harvest(s, X, Y);
    expect(produceValue(s)).toBe(CROP_BY_ID.pumpkin.sellPrice);
    expect(sellProduce(s).ok).toBe(true);
    expect(s.gold).toBe(gold + CROP_BY_ID.pumpkin.sellPrice);
    expect(sellProduce(s).ok).toBe(false);
  });
});
