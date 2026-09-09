import type { HarvestParams } from './tuning';

export type PieceState = 'green' | 'ripe' | 'over' | 'picked' | 'bruised';

/** One piece of fruit or one root in the close-up. Field units, 0..1. */
export interface Piece {
  x: number;
  y: number;
  /** Seconds since this piece began to colour; negative while it waits its turn. */
  age: number;
  state: PieceState;
}

export type PickOutcome = 'picked' | 'early' | 'late' | 'miss';

/**
 * Pick each piece while it is ripe. They colour up one after another, hold ripe for a
 * moment, then go over. Grab one green and it bruises; wait too long and it is lost.
 */
export class HarvestModel {
  readonly pieces: Piece[] = [];
  picked = 0;
  private readonly params: HarvestParams;

  constructor(params: HarvestParams, fruitAt: 'top' | 'ground', random: () => number = Math.random) {
    this.params = params;
    const n = params.items;
    for (let i = 0; i < n; i++) {
      // Spread across the plant: fruit hangs in the canopy, roots sit along the soil line.
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = 0.28 + t * 0.44 + (random() - 0.5) * 0.06;
      const y = fruitAt === 'top' ? 0.42 + (random() - 0.5) * 0.16 : 0.79 + (random() - 0.5) * 0.02;
      // The first piece colours up almost at once; the rest follow in a shuffled order.
      this.pieces.push({ x, y, age: -(i * params.staggerSecs + 0.4), state: 'green' });
    }
    // Shuffle which piece goes first so the eye cannot just sweep left to right.
    for (let i = this.pieces.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const a = this.pieces[i].age;
      this.pieces[i].age = this.pieces[j].age;
      this.pieces[j].age = a;
    }
  }

  get done(): boolean {
    return this.pieces.every((p) => p.state === 'picked' || p.state === 'over' || p.state === 'bruised');
  }

  /** 0..1 of the way through ripening, for drawing the colour change. */
  ripeness(p: Piece): number {
    return Math.max(0, Math.min(1, p.age / this.params.ripenSecs));
  }

  update(dtSec: number): void {
    const { ripenSecs, ripeWindowSecs } = this.params;
    for (const p of this.pieces) {
      if (p.state === 'picked' || p.state === 'over' || p.state === 'bruised') continue;
      p.age += dtSec;
      if (p.age >= ripenSecs + ripeWindowSecs) p.state = 'over';
      else if (p.age >= ripenSecs) p.state = 'ripe';
    }
  }

  pick(x: number, y: number): PickOutcome {
    let best: Piece | null = null;
    let bestD = Infinity;
    for (const p of this.pieces) {
      if (p.state === 'picked' || p.state === 'bruised') continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= this.params.pickRadius && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) return 'miss';
    if (best.state === 'ripe') {
      best.state = 'picked';
      this.picked += 1;
      return 'picked';
    }
    if (best.state === 'over') return 'late';
    best.state = 'bruised';
    return 'early';
  }
}
