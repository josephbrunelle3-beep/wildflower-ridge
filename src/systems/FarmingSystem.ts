import { CROP_BY_ID, CROP_STAGES, CROPS, FARM, inPlot, inSeason, seedsFor, type CropDef } from '../config/crops';
import { BALANCE } from '../config/balance';
import type { GameState, PlotState } from '../state/GameState';
import { addGold, spendGold } from './Economy';
import { absoluteDay } from './TimeSystem';

export interface FarmResult {
  ok: boolean;
  message: string;
}

/** What the player is looking at when they stand in front of a garden square. */
export type PlotStage = 'wild' | 'tilled' | 'growing' | 'ripe' | 'withered';

export const plotKey = (tx: number, ty: number): string => `${tx},${ty}`;

export function plotAt(state: GameState, tx: number, ty: number): PlotState | undefined {
  return state.farm.plots[plotKey(tx, ty)];
}

export function cropOf(plot: PlotState | undefined): CropDef | undefined {
  return plot?.crop ? CROP_BY_ID[plot.crop] : undefined;
}

export function isRipe(plot: PlotState | undefined): boolean {
  const crop = cropOf(plot);
  return !!crop && !plot!.withered && plot!.growth >= crop.days;
}

export function stageOf(state: GameState, tx: number, ty: number): PlotStage {
  const plot = plotAt(state, tx, ty);
  if (!plot) return 'wild';
  if (plot.withered) return 'withered';
  if (!plot.crop) return 'tilled';
  return isRipe(plot) ? 'ripe' : 'growing';
}

/** 0..CROP_STAGES-1, the drawn growth stage of a planted square. */
export function growthStage(plot: PlotState): number {
  const crop = cropOf(plot);
  if (!crop) return 0;
  const frac = Math.min(1, plot.growth / crop.days);
  return Math.min(CROP_STAGES - 1, Math.floor(frac * CROP_STAGES));
}

// --- Actions ---------------------------------------------------------------
// Each returns a message the caller can toast, and mutates nothing on failure.

export function till(state: GameState, tx: number, ty: number): FarmResult {
  if (!inPlot(tx, ty)) return { ok: false, message: 'The soil here is too stony to work.' };
  if (plotAt(state, tx, ty)) return { ok: false, message: 'This square is already turned over.' };
  state.farm.plots[plotKey(tx, ty)] = { crop: null, growth: 0, watered: false, sownDay: -1, withered: false };
  return { ok: true, message: 'You turn the soil over. Ready for seed.' };
}

export function plant(state: GameState, tx: number, ty: number, cropId: string): FarmResult {
  const plot = plotAt(state, tx, ty);
  const crop = CROP_BY_ID[cropId];
  if (!crop) return { ok: false, message: 'You have no such seed.' };
  if (!plot) return { ok: false, message: 'Turn the soil over first.' };
  if (plot.crop && !plot.withered) return { ok: false, message: 'Something is already growing here.' };
  if ((state.farm.seeds[cropId] ?? 0) <= 0) return { ok: false, message: `No ${crop.name.toLowerCase()} seed left.` };
  if (!inSeason(crop, state.time.season)) {
    return { ok: false, message: `${crop.name} will not take root this season.` };
  }
  state.farm.seeds[cropId] -= 1;
  plot.crop = cropId;
  plot.growth = 0;
  plot.watered = false;
  plot.withered = false;
  plot.sownDay = absoluteDay(state.time);
  return { ok: true, message: `You sow ${crop.name.toLowerCase()}. Water them and give it ${crop.days} days.` };
}

export function water(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  if (!plot) return { ok: false, message: 'Nothing planted here to water.' };
  if (plot.withered) return { ok: false, message: 'These are past saving. Clear them out.' };
  if (!plot.crop) return { ok: false, message: 'Bare soil. Sow something first.' };
  if (plot.watered) return { ok: false, message: 'Already watered today.' };
  if (isRipe(plot)) return { ok: false, message: 'These are ready to pick, not to water.' };
  plot.watered = true;
  return { ok: true, message: 'You water the row.' };
}

export function harvest(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  const crop = cropOf(plot);
  if (!plot || !crop) return { ok: false, message: 'Nothing to pick here.' };
  if (plot.withered) return { ok: false, message: 'These withered. Clear them out.' };
  if (!isRipe(plot)) {
    const left = Math.max(1, crop.days - plot.growth);
    return { ok: false, message: `Not ready — ${left} more watered ${left === 1 ? 'day' : 'days'}.` };
  }

  state.farm.harvested += 1;
  let message: string;
  if (crop.feeds === 'carrot') {
    state.inventory.carrots += 1;
    message = `You pull a carrot. (${state.inventory.carrots} in the basket)`;
  } else if (crop.feeds === 'hay') {
    if (state.inventory.hay < BALANCE.maxHay) {
      state.inventory.hay += 1;
      message = `You cut and bundle the grass. (Hay ${state.inventory.hay}/${BALANCE.maxHay})`;
    } else {
      // The barn is full, so the bale goes to the crate instead of being lost.
      state.farm.produce[crop.id] = (state.farm.produce[crop.id] ?? 0) + 1;
      message = 'You cut the grass. No room for more hay, so the bale goes in the crate.';
    }
  } else {
    state.farm.produce[crop.id] = (state.farm.produce[crop.id] ?? 0) + 1;
    message = `You pick the ${crop.name.toLowerCase()}. Worth ${crop.sellPrice}g at the crate.`;
  }

  if (crop.regrowDays !== undefined) {
    plot.growth = Math.max(0, crop.days - crop.regrowDays);
    message += ' The plant keeps standing.';
  } else {
    plot.crop = null;
    plot.growth = 0;
    plot.sownDay = -1;
  }
  plot.watered = false;
  return { ok: true, message };
}

export function clear(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  if (!plot) return { ok: false, message: 'Nothing here.' };
  if (!plot.crop) return { ok: false, message: 'The soil is already bare.' };
  plot.crop = null;
  plot.growth = 0;
  plot.watered = false;
  plot.withered = false;
  plot.sownDay = -1;
  return { ok: true, message: 'You clear the dead stalks away.' };
}

// --- Daily tick -------------------------------------------------------------

export interface DayReport {
  grown: number;
  ripened: number;
  withered: number;
  thirsty: number;
}

/**
 * Roll the garden over to a new day. Watered crops put on a day's growth; everything
 * dries out overnight. A crop caught by the turn of the season withers where it stands -
 * nothing else can kill it, so a forgotten row simply waits for you.
 */
export function advanceDay(state: GameState, days = 1): DayReport {
  const report: DayReport = { grown: 0, ripened: 0, withered: 0, thirsty: 0 };
  for (let d = 0; d < days; d++) {
    for (const plot of Object.values(state.farm.plots)) {
      const crop = cropOf(plot);
      if (!crop || plot.withered) {
        plot.watered = false;
        continue;
      }
      if (FARM.witherOutOfSeason && !inSeason(crop, state.time.season)) {
        plot.withered = true;
        plot.watered = false;
        report.withered += 1;
        continue;
      }
      const wasRipe = isRipe(plot);
      if (plot.watered) {
        plot.growth += 1;
        report.grown += 1;
        if (!wasRipe && isRipe(plot)) report.ripened += 1;
      } else if (!wasRipe) {
        report.thirsty += 1;
      }
      plot.watered = false;
    }
  }
  return report;
}

/** One line for the morning toast, or null when the garden has nothing to say. */
export function dayReportMessage(report: DayReport): string | null {
  const parts: string[] = [];
  if (report.ripened > 0) parts.push(`${report.ripened} ${report.ripened === 1 ? 'crop is' : 'crops are'} ready to pick`);
  if (report.withered > 0) parts.push(`${report.withered} withered with the season`);
  if (report.thirsty > 0 && report.ripened === 0) parts.push(`${report.thirsty} ${report.thirsty === 1 ? 'row' : 'rows'} went unwatered`);
  return parts.length ? `In the garden: ${parts.join(', ')}.` : null;
}

// --- Shop -------------------------------------------------------------------

export function seedPacketCost(crop: CropDef): number {
  return crop.seedCost * FARM.seedsPerPacket;
}

export function buySeeds(state: GameState, cropId: string): FarmResult {
  const crop = CROP_BY_ID[cropId];
  if (!crop) return { ok: false, message: 'The crate has nothing like that.' };
  const cost = seedPacketCost(crop);
  if (!spendGold(state, cost)) return { ok: false, message: `You cannot afford that (${cost}g).` };
  state.farm.seeds[cropId] = (state.farm.seeds[cropId] ?? 0) + FARM.seedsPerPacket;
  return { ok: true, message: `${FARM.seedsPerPacket} ${crop.name.toLowerCase()} seeds for ${cost}g.` };
}

export function produceValue(state: GameState): number {
  return Object.entries(state.farm.produce)
    .reduce((sum, [id, n]) => sum + (CROP_BY_ID[id]?.sellPrice ?? 0) * n, 0);
}

export function produceCount(state: GameState): number {
  return Object.values(state.farm.produce).reduce((a, b) => a + b, 0);
}

export function sellProduce(state: GameState): FarmResult {
  const value = produceValue(state);
  const count = produceCount(state);
  if (count === 0) return { ok: false, message: 'The crate is empty.' };
  state.farm.produce = {};
  addGold(state, value);
  return { ok: true, message: `You ship ${count} ${count === 1 ? 'crop' : 'crops'} for ${value}g.` };
}

/** Seeds on hand this season, for the planting menu. */
export function plantableSeeds(state: GameState): CropDef[] {
  return CROPS.filter((c) => (state.farm.seeds[c.id] ?? 0) > 0);
}

export { seedsFor };
