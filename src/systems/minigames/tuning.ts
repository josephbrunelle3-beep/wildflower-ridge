import type { CropDef } from '../../config/crops';

/**
 * How each crop's difficulty (1 forgiving .. 3 fussy) turns into concrete numbers for the
 * three tending games. Everything the games vary by plant comes through here, so a crop
 * that feels wrong to tend is fixed in one place.
 */

export interface WateringParams {
  /** Fraction of the bar filled per second while pouring. */
  fillPerSec: number;
  /** Width of the sweet spot, as a fraction of the bar. */
  zoneWidth: number;
  /** Lowest the sweet spot can start (it is placed at random in [zoneMin, zoneMax]). */
  zoneMin: number;
  zoneMax: number;
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
}

export interface HarvestParams {
  /** Pieces to pick. */
  items: number;
  /** Seconds a piece takes to ripen once it starts colouring. */
  ripenSecs: number;
  /** Seconds a piece stays ripe before it goes over. */
  ripeWindowSecs: number;
  /** Seconds between one piece starting to colour and the next. */
  staggerSecs: number;
  /** Radius around a piece that counts as picking it, in field units. */
  pickRadius: number;
}

const D = (crop: CropDef) => Math.max(1, Math.min(3, crop.difficulty)) - 1; // 0..2

export function wateringParams(crop: CropDef): WateringParams {
  const d = D(crop);
  const zoneWidth = 0.28 - d * 0.06;
  return {
    fillPerSec: 0.36 + d * 0.08,
    zoneWidth,
    zoneMin: 0.45,
    zoneMax: 0.8 - zoneWidth,
  };
}

/** Weeds get more numerous with the plant's fussiness and with how long they were left. */
export function weedingParams(crop: CropDef, weedLevel: number): WeedingParams {
  const d = D(crop);
  return {
    count: Math.max(1, Math.min(6, weedLevel + 1 + d)),
    baseRadius: 0.075 - d * 0.012,
    minPlantGap: 0.24 - d * 0.05,
    canopyRadius: 0.14,
  };
}

export function harvestParams(crop: CropDef): HarvestParams {
  const d = D(crop);
  return {
    items: Math.max(1, crop.harvestItems),
    ripenSecs: 1.4,
    ripeWindowSecs: 2.4 - d * 0.6,
    staggerSecs: 0.9 - d * 0.15,
    pickRadius: 0.09,
  };
}
