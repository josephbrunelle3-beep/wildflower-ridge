import { BALANCE } from '../config/balance';

export const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
export type Facing = 'down' | 'left' | 'right' | 'up';
export type QuestStatus = 'active' | 'done';

export const SAVE_VERSION = 1;

export interface TimeState {
  /** 1-based year. */
  year: number;
  /** 0 = Spring ... 3 = Winter. */
  season: number;
  /** 1..28 */
  day: number;
  /** Minutes since midnight, 0..1439 */
  minutes: number;
}

export interface HorseState {
  name: string;
  coat: string;
  x: number;
  y: number;
  /** Where the horse wanders around when left alone. */
  anchorX: number;
  anchorY: number;
  hunger: number; // 0 = starving, 100 = full
  cleanliness: number; // 0 = filthy, 100 = gleaming
  energy: number; // 0 = exhausted, 100 = fresh
  bond: number; // 0 = stranger, 100 = soulmates
  tacked: boolean;
  /** Absolute game minute of the last petting, or -1. */
  lastPetAt: number;
  /** Absolute day index of the last hoof grooming, or -1. */
  lastGroomDay: number;
}

/** One tilled square of the kitchen garden. Untilled ground has no entry at all. */
export interface PlotState {
  /** Crop id, or null for bare tilled soil. */
  crop: string | null;
  /** Watered days accumulated since sowing. */
  growth: number;
  /** Watered today? Cleared every morning. */
  watered: boolean;
  /** Absolute day the current crop was sown, or -1. */
  sownDay: number;
  /** True once a crop has been caught out by the turn of the season. */
  withered: boolean;
}

export interface FarmState {
  /** Tilled squares, keyed `x,y` in tile coordinates. */
  plots: Record<string, PlotState>;
  /** Seed packets on hand, by crop id. */
  seeds: Record<string, number>;
  /** Harvested produce waiting for the shipping crate, by crop id. */
  produce: Record<string, number>;
  /** Lifetime count of crops harvested, for the quest and for flavour. */
  harvested: number;
}

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
  /** False until the player has been placed at the map spawn once. */
  placed: boolean;
}

export interface GameState {
  version: number;
  player: PlayerState;
  horse: HorseState;
  time: TimeState;
  gold: number;
  inventory: { carrots: number; hay: number };
  farm: FarmState;
  quests: Record<string, QuestStatus>;
  flags: Record<string, boolean>;
  selectedSlot: number;
}

export function createNewGame(): GameState {
  return {
    version: SAVE_VERSION,
    player: { x: 0, y: 0, facing: 'down', placed: false },
    horse: {
      name: 'Star',
      coat: 'bay',
      x: 0,
      y: 0,
      anchorX: 0,
      anchorY: 0,
      hunger: 55,
      cleanliness: 40,
      energy: 80,
      bond: 5,
      tacked: false,
      lastPetAt: -1,
      lastGroomDay: -1,
    },
    // Matches the concept art: Spring 12, 6:40 PM.
    time: { year: 1, season: 0, day: 12, minutes: 18 * 60 + 40 },
    gold: BALANCE.startGold,
    inventory: { carrots: BALANCE.startCarrots, hay: 0 },
    farm: { plots: {}, seeds: { carrot: 3 }, produce: {}, harvested: 0 },
    quests: {},
    flags: {},
    selectedSlot: 4,
  };
}

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
/** Stats are kept unrounded so tiny per-frame changes (galloping) accumulate; round only for display. */
export const clampStat = (v: number): number => clamp(v, 0, 100);
