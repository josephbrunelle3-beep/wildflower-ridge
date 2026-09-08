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

  it('round-trips the garden, and fills it in for a save made before farming existed', () => {
    const storage = memStorage();
    const s = createNewGame();
    s.farm.plots['17,21'] = {
      crop: 'carrot', growth: 2, watered: true, sownDay: 11, withered: false,
      dryDays: 1, weedy: true, neglect: 2, fallowDays: 0,
    };
    s.farm.produce.pumpkin = 2;
    s.farm.harvested = 3;
    expect(saveGame(s, storage)).toBe(true);
    const loaded = loadGame(storage)!;
    expect(loaded.farm.plots['17,21']).toEqual(s.farm.plots['17,21']);
    expect(loaded.farm.produce.pumpkin).toBe(2);
    expect(loaded.farm.harvested).toBe(3);

    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, gold: 5 }));
    const old = loadGame(storage)!;
    expect(old.farm.plots).toEqual({});
    expect(old.farm.seeds.carrot).toBe(3);

    // A save from before crops could wilt still loads, with the care fields filled in.
    storage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      farm: { plots: { '17,21': { crop: 'carrot', growth: 1, watered: false, sownDay: 3, withered: false } } },
    }));
    const preCare = loadGame(storage)!.farm.plots['17,21'];
    expect(preCare).toMatchObject({ crop: 'carrot', growth: 1, dryDays: 0, weedy: false, neglect: 0 });
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
