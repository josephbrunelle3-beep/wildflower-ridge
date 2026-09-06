import { BALANCE } from '../config/balance';
import { clampStat, type GameState, type HorseState } from '../state/GameState';
import { absoluteDay, absoluteMinutes } from './TimeSystem';

export interface CareResult {
  ok: boolean;
  message: string;
}

export type CareAction = 'feed' | 'brush' | 'groom' | 'tack' | 'bond' | 'ride';

export type SlotItem = 'hammer' | 'lasso' | 'bucket' | 'brush' | 'carrot' | 'flowers' | 'saddle' | 'horseshoe';
/** Hotbar order, matching the concept art left to right. */
export const HOTBAR: SlotItem[] = ['hammer', 'lasso', 'bucket', 'brush', 'carrot', 'flowers', 'saddle', 'horseshoe'];

export function selectedItem(state: GameState): SlotItem {
  return HOTBAR[state.selectedSlot] ?? 'hammer';
}

const her = (h: HorseState) => h.name;

export function feed(state: GameState): CareResult {
  const h = state.horse;
  const { care } = BALANCE;
  if (h.hunger >= 95) return { ok: false, message: `${her(h)} isn't hungry right now.` };

  if (selectedItem(state) === 'carrot' && state.inventory.carrots > 0) {
    state.inventory.carrots -= 1;
    h.hunger = clampStat(h.hunger + care.carrotHunger);
    h.bond = clampStat(h.bond + care.carrotBond);
    return { ok: true, message: `${her(h)} crunches the carrot happily.` };
  }
  if (state.inventory.hay > 0) {
    state.inventory.hay -= 1;
    h.hunger = clampStat(h.hunger + care.hayHunger);
    h.bond = clampStat(h.bond + care.hayBond);
    return { ok: true, message: `${her(h)} munches on the hay.` };
  }
  return { ok: false, message: 'Nothing to feed her. Grab hay from a bale or select a carrot.' };
}

export function brush(state: GameState): CareResult {
  const h = state.horse;
  if (selectedItem(state) !== 'brush') return { ok: false, message: 'Select the brush first.' };
  if (h.cleanliness >= 100) return { ok: false, message: `${her(h)}'s coat is already gleaming.` };
  h.cleanliness = clampStat(h.cleanliness + BALANCE.care.brushClean);
  h.bond = clampStat(h.bond + BALANCE.care.brushBond);
  return { ok: true, message: `You brush ${her(h)}'s coat until it shines.` };
}

export function groom(state: GameState): CareResult {
  const h = state.horse;
  if (selectedItem(state) !== 'horseshoe') return { ok: false, message: 'Select the horseshoe to check her hooves.' };
  const today = absoluteDay(state.time);
  if (h.lastGroomDay === today) return { ok: false, message: `${her(h)}'s hooves are already looked after today.` };
  h.lastGroomDay = today;
  h.energy = clampStat(h.energy + BALANCE.care.groomEnergy);
  h.bond = clampStat(h.bond + BALANCE.care.groomBond);
  return { ok: true, message: `You clean and check ${her(h)}'s hooves. She stands easy.` };
}

export function pet(state: GameState): CareResult {
  const h = state.horse;
  const now = absoluteMinutes(state.time);
  if (h.lastPetAt >= 0 && now - h.lastPetAt < BALANCE.care.petCooldownMinutes) {
    return { ok: false, message: `${her(h)} nuzzles you. She's had plenty of attention for now.` };
  }
  h.lastPetAt = now;
  h.bond = clampStat(h.bond + BALANCE.care.petBond);
  return { ok: true, message: `You stroke ${her(h)}'s neck. She leans into you.` };
}

export function tack(state: GameState): CareResult {
  const h = state.horse;
  if (h.tacked) {
    h.tacked = false;
    return { ok: true, message: `You take the saddle off ${her(h)}.` };
  }
  if (selectedItem(state) !== 'saddle') return { ok: false, message: 'Select the saddle first.' };
  if (h.bond < BALANCE.care.tackMinBond) {
    return { ok: false, message: `${her(h)} shies away. She needs to trust you more first.` };
  }
  h.tacked = true;
  return { ok: true, message: `You saddle up ${her(h)}. She's ready to ride.` };
}

export function canRide(state: GameState): CareResult {
  const h = state.horse;
  if (!h.tacked) return { ok: false, message: `Tack up ${her(h)} before riding.` };
  if (h.hunger < BALANCE.care.rideMinHunger) return { ok: false, message: `${her(h)} is too hungry to ride.` };
  if (h.energy < BALANCE.care.rideMinEnergy) return { ok: false, message: `${her(h)} is too tired to ride.` };
  return { ok: true, message: '' };
}

export function applyHourlyDecay(h: HorseState, hours: number, mounted: boolean): void {
  if (hours <= 0) return;
  const d = BALANCE.decayPerHour;
  h.hunger = clampStat(h.hunger - d.hunger * hours);
  h.cleanliness = clampStat(h.cleanliness - d.cleanliness * hours);
  if (!mounted) h.energy = clampStat(h.energy + d.energyRecover * hours);
}

export function drainGallop(h: HorseState, dtSec: number): void {
  h.energy = clampStat(h.energy - BALANCE.horse.gallopEnergyPerSec * dtSec);
}

export function canGallop(h: HorseState): boolean {
  return h.energy > BALANCE.horse.minEnergyToGallop;
}

export function moodOf(h: HorseState): string {
  if (h.hunger < 30) return 'Hungry';
  if (h.energy < 25) return 'Tired';
  if (h.cleanliness < 30) return 'Scruffy';
  if (h.bond < 15) return 'Wary';
  if (h.bond >= 60 && h.hunger >= 60) return 'Happy';
  return 'Content';
}
