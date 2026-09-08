import { CROP_BY_ID, CROP_STAGES, CROPS, FARM, inPlot, inSeason, type CropDef } from '../config/crops';
import { BALANCE } from '../config/balance';
import type { GameState, PlotState } from '../state/GameState';
import { addGold, spendGold } from './Economy';
import { absoluteDay } from './TimeSystem';

export interface FarmResult {
  ok: boolean;
  message: string;
  /** Minutes of the day the action cost, for the caller to put on the clock. */
  minutes?: number;
}

/** What the player is looking at when they stand in front of a square. */
export type PlotStage = 'wild' | 'tilled' | 'weedy' | 'growing' | 'thirsty' | 'ripe' | 'withered';

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

/** A crop that has missed a morning is wilting: still saveable, but on the clock. */
export function isWilting(plot: PlotState | undefined): boolean {
  return !!plot?.crop && !plot.withered && plot.dryDays > 0;
}

/** Mornings of drought left before this crop dies. */
export function daysToDeath(plot: PlotState): number {
  return Math.max(0, FARM.care.dieAfterDryDays - plot.dryDays);
}

export function stageOf(state: GameState, tx: number, ty: number): PlotStage {
  const plot = plotAt(state, tx, ty);
  if (!plot) return 'wild';
  if (plot.withered) return 'withered';
  if (plot.weedy) return 'weedy';
  if (!plot.crop) return 'tilled';
  if (isRipe(plot)) return 'ripe';
  return isWilting(plot) ? 'thirsty' : 'growing';
}

/** 0..CROP_STAGES-1, the drawn growth stage of a planted square. */
export function growthStage(plot: PlotState): number {
  const crop = cropOf(plot);
  if (!crop) return 0;
  const frac = Math.min(1, plot.growth / crop.days);
  return Math.min(CROP_STAGES - 1, Math.floor(frac * CROP_STAGES));
}

const freshPlot = (): PlotState => ({
  crop: null, growth: 0, watered: false, sownDay: -1, withered: false,
  dryDays: 0, weedy: false, neglect: 0, fallowDays: 0,
});

// --- Actions ---------------------------------------------------------------
// Each returns a message the caller can toast plus the minutes it cost, and mutates
// nothing on failure.

export function till(state: GameState, tx: number, ty: number): FarmResult {
  if (!inPlot(tx, ty)) return { ok: false, message: 'The soil here is too stony to work.' };
  if (plotAt(state, tx, ty)) return { ok: false, message: 'This square is already turned over.' };
  state.farm.plots[plotKey(tx, ty)] = freshPlot();
  return { ok: true, message: 'You turn the soil over. Ready for seed.', minutes: FARM.minutes.till };
}

export function plant(state: GameState, tx: number, ty: number, cropId: string): FarmResult {
  const plot = plotAt(state, tx, ty);
  const crop = CROP_BY_ID[cropId];
  if (!crop) return { ok: false, message: 'You have no such seed.' };
  if (!plot) return { ok: false, message: 'Turn the soil over first.' };
  if (plot.weedy) return { ok: false, message: 'Pull the weeds before you sow.' };
  if (plot.crop && !plot.withered) return { ok: false, message: 'Something is already growing here.' };
  if ((state.farm.seeds[cropId] ?? 0) <= 0) return { ok: false, message: `No ${crop.name.toLowerCase()} seed left.` };
  if (!inSeason(crop, state.time.season)) {
    return { ok: false, message: `${crop.name} will not take root this season.` };
  }
  state.farm.seeds[cropId] -= 1;
  Object.assign(plot, freshPlot(), { crop: cropId, sownDay: absoluteDay(state.time) });
  return {
    ok: true,
    message: `You sow ${crop.name.toLowerCase()}. Water them every day and give it ${crop.days} days.`,
    minutes: FARM.minutes.sow,
  };
}

export function water(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  if (!plot) return { ok: false, message: 'Nothing planted here to water.' };
  if (plot.withered) return { ok: false, message: 'These are past saving. Clear them out.' };
  if (plot.weedy) return { ok: false, message: 'The weeds would drink it. Pull them first.' };
  if (!plot.crop) return { ok: false, message: 'Bare soil. Sow something first.' };
  if (plot.watered) return { ok: false, message: 'Already watered today.' };
  if (isRipe(plot)) return { ok: false, message: 'These are ready to pick, not to water.' };
  if (state.farm.water <= 0) return { ok: false, message: 'The bucket is empty. Refill it at the pump.' };

  state.farm.water -= 1;
  const rescued = plot.dryDays > 0;
  plot.watered = true;
  plot.dryDays = 0;
  const left = `(${state.farm.water} left in the bucket)`;
  return {
    ok: true,
    message: rescued ? `You soak the wilting row. It should pull through. ${left}` : `You water the row. ${left}`,
    minutes: FARM.minutes.water,
  };
}

export function pullWeeds(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  if (!plot?.weedy) return { ok: false, message: 'No weeds here.' };
  plot.weedy = false;
  plot.fallowDays = 0;
  return { ok: true, message: 'You clear the weeds out by the root.', minutes: FARM.minutes.weed };
}

export function refillBucket(state: GameState): FarmResult {
  const cap = FARM.care.bucketCapacity;
  if (state.farm.water >= cap) return { ok: false, message: 'The bucket is already full.' };
  state.farm.water = cap;
  return { ok: true, message: `You work the pump until the bucket is full. (${cap} waterings)` };
}

export function harvest(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  const crop = cropOf(plot);
  if (!plot || !crop) return { ok: false, message: 'Nothing to pick here.' };
  if (plot.withered) return { ok: false, message: 'These withered. Clear them out.' };
  if (!isRipe(plot)) {
    const left = Math.max(1, crop.days - plot.growth);
    const warning = plot.weedy ? ' — and the weeds are choking them' : isWilting(plot) ? ' — and they need water today' : '';
    return { ok: false, message: `Not ready: ${left} more watered ${left === 1 ? 'day' : 'days'}${warning}.` };
  }

  // A crop that never went dry or choked comes up prize-worthy: twice the crop.
  const prize = plot.neglect === 0;
  const yieldCount = prize ? FARM.care.prizeMultiplier : 1;
  state.farm.harvested += 1;
  if (prize) state.farm.prizes += 1;

  let message: string;
  if (crop.feeds === 'carrot') {
    state.inventory.carrots += yieldCount;
    message = `You pull ${yieldCount > 1 ? 'a double handful of carrots' : 'a carrot'}. (${state.inventory.carrots} in the basket)`;
  } else if (crop.feeds === 'hay') {
    const room = Math.max(0, BALANCE.maxHay - state.inventory.hay);
    const bales = Math.min(room, yieldCount);
    state.inventory.hay += bales;
    const spare = yieldCount - bales;
    if (spare > 0) state.farm.produce[crop.id] = (state.farm.produce[crop.id] ?? 0) + spare;
    message = bales > 0
      ? `You cut and bundle the grass. (Hay ${state.inventory.hay}/${BALANCE.maxHay})`
      : 'You cut the grass. No room for more hay, so it goes in the crate.';
  } else {
    state.farm.produce[crop.id] = (state.farm.produce[crop.id] ?? 0) + yieldCount;
    message = `You pick the ${crop.name.toLowerCase()}. Worth ${crop.sellPrice * yieldCount}g at the crate.`;
  }
  if (prize) message = `Prize crop! ${message}`;

  if (crop.regrowDays !== undefined) {
    plot.growth = Math.max(0, crop.days - crop.regrowDays);
    plot.neglect = 0;
    message += ' The plant keeps standing.';
  } else {
    Object.assign(plot, freshPlot());
  }
  plot.watered = false;
  return { ok: true, message, minutes: FARM.minutes.harvest };
}

export function clear(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  if (!plot) return { ok: false, message: 'Nothing here.' };
  if (!plot.crop && !plot.weedy) return { ok: false, message: 'The soil is already bare.' };
  Object.assign(plot, freshPlot());
  return { ok: true, message: 'You clear the dead stalks away.', minutes: FARM.minutes.clear };
}

// --- Weather ----------------------------------------------------------------

/** Rolls overnight rain for the season. Injectable RNG so tests are deterministic. */
export function rollRain(season: number, random: () => number = Math.random): boolean {
  return random() < (FARM.rainChance[season] ?? 0);
}

// --- Daily tick -------------------------------------------------------------

export interface DayReport {
  rained: boolean;
  grown: number;
  ripened: number;
  wilting: number;
  died: number;
  withered: number;
  weedy: number;
  reclaimed: number;
}

const emptyReport = (rained: boolean): DayReport =>
  ({ rained, grown: 0, ripened: 0, wilting: 0, died: 0, withered: 0, weedy: 0, reclaimed: 0 });

/**
 * Roll the garden over to a new day. This is where care is paid for or charged.
 *
 * A watered square puts on a day's growth. A dry one wilts, and on the third dry morning
 * the crop dies where it stands. Weeds sprout on their own and choke a square until they
 * are pulled; bare soil left weedy long enough goes back to grass. Rain waters everything
 * overnight, which is the one mercy - and the reason to look at the sky before bed.
 */
export function advanceDay(
  state: GameState,
  days = 1,
  opts: { rain?: boolean; random?: () => number } = {},
): DayReport {
  const random = opts.random ?? Math.random;
  const care = FARM.care;
  const report = emptyReport(false);

  for (let d = 0; d < days; d++) {
    const rained = opts.rain ?? rollRain(state.time.season, random);
    state.farm.rained = rained;
    report.rained = rained;

    for (const [key, plot] of Object.entries(state.farm.plots)) {
      const watered = plot.watered || rained;
      const crop = cropOf(plot);
      plot.watered = false;

      if (plot.withered) continue;

      // Bare soil: weeds move in, and eventually the grass takes the square back.
      if (!crop) {
        if (plot.weedy) {
          plot.fallowDays += 1;
          if (plot.fallowDays >= care.weedsReclaimAfter) {
            delete state.farm.plots[key];
            report.reclaimed += 1;
          } else {
            report.weedy += 1;
          }
        } else if (random() < care.weedChanceBare) {
          plot.weedy = true;
          plot.fallowDays = 0;
          report.weedy += 1;
        }
        continue;
      }

      if (FARM.witherOutOfSeason && !inSeason(crop, state.time.season)) {
        plot.withered = true;
        report.withered += 1;
        continue;
      }

      const wasRipe = isRipe(plot);
      if (plot.weedy) {
        // Choked: no growth today, and it costs the crop its prize.
        plot.neglect += 1;
        report.weedy += 1;
      } else if (watered) {
        plot.growth += 1;
        plot.dryDays = 0;
        report.grown += 1;
        if (!wasRipe && isRipe(plot)) report.ripened += 1;
      } else if (!wasRipe) {
        plot.dryDays += 1;
        plot.neglect += 1;
        if (plot.dryDays >= care.dieAfterDryDays) {
          plot.withered = true;
          report.died += 1;
          continue;
        }
        report.wilting += 1;
      }

      if (!plot.weedy && random() < care.weedChancePlanted) {
        plot.weedy = true;
        report.weedy += 1;
      }
    }
  }
  return report;
}

/** One line for the morning toast, or null when the garden has nothing to say. */
export function dayReportMessage(report: DayReport): string | null {
  const parts: string[] = [];
  if (report.died > 0) parts.push(`${report.died} died of thirst`);
  if (report.withered > 0) parts.push(`${report.withered} withered with the season`);
  if (report.wilting > 0) parts.push(`${report.wilting} wilting and wanting water`);
  if (report.weedy > 0) parts.push(`${report.weedy} choked with weeds`);
  if (report.ripened > 0) parts.push(`${report.ripened} ready to pick`);
  if (report.reclaimed > 0) parts.push(`${report.reclaimed} gone back to grass`);
  const rain = report.rained ? 'Rain overnight watered the garden. ' : '';
  if (!parts.length) return rain ? `${rain}Nothing else to report.` : null;
  return `${rain}In the garden: ${parts.join(', ')}.`;
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

/** Seeds on hand, for the sowing list. */
export function plantableSeeds(state: GameState): CropDef[] {
  return CROPS.filter((c) => (state.farm.seeds[c.id] ?? 0) > 0);
}
