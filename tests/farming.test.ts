import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { CROP_BY_ID, FALL, FARM, SPRING, SUMMER, WINTER } from '../src/config/crops';
import { createNewGame } from '../src/state/GameState';
import {
  advanceDay, buySeeds, clear, dayReportMessage, daysToDeath, growthStage, harvest, isRipe,
  isWilting, plant, plotAt, produceValue, pullWeeds, refillBucket, rollRain, seedPacketCost,
  sellProduce, stageOf, till, water,
} from '../src/systems/FarmingSystem';

const P = FARM.plot;
const X: number = P.x0;
const Y: number = P.y0;

/** A night with no rain and no weeds, so growth tests only measure watering. */
const night = (s: ReturnType<typeof createNewGame>, days = 1) =>
  advanceDay(s, days, { rain: false, random: () => 1 });

/** Till, sow and water-through a crop to ripeness. */
const grow = (state: ReturnType<typeof createNewGame>, cropId: string, x: number = X, y: number = Y) => {
  till(state, x, y);
  plant(state, x, y, cropId);
  const days = CROP_BY_ID[cropId].days;
  for (let d = 0; d < days; d++) {
    water(state, x, y);
    night(state);
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
    night(s);
    expect(plotAt(s, X, Y)!.growth).toBe(0);

    expect(water(s, X, Y).ok).toBe(true);
    expect(water(s, X, Y).ok).toBe(false); // already watered today
    night(s);
    expect(plotAt(s, X, Y)!.growth).toBe(1);
    expect(plotAt(s, X, Y)!.watered).toBe(false);
  });

  it('ripens after the crop’s watered days and reports the morning news', () => {
    const s = createNewGame();
    till(s, X, Y);
    plant(s, X, Y, 'carrot');
    const days = CROP_BY_ID.carrot.days;
    let report = night(s);
    for (let d = 1; d < days; d++) {
      water(s, X, Y);
      report = night(s);
    }
    expect(isRipe(plotAt(s, X, Y))).toBe(false);
    water(s, X, Y);
    report = night(s);
    expect(isRipe(plotAt(s, X, Y))).toBe(true);
    expect(report.ripened).toBe(1);
    expect(dayReportMessage(report)).toContain('ready to pick');
    expect(growthStage(plotAt(s, X, Y)!)).toBe(3);
  });

  it('harvesting a carrot fills the basket and frees the soil', () => {
    const s = createNewGame();
    const before = s.inventory.carrots;
    grow(s, 'carrot');
    const r = harvest(s, X, Y);
    expect(r.ok).toBe(true);
    // Watered every day, so it comes up a prize crop: double the yield.
    expect(r.message).toContain('Prize');
    expect(s.inventory.carrots).toBe(before + FARM.care.prizeMultiplier);
    expect(s.farm.harvested).toBe(1);
    expect(s.farm.prizes).toBe(1);
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
    // The prize bale that would not fit in the barn goes to the crate instead of vanishing.
    expect(s.farm.produce.timothy).toBe(FARM.care.prizeMultiplier - 1);

    grow(s, 'timothy', X + 1, Y);
    expect(harvest(s, X + 1, Y).ok).toBe(true);
    expect(s.farm.produce.timothy).toBe(FARM.care.prizeMultiplier * 2 - 1);
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
      night(s);
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
    const report = night(s);
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
    const value = CROP_BY_ID.pumpkin.sellPrice * FARM.care.prizeMultiplier;
    expect(produceValue(s)).toBe(value);
    expect(sellProduce(s).ok).toBe(true);
    expect(s.gold).toBe(gold + value);
    expect(sellProduce(s).ok).toBe(false);
  });

  it('charges the day for the work: every action costs minutes', () => {
    const s = createNewGame();
    expect(till(s, X, Y).minutes).toBe(FARM.minutes.till);
    expect(plant(s, X, Y, 'carrot').minutes).toBe(FARM.minutes.sow);
    expect(water(s, X, Y).minutes).toBe(FARM.minutes.water);
  });
});

describe('FarmingSystem care', () => {
  const sown = (cropId = 'carrot') => {
    const s = createNewGame();
    s.farm.seeds[cropId] = 3;
    till(s, X, Y);
    plant(s, X, Y, cropId);
    return s;
  };

  it('wilts a crop the first morning it is missed and kills it on the third', () => {
    const s = sown();
    expect(isWilting(plotAt(s, X, Y))).toBe(false);

    const first = night(s);
    expect(first.wilting).toBe(1);
    expect(isWilting(plotAt(s, X, Y))).toBe(true);
    expect(daysToDeath(plotAt(s, X, Y)!)).toBe(FARM.care.dieAfterDryDays - 1);
    expect(stageOf(s, X, Y)).toBe('thirsty');

    night(s);
    expect(plotAt(s, X, Y)!.withered).toBe(false);
    const third = night(s);
    expect(third.died).toBe(1);
    expect(stageOf(s, X, Y)).toBe('withered');
    expect(dayReportMessage(third)).toContain('died of thirst');
  });

  it('watering rescues a wilting crop and resets the clock on it', () => {
    const s = sown();
    night(s);
    expect(isWilting(plotAt(s, X, Y))).toBe(true);
    const r = water(s, X, Y);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('pull through');
    expect(plotAt(s, X, Y)!.dryDays).toBe(0);
    night(s);
    expect(plotAt(s, X, Y)!.growth).toBe(1);
    expect(isWilting(plotAt(s, X, Y))).toBe(false); // saved, and back on the growing clock
    // But the missed morning is remembered: no prize for this one.
    expect(plotAt(s, X, Y)!.neglect).toBe(1);
  });

  it('a neglected crop still grows but loses its prize', () => {
    const s = sown();
    night(s);                       // one dry morning: neglect
    const days = CROP_BY_ID.carrot.days;
    for (let d = 0; d < days; d++) {
      water(s, X, Y);
      night(s);
    }
    const before = s.inventory.carrots;
    const r = harvest(s, X, Y);
    expect(r.ok).toBe(true);
    expect(r.message).not.toContain('Prize');
    expect(s.inventory.carrots).toBe(before + 1);
    expect(s.farm.prizes).toBe(0);
  });

  it('rain waters the whole garden overnight', () => {
    const s = sown();
    till(s, X + 1, Y);
    plant(s, X + 1, Y, 'carrot');
    const report = advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(report.rained).toBe(true);
    expect(report.grown).toBe(2);
    expect(plotAt(s, X, Y)!.growth).toBe(1);
    expect(plotAt(s, X + 1, Y)!.growth).toBe(1);
    expect(s.farm.rained).toBe(true);
    expect(dayReportMessage(report)).toContain('Rain overnight');
  });

  it('weeds choke a square until they are pulled', () => {
    const s = sown();
    // random() = 0 makes every weed roll succeed.
    const report = advanceDay(s, 1, { rain: true, random: () => 0 });
    expect(report.weedy).toBe(1);
    expect(stageOf(s, X, Y)).toBe('weedy');

    const growth = plotAt(s, X, Y)!.growth;
    expect(water(s, X, Y).ok).toBe(false);       // the weeds would drink it
    advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(plotAt(s, X, Y)!.growth).toBe(growth); // choked: no growth even in the rain

    expect(pullWeeds(s, X, Y).ok).toBe(true);
    expect(stageOf(s, X, Y)).toBe('growing');
    advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(plotAt(s, X, Y)!.growth).toBe(growth + 1);
  });

  it('bare soil left weedy goes back to grass', () => {
    const s = createNewGame();
    till(s, X, Y);
    advanceDay(s, 1, { rain: false, random: () => 0 });   // weeds move in
    expect(stageOf(s, X, Y)).toBe('weedy');
    const report = advanceDay(s, FARM.care.weedsReclaimAfter, { rain: false, random: () => 1 });
    expect(report.reclaimed).toBe(1);
    expect(stageOf(s, X, Y)).toBe('wild');
  });

  it('the bucket runs dry and refills at the pump', () => {
    const s = sown();
    s.farm.water = 1;
    expect(water(s, X, Y).ok).toBe(true);
    expect(s.farm.water).toBe(0);

    till(s, X + 1, Y);
    plant(s, X + 1, Y, 'carrot');
    const dry = water(s, X + 1, Y);
    expect(dry.ok).toBe(false);
    expect(dry.message).toContain('pump');

    expect(refillBucket(s).ok).toBe(true);
    expect(s.farm.water).toBe(FARM.care.bucketCapacity);
    expect(refillBucket(s).ok).toBe(false);
    expect(water(s, X + 1, Y).ok).toBe(true);
  });

  it('rolls rain by season', () => {
    expect(rollRain(SPRING, () => 0)).toBe(true);
    expect(rollRain(SPRING, () => 0.99)).toBe(false);
    // Winter is the driest month on the ridge.
    expect(rollRain(WINTER, () => 0.2)).toBe(false);
    expect(rollRain(SUMMER, () => 0.2)).toBe(false);
  });
});
