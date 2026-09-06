import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/state/GameState';
import { applyHourlyDecay, brush, canRide, feed, groom, HOTBAR, moodOf, pet, tack } from '../src/systems/HorseCareSystem';
import { BALANCE } from '../src/config/balance';

const slot = (item: (typeof HOTBAR)[number]) => HOTBAR.indexOf(item);

describe('HorseCareSystem', () => {
  it('feeds a carrot when one is selected, otherwise hay', () => {
    const s = createNewGame();
    s.selectedSlot = slot('carrot');
    const before = s.horse.hunger;
    expect(feed(s).ok).toBe(true);
    expect(s.inventory.carrots).toBe(BALANCE.startCarrots - 1);
    expect(s.horse.hunger).toBe(before + BALANCE.care.carrotHunger);

    s.selectedSlot = slot('brush');
    expect(feed(s).ok).toBe(false);
    s.inventory.hay = 1;
    expect(feed(s).ok).toBe(true);
    expect(s.inventory.hay).toBe(0);
  });

  it('refuses to feed a full horse', () => {
    const s = createNewGame();
    s.horse.hunger = 100;
    s.selectedSlot = slot('carrot');
    expect(feed(s).ok).toBe(false);
    expect(s.inventory.carrots).toBe(BALANCE.startCarrots);
  });

  it('brushing needs the brush and caps at 100', () => {
    const s = createNewGame();
    expect(brush(s).ok).toBe(false);
    s.selectedSlot = slot('brush');
    s.horse.cleanliness = 90;
    expect(brush(s).ok).toBe(true);
    expect(s.horse.cleanliness).toBe(100);
    expect(brush(s).ok).toBe(false);
  });

  it('grooming is once per day', () => {
    const s = createNewGame();
    s.selectedSlot = slot('horseshoe');
    expect(groom(s).ok).toBe(true);
    expect(groom(s).ok).toBe(false);
    s.time.day += 1;
    expect(groom(s).ok).toBe(true);
  });

  it('petting has a cooldown', () => {
    const s = createNewGame();
    expect(pet(s).ok).toBe(true);
    expect(pet(s).ok).toBe(false);
    s.time.minutes += BALANCE.care.petCooldownMinutes;
    expect(pet(s).ok).toBe(true);
  });

  it('tacking requires trust and the saddle, then riding is allowed', () => {
    const s = createNewGame();
    s.selectedSlot = slot('saddle');
    expect(tack(s).ok).toBe(false);
    s.horse.bond = BALANCE.care.tackMinBond;
    expect(tack(s).ok).toBe(true);
    expect(s.horse.tacked).toBe(true);
    expect(canRide(s).ok).toBe(true);
    s.horse.energy = 0;
    expect(canRide(s).ok).toBe(false);
    // Untacking works regardless of selection.
    s.selectedSlot = slot('hammer');
    expect(tack(s).ok).toBe(true);
    expect(s.horse.tacked).toBe(false);
  });

  it('decays hunger and cleanliness hourly and recovers energy when idle', () => {
    const s = createNewGame();
    const h = { ...s.horse, hunger: 50, cleanliness: 50, energy: 50 };
    applyHourlyDecay(h, 2, false);
    expect(h.hunger).toBe(50 - 2 * BALANCE.decayPerHour.hunger);
    expect(h.cleanliness).toBe(50 - 2 * BALANCE.decayPerHour.cleanliness);
    expect(h.energy).toBe(50 + 2 * BALANCE.decayPerHour.energyRecover);
    applyHourlyDecay(h, 1, true);
    expect(h.energy).toBe(50 + 2 * BALANCE.decayPerHour.energyRecover);
  });

  it('reports a mood', () => {
    const s = createNewGame();
    expect(moodOf({ ...s.horse, hunger: 10 })).toBe('Hungry');
    expect(moodOf({ ...s.horse, bond: 80, hunger: 90, cleanliness: 90, energy: 90 })).toBe('Happy');
  });
});
