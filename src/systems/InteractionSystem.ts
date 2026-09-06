import type { Facing } from '../state/GameState';

export interface Interactable {
  /** World position; getters are fine for moving things. */
  readonly x: number;
  readonly y: number;
  /** Reach in pixels from the point in front of the player. */
  radius?: number;
  prompt(): string | null;
  interact(): void;
}

const FACING_DIR: Record<Facing, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const DEFAULT_RADIUS = 22;
const REACH = 10;

/** Registry of things the player can press E on; picks the closest one in front of them. */
export class InteractionSystem {
  private readonly items: Interactable[] = [];

  add(item: Interactable): void {
    this.items.push(item);
  }

  remove(item: Interactable): void {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  findNearest(px: number, py: number, facing: Facing): Interactable | null {
    const [fx, fy] = FACING_DIR[facing];
    const tx = px + fx * REACH;
    const ty = py + fy * REACH;
    let best: Interactable | null = null;
    let bestDist = Infinity;
    for (const it of this.items) {
      const r = it.radius ?? DEFAULT_RADIUS;
      const d = Math.hypot(it.x - tx, it.y - ty);
      if (d <= r && d < bestDist && it.prompt() !== null) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }
}
