import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/state/GameState';
import { hasSave, loadGame, saveGame, SAVE_KEY, type StorageLike } from '../src/systems/SaveSystem';

const memStorage = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe('SaveSystem', () => {
  it('round-trips a game state', () => {
    const storage = memStorage();
    const s = createNewGame();
    s.gold = 12;
    s.horse.bond = 42;
    s.quests.pasture = 'done';
    s.player = { x: 100, y: 200, facing: 'left', placed: true };
    expect(saveGame(s, storage)).toBe(true);
    expect(hasSave(storage)).toBe(true);
    const loaded = loadGame(storage)!;
    expect(loaded.gold).toBe(12);
    expect(loaded.horse.bond).toBe(42);
    expect(loaded.quests.pasture).toBe('done');
    expect(loaded.player).toEqual(s.player);
  });

  it('returns null with no save or corrupt data', () => {
    const storage = memStorage();
    expect(loadGame(storage)).toBeNull();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadGame(storage)).toBeNull();
  });

  it('fills missing fields from a fresh game', () => {
    const storage = memStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, gold: 5 }));
    const loaded = loadGame(storage)!;
    expect(loaded.gold).toBe(5);
    expect(loaded.horse.name).toBe('Star');
    expect(loaded.time.day).toBe(12);
  });
});
