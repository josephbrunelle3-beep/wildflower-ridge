import questData from '../data/quests.json';
import type { GameState } from '../state/GameState';

export interface QuestDef {
  id: string;
  title: string;
}

export const QUESTS: QuestDef[] = questData as QuestDef[];

/** Make sure every defined quest has a status; new saves start with all of them active. */
export function initQuests(state: GameState): void {
  for (const q of QUESTS) {
    if (!(q.id in state.quests)) state.quests[q.id] = 'active';
  }
}

export function activeQuests(state: GameState): QuestDef[] {
  return QUESTS.filter((q) => state.quests[q.id] === 'active');
}

export function isQuestActive(state: GameState, id: string): boolean {
  return state.quests[id] === 'active';
}

/** Returns true only the first time the quest is completed. */
export function completeQuest(state: GameState, id: string): boolean {
  if (state.quests[id] !== 'active') return false;
  state.quests[id] = 'done';
  return true;
}

export function allQuestsDone(state: GameState): boolean {
  return QUESTS.every((q) => state.quests[q.id] === 'done');
}
