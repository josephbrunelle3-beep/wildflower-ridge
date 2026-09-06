import { createNewGame, type GameState } from '../state/GameState';

/**
 * The single live game session. Scenes read and mutate `G.state`; SaveSystem serialises it.
 * `uiLocked` is true while a menu or dialogue owns the keyboard, so the world stops moving.
 */
export const G: { state: GameState; uiLocked: boolean } = {
  state: createNewGame(),
  uiLocked: false,
};

export function startNewSession(state: GameState = createNewGame()): void {
  G.state = state;
  G.uiLocked = false;
}
