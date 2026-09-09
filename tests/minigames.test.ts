import { describe, expect, it } from 'vitest';
import { CROP_BY_ID } from '../src/config/crops';
import { HarvestModel } from '../src/systems/minigames/HarvestModel';
import { harvestParams, wateringParams, weedingParams } from '../src/systems/minigames/tuning';
import { WateringModel } from '../src/systems/minigames/WateringModel';
import { PLANT_X, SOIL_Y, WeedingModel } from '../src/systems/minigames/WeedingModel';

/** A fixed-sequence RNG so layouts are the same every run. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('tuning', () => {
  it('makes fussier crops harder in every game', () => {
    const easy = CROP_BY_ID.carrot;   // difficulty 1
    const hard = CROP_BY_ID.pumpkin;  // difficulty 3
    expect(wateringParams(hard).zoneWidth).toBeLessThan(wateringParams(easy).zoneWidth);
    expect(wateringParams(hard).fillPerSec).toBeGreaterThan(wateringParams(easy).fillPerSec);
    expect(weedingParams(hard, 1).count).toBeGreaterThan(weedingParams(easy, 1).count);
    expect(weedingParams(hard, 1).baseRadius).toBeLessThan(weedingParams(easy, 1).baseRadius);
    expect(weedingParams(hard, 1).minPlantGap).toBeLessThan(weedingParams(easy, 1).minPlantGap);
    expect(harvestParams(hard).ripeWindowSecs).toBeLessThan(harvestParams(easy).ripeWindowSecs);
  });

  it('weeds left longer mean more to pull', () => {
    const crop = CROP_BY_ID.carrot;
    expect(weedingParams(crop, 3).count).toBeGreaterThan(weedingParams(crop, 1).count);
  });
});

describe('WateringModel', () => {
  const params = wateringParams(CROP_BY_ID.carrot);

  it('fills only while pouring and settles the verdict when you let go', () => {
    const m = new WateringModel(params, () => 0.5);
    m.update(1);
    expect(m.level).toBe(0);
    m.startPour();
    m.update(0.5);
    expect(m.level).toBeCloseTo(params.fillPerSec * 0.5);
    expect(m.done).toBe(false);
    expect(m.stopPour()).toBe('under');
    expect(m.done).toBe(true);
    // Once settled, nothing moves it.
    m.startPour();
    m.update(5);
    expect(m.verdict).toBe('under');
  });

  it('is perfect inside the zone and over past it', () => {
    const perfect = new WateringModel(params, () => 0);
    perfect.startPour();
    while (perfect.level < perfect.zoneLo + (perfect.zoneHi - perfect.zoneLo) / 2) perfect.update(0.01);
    expect(perfect.stopPour()).toBe('perfect');

    const over = new WateringModel(params, () => 0);
    over.startPour();
    while (over.level <= over.zoneHi) over.update(0.01);
    expect(over.stopPour()).toBe('over');
  });

  it('spills over on its own if you never let go', () => {
    const m = new WateringModel(params, () => 0);
    m.startPour();
    m.update(60);
    expect(m.level).toBe(1);
    expect(m.verdict).toBe('over');
    expect(m.pouring).toBe(false);
  });

  it('places the sweet spot inside the bar', () => {
    for (const r of [0, 0.5, 1]) {
      const m = new WateringModel(params, () => r);
      expect(m.zoneLo).toBeGreaterThanOrEqual(params.zoneMin);
      expect(m.zoneHi).toBeLessThanOrEqual(1);
      expect(m.zoneHi - m.zoneLo).toBeCloseTo(params.zoneWidth);
    }
  });
});

describe('WeedingModel', () => {
  const params = weedingParams(CROP_BY_ID.carrot, 2);

  it('lays the weeds out either side of the plant, clear of its canopy', () => {
    const m = new WeedingModel(params, seq(0.5));
    expect(m.weeds).toHaveLength(params.count);
    for (const w of m.weeds) {
      expect(Math.abs(w.x - PLANT_X)).toBeGreaterThanOrEqual(params.minPlantGap - 1e-9);
      expect(w.topY).toBeLessThan(w.baseY);
    }
  });

  it('pulls a weed by the base, snaps it by the stalk, and tears the plant by the canopy', () => {
    const m = new WeedingModel(params, seq(0.5));
    const w = m.weeds[0];
    expect(m.grab(w.x, w.baseY)).toBe('pulled');
    expect(w.pulled).toBe(true);
    expect(m.remaining).toBe(params.count - 1);

    const v = m.weeds[1];
    const topBefore = v.topY;
    expect(m.grab(v.x, (v.topY + v.baseY) / 2)).toBe('snapped');
    expect(v.pulled).toBe(false);
    expect(v.snapped).toBe(1);
    expect(v.topY).toBeGreaterThan(topBefore); // shorter now

    expect(m.grab(PLANT_X, SOIL_Y - 0.22)).toBe('plant');
    expect(m.damage).toBe(1);
    expect(m.grab(0.02, 0.02)).toBe('miss');
  });

  it('is done when every weed is out', () => {
    const m = new WeedingModel(params, seq(0.5));
    for (const w of m.weeds) m.grab(w.x, w.baseY);
    expect(m.done).toBe(true);
    expect(m.grab(PLANT_X, SOIL_Y - 0.22)).toBe('miss'); // nothing left to do, nothing to tear
  });

  it('with no plant in the frame, nothing can be torn', () => {
    const m = new WeedingModel({ ...params, canopyRadius: 0 }, seq(0.5));
    expect(m.grab(PLANT_X, SOIL_Y - 0.22)).toBe('miss');
    expect(m.damage).toBe(0);
  });
});

describe('HarvestModel', () => {
  const params = harvestParams(CROP_BY_ID.tomato);

  it('colours the pieces up one after another and lets them go over', () => {
    const m = new HarvestModel(params, 'top', seq(0.5));
    expect(m.pieces).toHaveLength(params.items);
    expect(m.pieces.every((p) => p.state === 'green')).toBe(true);
    m.update(0.4 + params.ripenSecs + 0.01);
    expect(m.pieces.filter((p) => p.state === 'ripe')).toHaveLength(1);
    m.update(params.ripeWindowSecs);
    expect(m.pieces.filter((p) => p.state === 'over')).toHaveLength(1);
  });

  it('picks ripe, bruises green, and loses what went over', () => {
    const m = new HarvestModel(params, 'top', seq(0.5));
    const first = m.pieces.reduce((a, b) => (a.age > b.age ? a : b));
    const last = m.pieces.reduce((a, b) => (a.age < b.age ? a : b));
    expect(m.pick(last.x, last.y)).toBe('early');
    expect(last.state).toBe('bruised');

    m.update(0.4 + params.ripenSecs + 0.01);
    expect(m.pick(first.x, first.y)).toBe('picked');
    expect(m.picked).toBe(1);
    expect(m.pick(first.x, first.y)).toBe('miss'); // already in the basket

    m.update(100);
    const stillThere = m.pieces.find((p) => p.state === 'over')!;
    expect(m.pick(stillThere.x, stillThere.y)).toBe('late');
    expect(m.done).toBe(true);
  });

  it('roots sit along the soil line, fruit hangs in the canopy', () => {
    const roots = new HarvestModel(harvestParams(CROP_BY_ID.carrot), 'ground', seq(0.5));
    const fruit = new HarvestModel(params, 'top', seq(0.5));
    expect(Math.max(...fruit.pieces.map((p) => p.y))).toBeLessThan(Math.min(...roots.pieces.map((p) => p.y)));
  });
});
