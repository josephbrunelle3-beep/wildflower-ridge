import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { CROP_BY_ID, FALL, FARM, plotAtTier, SPRING, SUMMER, WINTER } from '../src/config/crops';
import { createNewGame } from '../src/state/GameState';
import {
  activePlot, advanceDay, applyHarvest, applyWatering, applyWeeding, buySeeds, canWater, clear, dayReportMessage,
  daysToDeath, describePlot, expandGarden, growthStage, harvestSpread, inGarden, isChoked, isRipe, isWilting,
  nextTier, plant, plotAt, produceValue, refillBucket, rollRain, seedPacketCost, sellProduce, soilDamp, stageOf, till,
} from '../src/systems/FarmingSystem';

const P = FARM.plot;
const X: number = P.x0;
const Y: number = P.y0;

/** A night with no rain and no weeds, so growth tests only measure watering. */
const night = (s: ReturnType<typeof createNewGame>, days = 1) =>
  advanceDay(s, days, { rain: false, random: () => 1 });

/** Water a row the way a perfect pour does. */
const water = (s: ReturnType<typeof createNewGame>, x: number, y: number) => applyWatering(s, x, y, 'perfect');

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

/** Pick every piece, the way a clean harvest game ends. */
const pickAll = (state: ReturnType<typeof createNewGame>, x: number, y: number) =>
  applyHarvest(state, x, y, CROP_BY_ID[plotAt(state, x, y)!.crop!].harvestItems);

describe('FarmingSystem', () => {
  it('only tills inside the garden, and only once', () => {
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
    expect(canWater(s, X, Y).ok).toBe(false); // already watered today
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
    expect(describePlot(plotAt(s, X, Y)!)).toContain('Ripe');
  });

  it('a clean harvest of carrots fills the basket, doubled as a prize', () => {
    const s = createNewGame();
    const before = s.inventory.carrots;
    grow(s, 'carrot');
    const r = pickAll(s, X, Y);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Prize');
    expect(s.inventory.carrots).toBe(before + CROP_BY_ID.carrot.harvestItems * FARM.care.prizeMultiplier);
    expect(s.farm.harvested).toBe(1);
    expect(s.farm.prizes).toBe(1);
    expect(stageOf(s, X, Y)).toBe('tilled');
  });

  it('the basket is what the harvest game picked: fewer pieces, no prize', () => {
    const s = createNewGame();
    const before = s.inventory.carrots;
    grow(s, 'carrot');
    const r = applyHarvest(s, X, Y, 1);
    expect(r.ok).toBe(true);
    expect(r.message).not.toContain('Prize');
    expect(s.inventory.carrots).toBe(before + 1);
    expect(applyHarvest(s, X, Y, 0).ok).toBe(false); // the row is bare now
  });

  it('hay goes to the barn until it is full, then to the crate', () => {
    const s = createNewGame();
    s.time.season = SUMMER;
    s.farm.seeds.timothy = 2;
    s.inventory.hay = BALANCE.maxHay - 1;
    grow(s, 'timothy');
    expect(pickAll(s, X, Y).ok).toBe(true);
    expect(s.inventory.hay).toBe(BALANCE.maxHay);
    // What would not fit in the barn goes to the crate instead of vanishing.
    const yieldCount = CROP_BY_ID.timothy.harvestItems * FARM.care.prizeMultiplier;
    expect(s.farm.produce.timothy).toBe(yieldCount - 1);
  });

  it('a regrowing crop stays in the ground and comes back', () => {
    const s = createNewGame();
    s.time.season = SUMMER;
    s.farm.seeds.tomato = 1;
    grow(s, 'tomato');
    expect(pickAll(s, X, Y).ok).toBe(true);
    expect(stageOf(s, X, Y)).toBe('growing');
    const { days, regrowDays } = CROP_BY_ID.tomato;
    expect(plotAt(s, X, Y)!.growth).toBe(days - regrowDays!);
    for (let d = 0; d < regrowDays!; d++) {
      water(s, X, Y);
      night(s);
    }
    expect(isRipe(plotAt(s, X, Y))).toBe(true);
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
    expect(canWater(s, X, Y).ok).toBe(false);
    expect(applyHarvest(s, X, Y, 1).ok).toBe(false);
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
    pickAll(s, X, Y);
    const value = CROP_BY_ID.pumpkin.sellPrice * CROP_BY_ID.pumpkin.harvestItems * FARM.care.prizeMultiplier;
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

describe('The garden’s footprint', () => {
  it('starts small and grows a tier at a time, for gold', () => {
    const s = createNewGame();
    const first = FARM.tiers[0];
    expect(activePlot(s)).toEqual(plotAtTier(0));
    expect(inGarden(s, X + first.w - 1, Y + first.h - 1)).toBe(true);
    expect(inGarden(s, X + first.w, Y)).toBe(false);
    expect(stageOf(s, X + first.w, Y)).toBe('locked');
    expect(till(s, X + first.w, Y).ok).toBe(false);

    const next = nextTier(s)!;
    expect(next.tier).toBe(1);
    s.gold = next.cost - 1;
    expect(expandGarden(s).ok).toBe(false);
    s.gold = next.cost;
    expect(expandGarden(s).ok).toBe(true);
    expect(s.gold).toBe(0);
    expect(s.farm.tier).toBe(1);
    expect(inGarden(s, X + first.w, Y)).toBe(true);
    expect(till(s, X + first.w, Y).ok).toBe(true);
  });

  it('stops at the yard fence', () => {
    const s = createNewGame();
    s.gold = 1e6;
    while (nextTier(s)) expect(expandGarden(s).ok).toBe(true);
    expect(s.farm.tier).toBe(FARM.tiers.length - 1);
    expect(activePlot(s)).toEqual(FARM.plot);
    expect(expandGarden(s).ok).toBe(false);
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
    expect(describePlot(plotAt(s, X, Y)!)).toContain('wilting');

    night(s);
    expect(plotAt(s, X, Y)!.withered).toBe(false);
    const third = night(s);
    expect(third.died).toBe(1);
    expect(stageOf(s, X, Y)).toBe('withered');
    expect(dayReportMessage(third)).toContain('died of thirst');
  });

  it('a perfect pour rescues a wilting crop; the missed morning still costs the prize', () => {
    const s = sown();
    night(s);
    expect(isWilting(plotAt(s, X, Y))).toBe(true);
    const r = water(s, X, Y);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('pull through');
    expect(plotAt(s, X, Y)!.dryDays).toBe(0);
    night(s);
    expect(plotAt(s, X, Y)!.growth).toBe(1);
    expect(isWilting(plotAt(s, X, Y))).toBe(false);
    expect(plotAt(s, X, Y)!.neglect).toBe(1);
  });

  it('an under-pour spends the bucket and leaves the row dry; an over-pour waters but costs the prize', () => {
    const s = sown();
    const charges = s.farm.water;
    expect(applyWatering(s, X, Y, 'under').ok).toBe(true);
    expect(s.farm.water).toBe(charges - 1);
    expect(plotAt(s, X, Y)!.watered).toBe(false);
    expect(canWater(s, X, Y).ok).toBe(true); // another go is allowed

    expect(applyWatering(s, X, Y, 'over').ok).toBe(true);
    expect(s.farm.water).toBe(charges - 2);
    expect(plotAt(s, X, Y)!.watered).toBe(true);
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
    const r = pickAll(s, X, Y);
    expect(r.ok).toBe(true);
    expect(r.message).not.toContain('Prize');
    expect(s.inventory.carrots).toBe(before + CROP_BY_ID.carrot.harvestItems);
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

  it('weeds sprout small, grow a level a night, and choke the square at the top', () => {
    const s = sown();
    // random() = 0 makes every sprout roll succeed.
    let report = advanceDay(s, 1, { rain: true, random: () => 0 });
    expect(report.weedy).toBe(1);
    expect(plotAt(s, X, Y)!.weeds).toBe(1);
    expect(isChoked(plotAt(s, X, Y))).toBe(false);
    expect(plotAt(s, X, Y)!.growth).toBe(1);             // small weeds are a warning, not a wall
    expect(describePlot(plotAt(s, X, Y)!)).toContain('weeds');

    report = advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(plotAt(s, X, Y)!.weeds).toBe(2);
    expect(plotAt(s, X, Y)!.growth).toBe(2);

    report = advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(plotAt(s, X, Y)!.weeds).toBe(FARM.care.weedsChoke);
    expect(report.choked).toBe(1);
    expect(isChoked(plotAt(s, X, Y))).toBe(true);
    expect(dayReportMessage(report)).toContain('choked');

    const growth = plotAt(s, X, Y)!.growth;
    advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(plotAt(s, X, Y)!.growth).toBe(growth);        // choked: no growth even in the rain
    expect(plotAt(s, X, Y)!.neglect).toBeGreaterThan(0);
  });

  it('the weeding game clears what was pulled and charges torn leaves against the prize', () => {
    const s = sown();
    advanceDay(s, 1, { rain: true, random: () => 0 });
    advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(plotAt(s, X, Y)!.weeds).toBe(2);

    // Leave early with one still standing: the square stays weedy, at a lower level.
    let r = applyWeeding(s, X, Y, { pulled: 2, remaining: 1, damage: 0 });
    expect(r.ok).toBe(true);
    expect(plotAt(s, X, Y)!.weeds).toBe(1);
    expect(plotAt(s, X, Y)!.neglect).toBe(0);

    // Finish the job, but tear a leaf on the way.
    r = applyWeeding(s, X, Y, { pulled: 1, remaining: 0, damage: 1 });
    expect(r.ok).toBe(true);
    expect(r.message).toContain('torn leaf');
    expect(plotAt(s, X, Y)!.weeds).toBe(0);
    expect(plotAt(s, X, Y)!.neglect).toBe(1);
    expect(applyWeeding(s, X, Y, { pulled: 0, remaining: 0, damage: 0 }).ok).toBe(false);
  });

  it('bare soil left choked goes back to grass', () => {
    const s = createNewGame();
    till(s, X, Y);
    advanceDay(s, 1, { rain: false, random: () => 0 });   // weeds move in
    expect(stageOf(s, X, Y)).toBe('tilled');
    expect(plotAt(s, X, Y)!.weeds).toBe(1);
    expect(plant(s, X, Y, 'carrot').ok).toBe(false);      // pull them before sowing
    // Grow to choking, then sit choked long enough for the grass to take it back.
    advanceDay(s, FARM.care.weedsChoke - 1, { rain: false, random: () => 1 });
    expect(isChoked(plotAt(s, X, Y))).toBe(true);
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
    const dry = canWater(s, X + 1, Y);
    expect(dry.ok).toBe(false);
    expect(dry.message).toContain('pump');

    expect(refillBucket(s).ok).toBe(true);
    expect(s.farm.water).toBe(FARM.care.bucketCapacity);
    expect(refillBucket(s).ok).toBe(false);
    expect(water(s, X + 1, Y).ok).toBe(true);
  });

  it('what is on the plant at harvest is a record of how it was kept', () => {
    const s = sown();
    const items = CROP_BY_ID.carrot.harvestItems;
    grow(s, 'carrot');
    expect(harvestSpread(plotAt(s, X, Y)!)).toEqual({ ripe: items, under: 0, over: 0 });

    // A slip-up leaves a piece under-ripe; a night left standing past ripe sends one over.
    plotAt(s, X, Y)!.neglect = 1;
    expect(harvestSpread(plotAt(s, X, Y)!)).toEqual({ ripe: items - 1, under: 1, over: 0 });
    night(s);
    expect(harvestSpread(plotAt(s, X, Y)!)).toEqual({ ripe: items - 2, under: 1, over: 1 });
    expect(isRipe(plotAt(s, X, Y))).toBe(true);           // still pickable, just less of it
    // But never nothing: there is always at least one piece worth picking.
    plotAt(s, X, Y)!.neglect = 99;
    plotAt(s, X, Y)!.growth = 99;
    expect(harvestSpread(plotAt(s, X, Y)!).ripe).toBe(1);
  });

  it('the soil is damp after a watering or a wet night', () => {
    const s = sown();
    expect(soilDamp(s, plotAt(s, X, Y)!)).toBe(false);
    water(s, X, Y);
    expect(soilDamp(s, plotAt(s, X, Y)!)).toBe(true);
    advanceDay(s, 1, { rain: true, random: () => 1 });
    expect(soilDamp(s, plotAt(s, X, Y)!)).toBe(true);
    advanceDay(s, 1, { rain: false, random: () => 1 });
    expect(soilDamp(s, plotAt(s, X, Y)!)).toBe(false);
  });

  it('rolls rain by season', () => {
    expect(rollRain(SPRING, () => 0)).toBe(true);
    expect(rollRain(SPRING, () => 0.99)).toBe(false);
    // Winter is the driest month on the ridge.
    expect(rollRain(WINTER, () => 0.2)).toBe(false);
    expect(rollRain(SUMMER, () => 0.2)).toBe(false);
  });
});
