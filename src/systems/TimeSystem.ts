import { BALANCE } from '../config/balance';
import { SEASONS, type TimeState } from '../state/GameState';

export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_SEASON = 28;
export const SEASONS_PER_YEAR = 4;
export const WAKE_MINUTE = 6 * 60;

export interface TimeTick {
  minutes: number;
  hours: number;
  days: number;
}

/** Minutes since the start of year 1, Spring 1, 00:00. */
export function absoluteMinutes(t: TimeState): number {
  return absoluteDay(t) * MINUTES_PER_DAY + t.minutes;
}

/** Days since year 1, Spring 1 (that day is 0). */
export function absoluteDay(t: TimeState): number {
  return ((t.year - 1) * SEASONS_PER_YEAR + t.season) * DAYS_PER_SEASON + (t.day - 1);
}

export function setFromAbsolute(t: TimeState, abs: number): void {
  const dayIndex = Math.floor(abs / MINUTES_PER_DAY);
  t.minutes = abs - dayIndex * MINUTES_PER_DAY;
  const seasonIndex = Math.floor(dayIndex / DAYS_PER_SEASON);
  t.day = (dayIndex % DAYS_PER_SEASON) + 1;
  t.season = seasonIndex % SEASONS_PER_YEAR;
  t.year = Math.floor(seasonIndex / SEASONS_PER_YEAR) + 1;
}

/** Advance the clock by whole minutes, returning how many hour/day boundaries were crossed. */
export function advanceTime(t: TimeState, minutes: number): TimeTick {
  const a0 = absoluteMinutes(t);
  const a1 = a0 + minutes;
  setFromAbsolute(t, a1);
  return {
    minutes,
    hours: Math.floor(a1 / 60) - Math.floor(a0 / 60),
    days: Math.floor(a1 / MINUTES_PER_DAY) - Math.floor(a0 / MINUTES_PER_DAY),
  };
}

/** Sleep until 6:00 AM. Sleeping before 6 AM wakes the same morning; otherwise the next one. */
export function sleepUntilMorning(t: TimeState): TimeTick {
  const wait = t.minutes < WAKE_MINUTE ? WAKE_MINUTE - t.minutes : MINUTES_PER_DAY - t.minutes + WAKE_MINUTE;
  return advanceTime(t, wait);
}

export function formatDate(t: TimeState): string {
  return `${SEASONS[t.season]} ${t.day}`;
}

export function formatClock(t: TimeState): string {
  const h24 = Math.floor(t.minutes / 60);
  const m = t.minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * 0 = full daylight, 1 = deepest night. Sunset ramps 6 PM -> 9 PM, sunrise 4 AM -> 6 AM.
 */
export function darkness(minutes: number): number {
  const h = minutes / 60;
  if (h >= 6 && h < 18) return 0;
  if (h >= 18 && h < 21) return (h - 18) / 3;
  if (h >= 21 || h < 4) return 1;
  return 1 - (h - 4) / 2;
}

/** Drives the clock from real elapsed time. Pure aside from the callback. */
export class TimeSystem {
  private acc = 0;
  private readonly state: TimeState;
  private readonly onTick: (tick: TimeTick) => void;

  constructor(state: TimeState, onTick: (tick: TimeTick) => void) {
    this.state = state;
    this.onTick = onTick;
  }

  update(dtMs: number): void {
    this.acc += dtMs;
    const step = BALANCE.realMsPerGameMinute;
    if (this.acc < step) return;
    const mins = Math.floor(this.acc / step);
    this.acc -= mins * step;
    this.onTick(advanceTime(this.state, mins));
  }

  sleep(): TimeTick {
    this.acc = 0;
    const tick = sleepUntilMorning(this.state);
    this.onTick(tick);
    return tick;
  }
}
