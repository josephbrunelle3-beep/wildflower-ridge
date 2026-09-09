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
    const w = (c: typeof easy) => wateringParams(c, 1, () => 0.5);
    expect(w(hard).zoneHi - w(hard).zoneLo).toBeLessThan(w(easy).zoneHi - w(easy).zoneLo);
    expect(w(hard).fillPerSec).toBeGreaterThan(w(easy).fillPerSec);
    expect(weedingParams(hard, 1, false).count).toBeGreaterThan(weedingParams(easy, 1, false).count);
    expect(weedingParams(hard, 1, false).baseRadius).toBeLessThan(weedingParams(easy, 1, false).baseRadius);
    expect(weedingParams(hard, 1, false).minPlantGap).toBeLessThan(weedingParams(easy, 1, false).minPlantGap);
    const spread = { ripe: 2, under: 0, over: 0 };
    expect(harvestParams(hard, spread).window).toBeLessThan(harvestParams(easy, spread).window);
    expect(harvestParams(hard, spread).subtlety).toBeGreaterThan(harvestParams(easy, spread).subtlety);
  });

  it('waters to the roots: seedlings shallow, grown plants deep, the band on the root tips', () => {
    const crop = CROP_BY_ID.carrot;
    const seedling = wateringParams(crop, 0, () => 0.5);
    const grown = wateringParams(crop, 1, () => 0.5);
    expect(seedling.rootDepth).toBeLessThan(grown.rootDepth);
    expect(grown.rootDepth).toBeCloseTo(crop.rootDepth);
    for (const p of [seedling, grown]) {
      expect(p.zoneLo).toBeLessThan(p.rootDepth);
      expect(p.zoneHi).toBeGreaterThan(p.rootDepth);
      expect(p.zoneHi).toBeLessThanOrEqual(0.97);
    }
    // Shallow-rooted grass wants a shallower soak than a taproot.
    expect(wateringParams(CROP_BY_ID.timothy, 1, () => 0.5).rootDepth).toBeLessThan(grown.rootDepth);
  });

  it('weeds left longer mean more to pull, and damp soil gives them up more easily', () => {
    const crop = CROP_BY_ID.carrot;
    expect(weedingParams(crop, 3, false).count).toBeGreaterThan(weedingParams(crop, 1, false).count);
    expect(weedingParams(crop, 1, true).baseRadius).toBeGreaterThan(weedingParams(crop, 1, false).baseRadius);
  });
});

describe('WateringModel', () => {
  const params = wateringParams(CROP_BY_ID.carrot, 1, () => 0.5);

  it('fills only while pouring and settles the verdict when you let go', () => {
    const m = new WateringModel(params);
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

  it('is perfect at the roots and over past them', () => {
    const perfect = new WateringModel(params);
    perfect.startPour();
    while (perfect.level < perfect.zoneLo + (perfect.zoneHi - perfect.zoneLo) / 2) perfect.update(0.01);
    expect(perfect.stopPour()).toBe('perfect');

    const over = new WateringModel(params);
    over.startPour();
    while (over.level <= over.zoneHi) over.update(0.01);
    expect(over.stopPour()).toBe('over');
  });

  it('waterlogs on its own if you never let go', () => {
    const m = new WateringModel(params);
    m.startPour();
    m.update(60);
    expect(m.level).toBe(1);
    expect(m.verdict).toBe('over');
    expect(m.pouring).toBe(false);
  });
});

describe('WeedingModel', () => {
  const params = weedingParams(CROP_BY_ID.carrot, 2, false);

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
  const params = harvestParams(CROP_BY_ID.tomato, { ripe: 2, under: 1, over: 1 });
  const find = (m: HarvestModel, ripeness: string) => m.pieces.find((p) => p.ripeness === ripeness && p.state === 'onPlant')!;

  it('puts what the plant has to offer on the plant, shuffled', () => {
    const m = new HarvestModel(params, 'top', seq(0.5));
    expect(m.pieces).toHaveLength(4);
    expect(m.pieces.filter((p) => p.ripeness === 'ripe')).toHaveLength(2);
    expect(m.pieces.filter((p) => p.ripeness === 'under')).toHaveLength(1);
    expect(m.pieces.filter((p) => p.ripeness === 'over')).toHaveLength(1);
    expect(m.ripeLeft).toBe(2);
    expect(m.done).toBe(false);
  });

  it('a steady pull released as it comes free picks the piece; early leaves it; yanking snaps it', () => {
    const m = new HarvestModel(params, 'top', seq(0.5));
    const ripe = find(m, 'ripe');
    expect(m.grab(ripe.x, ripe.y)).toBe('held');
    expect(m.grab(ripe.x, ripe.y)).toBe('miss');          // hands are full
    m.update(0.2);
    expect(m.release()).toBe('early');
    expect(ripe.state).toBe('onPlant');

    expect(m.grab(ripe.x, ripe.y)).toBe('held');
    m.update(params.pullSecs);                             // exactly free
    expect(m.release()).toBe('picked');
    expect(m.picked).toBe(1);

    const other = find(m, 'ripe');
    m.grab(other.x, other.y);
    let outcome = null;
    for (let i = 0; i < 100 && !outcome; i++) outcome = m.update(0.05);
    expect(outcome).toBe('snapped');
    expect(other.state).toBe('lost');
    expect(other.lostHow).toBe('snapped');
    expect(m.done).toBe(true);                             // no ready piece left
  });

  it('a green piece bruises when picked; an over-ripe one comes away as mush', () => {
    const m = new HarvestModel(params, 'top', seq(0.5));
    const under = find(m, 'under');
    m.grab(under.x, under.y);
    m.update(params.pullSecs);
    expect(m.release()).toBe('unripe');
    expect(under.state).toBe('lost');

    const over = find(m, 'over');
    m.grab(over.x, over.y);
    expect(m.release()).toBe('over');
    expect(over.state).toBe('lost');
    expect(m.picked).toBe(0);
  });

  it('roots sit along the soil line, fruit hangs in the canopy', () => {
    const roots = new HarvestModel(harvestParams(CROP_BY_ID.carrot, { ripe: 3, under: 0, over: 0 }), 'ground', seq(0.5));
    const fruit = new HarvestModel(params, 'top', seq(0.5));
    expect(Math.max(...fruit.pieces.map((p) => p.y))).toBeLessThan(Math.min(...roots.pieces.map((p) => p.y)));
  });
});
