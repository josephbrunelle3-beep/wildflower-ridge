import type { GameState } from '../state/GameState';

export function addGold(state: GameState, amount: number): number {
  state.gold = Math.max(0, Math.round(state.gold + amount));
  return state.gold;
}

export function canAfford(state: GameState, cost: number): boolean {
  return state.gold >= cost;
}

/** Returns false (and changes nothing) if the player cannot afford it. */
export function spendGold(state: GameState, cost: number): boolean {
  if (!canAfford(state, cost)) return false;
  state.gold -= cost;
  return true;
}

export function formatGold(gold: number): string {
  return gold.toLocaleString('en-US');
}
