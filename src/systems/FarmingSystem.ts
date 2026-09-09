import {
  CROP_BY_ID, CROP_STAGES, CROPS, FARM, inPlot, inRect, inSeason, plotAtTier, type CropDef, type PlotRect,
} from '../config/crops';
import { BALANCE } from '../config/balance';
import type { GameState, PlotState } from '../state/GameState';
import { addGold, spendGold } from './Economy';
import { absoluteDay } from './TimeSystem';
import type { WateringVerdict } from './minigames/WateringModel';

export interface FarmResult {
  ok: boolean;
  message: string;
  /** Minutes of the day the action cost, for the caller to put on the clock. */
  minutes?: number;
}

/** What the player is looking at when they stand in front of a square. */
export type PlotStage = 'locked' | 'wild' | 'tilled' | 'growing' | 'ripe' | 'withered';

export const plotKey = (tx: number, ty: number): string => `${tx},${ty}`;

// --- The garden's footprint --------------------------------------------------

export function activePlot(state: GameState): PlotRect {
  return plotAtTier(state.farm.tier);
}

/** Ground the player can work right now. */
export function inGarden(state: GameState, tx: number, ty: number): boolean {
  return inRect(activePlot(state), tx, ty);
}

/** The next tier up, or null when the garden is as big as the yard allows. */
export function nextTier(state: GameState): { tier: number; w: number; h: number; cost: number } | null {
  const i = state.farm.tier + 1;
  const t = FARM.tiers[i];
  return t ? { tier: i, ...t } : null;
}

export function expandGarden(state: GameState): FarmResult {
  const next = nextTier(state);
  if (!next) return { ok: false, message: 'The garden already fills the yard.' };
  if (!spendGold(state, next.cost)) return { ok: false, message: `Expanding costs ${next.cost}g. Not this week.` };
  state.farm.tier = next.tier;
  return { ok: true, message: `You stake out more ground. The garden is now ${next.w} by ${next.h}.` };
}

// --- Reading a square ---------------------------------------------------------

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

/** Weeds at the top level have the square by the throat: nothing grows until they go. */
export function isChoked(plot: PlotState | undefined): boolean {
  return !!plot && plot.weeds >= FARM.care.weedsChoke;
}

/** Mornings of drought left before this crop dies. */
export function daysToDeath(plot: PlotState): number {
  return Math.max(0, FARM.care.dieAfterDryDays - plot.dryDays);
}

export function stageOf(state: GameState, tx: number, ty: number): PlotStage {
  if (!inGarden(state, tx, ty)) return 'locked';
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

/** One line on how the plant is doing, for the plant card and the prompt. */
export function describePlot(plot: PlotState): string {
  const crop = cropOf(plot);
  if (!crop) return plot.weeds > 0 ? 'Bare soil, weeds coming up' : 'Bare, turned soil';
  if (plot.withered) return 'Dead';
  const parts: string[] = [];
  if (isRipe(plot)) parts.push('Ripe');
  else parts.push(`Day ${Math.min(plot.growth + 1, crop.days)} of ${crop.days}`);
  if (plot.watered) parts.push('watered');
  else if (plot.dryDays > 0) parts.push(daysToDeath(plot) <= 1 ? 'dying of thirst' : 'wilting');
  else if (!isRipe(plot)) parts.push('dry');
  if (isChoked(plot)) parts.push('choked with weeds');
  else if (plot.weeds > 0) parts.push(plot.weeds === 1 ? 'a few weeds' : 'weeds spreading');
  return parts.join(' · ');
}

const freshPlot = (): PlotState => ({
  crop: null, growth: 0, watered: false, sownDay: -1, withered: false,
  dryDays: 0, weeds: 0, neglect: 0, fallowDays: 0,
});

// --- Field work --------------------------------------------------------------
// Each returns a message the caller can toast plus the minutes it cost, and mutates
// nothing on failure.

export function till(state: GameState, tx: number, ty: number): FarmResult {
  if (!inPlot(tx, ty)) return { ok: false, message: 'The soil here is too stony to work.' };
  if (!inGarden(state, tx, ty)) return { ok: false, message: 'Outside the garden. Expand it at the seed crate.' };
  if (plotAt(state, tx, ty)) return { ok: false, message: 'This square is already turned over.' };
  state.farm.plots[plotKey(tx, ty)] = freshPlot();
  return { ok: true, message: 'You turn the soil over. Ready for seed.', minutes: FARM.minutes.till };
}

export function plant(state: GameState, tx: number, ty: number, cropId: string): FarmResult {
  const plot = plotAt(state, tx, ty);
  const crop = CROP_BY_ID[cropId];
  if (!crop) return { ok: false, message: 'You have no such seed.' };
  if (!plot) return { ok: false, message: 'Turn the soil over first.' };
  if (plot.weeds > 0) return { ok: false, message: 'Pull the weeds before you sow.' };
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

/** Can the watering game even start? Checked before the bucket is tipped. */
export function canWater(state: GameState, tx: number, ty: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  if (!plot?.crop || plot.withered) return { ok: false, message: 'Nothing here to water.' };
  if (plot.watered) return { ok: false, message: 'Already watered today.' };
  if (isRipe(plot)) return { ok: false, message: 'These are ready to pick, not to water.' };
  if (state.farm.water <= 0) return { ok: false, message: 'The bucket is empty. Refill it at the pump.' };
  return { ok: true, message: '' };
}

/**
 * The watering game's verdict, applied. Every pour costs a bucket charge - water spilled
 * is water gone. Under leaves the row dry for another go; over soaks it, which counts as
 * watered but not as *cared for*.
 */
export function applyWatering(state: GameState, tx: number, ty: number, verdict: WateringVerdict): FarmResult {
  const can = canWater(state, tx, ty);
  if (!can.ok) return can;
  const plot = plotAt(state, tx, ty)!;
  state.farm.water -= 1;
  const left = `(${state.farm.water} left in the bucket)`;
  if (verdict === 'under') {
    return { ok: true, message: `Not enough - the soil is still dry underneath. ${left}`, minutes: FARM.minutes.water };
  }
  const rescued = plot.dryDays > 0;
  plot.watered = true;
  plot.dryDays = 0;
  if (verdict === 'over') {
    plot.neglect += 1;
    return { ok: true, message: `Too much - the roots are sitting in mud. It will live, but it won't be prize-worthy. ${left}`, minutes: FARM.minutes.water };
  }
  return {
    ok: true,
    message: rescued ? `Just right. The wilting row should pull through. ${left}` : `Just right. ${left}`,
    minutes: FARM.minutes.water,
  };
}

/**
 * The weeding game's tally, applied. Pulling them all clears the square; every leaf torn
 * off the crop on the way is a mark against it. Leaving early leaves what was not pulled.
 */
export function applyWeeding(
  state: GameState,
  tx: number,
  ty: number,
  result: { pulled: number; remaining: number; damage: number },
): FarmResult {
  const plot = plotAt(state, tx, ty);
  if (!plot || plot.weeds <= 0) return { ok: false, message: 'No weeds here.' };
  const before = plot.weeds;
  plot.weeds = result.remaining === 0 ? 0 : Math.max(1, Math.min(before, result.remaining));
  plot.fallowDays = 0;
  if (result.damage > 0 && plot.crop && !plot.withered) plot.neglect += result.damage;

  let message: string;
  if (plot.weeds === 0) message = 'You clear the weeds out by the root.';
  else message = `You pull ${result.pulled}; ${result.remaining} still standing.`;
  if (result.damage > 0) message += result.damage === 1 ? ' One torn leaf on the crop.' : ` ${result.damage} torn leaves on the crop.`;
  return { ok: true, message, minutes: FARM.minutes.weed };
}

/**
 * The harvest game's basket, applied. Each piece picked is one crop; a plant brought in
 * with no dry, choked or torn day comes up prize-worthy and the basket doubles.
 */
export function applyHarvest(state: GameState, tx: number, ty: number, bagged: number): FarmResult {
  const plot = plotAt(state, tx, ty);
  const crop = cropOf(plot);
  if (!plot || !crop) return { ok: false, message: 'Nothing to pick here.' };
  if (plot.withered) return { ok: false, message: 'These withered. Clear them out.' };
  if (!isRipe(plot)) return { ok: false, message: 'Not ready to pick yet.' };

  const prize = plot.neglect === 0 && bagged >= crop.harvestItems;
  const yieldCount = Math.max(0, bagged) * (prize ? FARM.care.prizeMultiplier : 1);
  state.farm.harvested += 1;
  if (prize) state.farm.prizes += 1;

  let message: string;
  if (yieldCount === 0) {
    message = `You come away with nothing worth keeping.`;
  } else if (crop.feeds === 'carrot') {
    state.inventory.carrots += yieldCount;
    message = `${yieldCount} ${yieldCount === 1 ? 'carrot' : 'carrots'} for the basket. (${state.inventory.carrots} in all)`;
  } else if (crop.feeds === 'hay') {
    const room = Math.max(0, BALANCE.maxHay - state.inventory.hay);
    const bales = Math.min(room, yieldCount);
    state.inventory.hay += bales;
    const spare = yieldCount - bales;
    if (spare > 0) state.farm.produce[crop.id] = (state.farm.produce[crop.id] ?? 0) + spare;
    message = bales > 0
      ? `${bales} ${bales === 1 ? 'bundle' : 'bundles'} of hay for the barn. (Hay ${state.inventory.hay}/${BALANCE.maxHay})`
      : 'No room in the barn, so the hay goes in the crate.';
  } else {
    state.farm.produce[crop.id] = (state.farm.produce[crop.id] ?? 0) + yieldCount;
    message = `${yieldCount} ${crop.name.toLowerCase()} for the crate, worth ${crop.sellPrice * yieldCount}g.`;
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
  if (!plot.crop && plot.weeds === 0) return { ok: false, message: 'The soil is already bare.' };
  Object.assign(plot, freshPlot());
  return { ok: true, message: 'You clear the dead stalks away.', minutes: FARM.minutes.clear };
}

export function refillBucket(state: GameState): FarmResult {
  const cap = FARM.care.bucketCapacity;
  if (state.farm.water >= cap) return { ok: false, message: 'The bucket is already full.' };
  state.farm.water = cap;
  return { ok: true, message: `You work the pump until the bucket is full. (${cap} waterings)` };
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
  /** Squares where weeds came up or got bigger. */
  weedy: number;
  /** Squares the weeds have now choked. */
  choked: number;
  reclaimed: number;
}

const emptyReport = (rained: boolean): DayReport =>
  ({ rained, grown: 0, ripened: 0, wilting: 0, died: 0, withered: 0, weedy: 0, choked: 0, reclaimed: 0 });

/**
 * Roll the garden over to a new day. This is where care is paid for or charged.
 *
 * A watered square puts on a day's growth. A dry one wilts, and on the third dry morning
 * the crop dies where it stands. Weeds sprout small, grow a level a night, and at the top
 * level choke the square until they are pulled; bare soil left choked long enough goes
 * back to grass. Rain waters everything overnight - the one mercy, and the reason to look
 * at the sky before bed.
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

      // Weeds first: whatever is there gets bigger overnight, and new ones may come up.
      const wasChoked = isChoked(plot);
      if (plot.weeds > 0) {
        if (plot.weeds < care.weedsChoke) {
          plot.weeds += 1;
          report.weedy += 1;
        }
      } else if (random() < (crop ? care.weedSproutChance : care.weedSproutChanceBare)) {
        plot.weeds = 1;
        report.weedy += 1;
      }
      if (!wasChoked && isChoked(plot)) report.choked += 1;

      // Bare soil: choked long enough and the grass takes the square back.
      if (!crop) {
        if (isChoked(plot)) {
          plot.fallowDays += 1;
          if (plot.fallowDays >= care.weedsReclaimAfter) {
            delete state.farm.plots[key];
            report.reclaimed += 1;
          }
        } else {
          plot.fallowDays = 0;
        }
        continue;
      }

      if (FARM.witherOutOfSeason && !inSeason(crop, state.time.season)) {
        plot.withered = true;
        report.withered += 1;
        continue;
      }

      const wasRipe = isRipe(plot);
      if (isChoked(plot)) {
        // Choked: no growth today, and it costs the crop its prize.
        plot.neglect += 1;
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
  if (report.choked > 0) parts.push(`${report.choked} choked with weeds`);
  else if (report.weedy > 0) parts.push(`weeds coming up on ${report.weedy}`);
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
