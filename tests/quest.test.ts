import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/state/GameState';
import { activeQuests, allQuestsDone, completeQuest, initQuests } from '../src/systems/QuestSystem';

describe('QuestSystem', () => {
  it('starts with both mockup quests active and completes each once', () => {
    const s = createNewGame();
    initQuests(s);
    expect(activeQuests(s).map((q) => q.id)).toEqual(['pasture', 'jasper']);
    expect(completeQuest(s, 'pasture')).toBe(true);
    expect(completeQuest(s, 'pasture')).toBe(false);
    expect(activeQuests(s).map((q) => q.id)).toEqual(['jasper']);
    expect(allQuestsDone(s)).toBe(false);
    completeQuest(s, 'jasper');
    expect(allQuestsDone(s)).toBe(true);
  });

  it('does not reset finished quests when re-initialised (loading a save)', () => {
    const s = createNewGame();
    s.quests.pasture = 'done';
    initQuests(s);
    expect(s.quests.pasture).toBe('done');
    expect(s.quests.jasper).toBe('active');
  });
});
