// Tiny typed-ish event emitter shared by scenes and systems.
// Kept free of Phaser so pure systems stay unit-testable in Node.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, fn: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn);
  }

  once(event: string, fn: Handler): () => void {
    const wrapped: Handler = (...args) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, fn: Handler): void {
    this.handlers.get(event)?.delete(fn);
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(...args);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();

/** Event names used across the game. Documented here so scenes agree on payloads. */
export const EV = {
  TIME_MINUTE: 'time:minute', // (time: TimeState)
  TIME_HOUR: 'time:hour', // (hours: number)
  TIME_DAY: 'time:day', // (time: TimeState)
  GOLD_CHANGED: 'gold:changed', // (gold: number)
  QUEST_CHANGED: 'quest:changed', // ()
  HOTBAR_CHANGED: 'hotbar:changed', // (slot: number)
  INVENTORY_CHANGED: 'inventory:changed', // ()
  HORSE_CHANGED: 'horse:changed', // ()
  PROMPT: 'ui:prompt', // (text: string | null)
  TOAST: 'ui:toast', // (text: string)
  CARE_OPEN: 'care:open', // ()
  CARE_ACTION: 'care:action', // (action: CareAction)
  DIALOGUE_START: 'dialogue:start', // (npcId: string, node: string)
  DIALOGUE_END: 'dialogue:end', // (npcId: string, endNode: string)
  PAUSE_OPEN: 'pause:open', // ()
  SAVE_REQUEST: 'save:request', // ()
  QUIT_TO_TITLE: 'quit:title', // ()
  MOUNT: 'horse:mount', // ()
  DISMOUNT: 'horse:dismount', // ()
} as const;
