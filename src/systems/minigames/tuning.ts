import type { CropDef } from '../../config/crops';

/**
 * How each crop's temperament (1 forgiving .. 3 fussy) and its real habits - root depth,
 * how many pieces it bears - turn into concrete numbers for the three tending games. A
 * crop that feels wrong to tend is fixed in one place.
 */

export interface WateringParams {
  /** Fraction of the soil profile the wet front sinks per second of pouring. */
  fillPerSec: number;
  /** The band the wet front must stop in: from just above the root tips to just below. */
  zoneLo: number;
  zoneHi: number;
  /** Where the roots reach today, for drawing them. */
  rootDepth: number;
}

export interface WeedingParams {
  /** How many weeds crowd the square. */
  count: number;
  /** Radius around a weed's base that counts as grabbing it, in field units (0..1). */
  baseRadius: number;
  /** How close to the plant the weeds are allowed to come up. Smaller = riskier pulls. */
  minPlantGap: number;
  /** Radius of the plant's canopy: a grab inside it tears a leaf. */
  canopyRadius: number;
  /** Damp soil gives the roots up more easily. */
  damp: boolean;
}

export interface HarvestParams {
  /** Pieces on the plant, and how many of them are actually ready. */
  items: number;
  ripe: number;
  under: number;
  over: number;
  /** Seconds of steady pulling before a ripe piece comes free. */
  pullSecs: number;
  /** How far either side of "free" a release still counts, as a fraction of pullSecs. */
  window: number;
  /** Radius around a piece that counts as taking hold of it, in field units. */
  pickRadius: number;
  /** How ripe an under-ripe piece looks, 0..1: fussy crops hide it better. */
  subtlety: number;
}

const D = (crop: CropDef) => Math.max(1, Math.min(3, crop.difficulty)) - 1; // 0..2

/**
 * Water to the roots. The sweet spot is where this plant's roots reach today - shallow as
 * a seedling, deepening as it grows - and a fussy crop has less room either side of them.
 */
export function wateringParams(crop: CropDef, growthFrac: number, random: () => number = Math.random): WateringParams {
  const d = D(crop);
  const width = 0.28 - d * 0.06;
  const rootDepth = crop.rootDepth * (0.45 + 0.55 * Math.max(0, Math.min(1, growthFrac)));
  // Roots want the water to reach their tips and a little past; the band sits on them,
  // nudged by a few percent so no two pours are identical.
  const jitter = (random() - 0.5) * 0.04;
  const zoneHi = Math.min(0.97, rootDepth + width * 0.4 + jitter);
  return {
    fillPerSec: 0.36 + d * 0.08,
    zoneLo: Math.max(0.1, zoneHi - width),
    zoneHi,
    rootDepth,
  };
}

/** Weeds get more numerous with the plant's fussiness and with how long they were left. */
export function weedingParams(crop: CropDef, weedLevel: number, damp: boolean): WeedingParams {
  const d = D(crop);
  const baseRadius = 0.075 - d * 0.012;
  return {
    count: Math.max(1, Math.min(6, weedLevel + 1 + d)),
    // After rain or a watering the soil lets go of the roots; dry ground holds on.
    baseRadius: damp ? baseRadius * 1.3 : baseRadius,
    minPlantGap: 0.24 - d * 0.05,
    canopyRadius: 0.14,
    damp,
  };
}

export function harvestParams(crop: CropDef, spread: { ripe: number; under: number; over: number }): HarvestParams {
  const d = D(crop);
  return {
    items: spread.ripe + spread.under + spread.over,
    ...spread,
    pullSecs: 1.0,
    // Roughly 0.56s / 0.46s / 0.36s to let go, easy to fussy: the gauge ring gives warning.
    window: 0.28 - d * 0.05,
    pickRadius: 0.09,
    subtlety: 0.55 + d * 0.12,
  };
}
