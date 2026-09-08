import { createNewGame, SAVE_VERSION, type GameState } from '../state/GameState';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'wildflower-ridge:save';

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function saveGame(state: GameState, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...state, version: SAVE_VERSION, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return !!storage?.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function deleteSave(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Load and validate a save. Unknown fields are dropped and missing fields filled from a fresh
 * game, so older saves keep working as the state grows. Returns null if nothing usable is stored.
 */
export function loadGame(storage: StorageLike | null = defaultStorage()): GameState | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GameState> & { version?: number };
    if (typeof parsed !== 'object' || parsed === null) return null;
    return migrate(parsed);
  } catch {
    return null;
  }
}

function migrate(parsed: Partial<GameState> & { version?: number }): GameState {
  const fresh = createNewGame();
  // Version 1 is the only version so far; future migrations go here in order.
  return {
    version: SAVE_VERSION,
    player: { ...fresh.player, ...(parsed.player ?? {}) },
    horse: { ...fresh.horse, ...(parsed.horse ?? {}) },
    time: { ...fresh.time, ...(parsed.time ?? {}) },
    gold: typeof parsed.gold === 'number' ? parsed.gold : fresh.gold,
    inventory: { ...fresh.inventory, ...(parsed.inventory ?? {}) },
    farm: {
      ...fresh.farm,
      ...(parsed.farm ?? {}),
      plots: { ...(parsed.farm?.plots ?? {}) },
      seeds: { ...(parsed.farm?.seeds ?? fresh.farm.seeds) },
      produce: { ...(parsed.farm?.produce ?? {}) },
    },
    quests: { ...(parsed.quests ?? {}) },
    flags: { ...(parsed.flags ?? {}) },
    selectedSlot: typeof parsed.selectedSlot === 'number' ? parsed.selectedSlot : fresh.selectedSlot,
  };
}
