import { describe, expect, it } from 'vitest';
import { advanceTime, darkness, formatClock, formatDate, sleepUntilMorning, absoluteMinutes } from '../src/systems/TimeSystem';
import type { TimeState } from '../src/state/GameState';

const t = (over: Partial<TimeState> = {}): TimeState => ({ year: 1, season: 0, day: 12, minutes: 18 * 60 + 40, ...over });

describe('TimeSystem', () => {
  it('formats the concept-art start time', () => {
    expect(formatDate(t())).toBe('Spring 12');
    expect(formatClock(t())).toBe('6:40 PM');
    expect(formatClock(t({ minutes: 0 }))).toBe('12:00 AM');
    expect(formatClock(t({ minutes: 12 * 60 + 5 }))).toBe('12:05 PM');
  });

  it('counts hour and day boundaries when advancing', () => {
    const s = t({ minutes: 23 * 60 + 50 });
    const tick = advanceTime(s, 20);
    expect(tick).toEqual({ minutes: 20, hours: 1, days: 1 });
    expect(s.day).toBe(13);
    expect(s.minutes).toBe(10);
  });

  it('rolls seasons and years', () => {
    const s = t({ season: 3, day: 28, minutes: 1439 });
    advanceTime(s, 1);
    expect(s).toEqual({ year: 2, season: 0, day: 1, minutes: 0 });
  });

  it('sleeps until 6 AM the next day, or the same morning if before 6', () => {
    const late = t({ minutes: 22 * 60 });
    sleepUntilMorning(late);
    expect(late.day).toBe(13);
    expect(late.minutes).toBe(6 * 60);

    const early = t({ minutes: 2 * 60 });
    sleepUntilMorning(early);
    expect(early.day).toBe(12);
    expect(early.minutes).toBe(6 * 60);
  });

  it('absolute minutes are monotonic across rollovers', () => {
    const a = absoluteMinutes(t({ season: 0, day: 28, minutes: 1439 }));
    const b = absoluteMinutes(t({ season: 1, day: 1, minutes: 0 }));
    expect(b - a).toBe(1);
  });

  it('darkness ramps at sunset and sunrise', () => {
    expect(darkness(12 * 60)).toBe(0);
    expect(darkness(18 * 60)).toBe(0);
    expect(darkness(19 * 60 + 30)).toBeCloseTo(0.5);
    expect(darkness(23 * 60)).toBe(1);
    expect(darkness(5 * 60)).toBeCloseTo(0.5);
    expect(darkness(6 * 60)).toBe(0);
  });
});
