import type { HarvestParams } from './tuning';

export type Ripeness = 'under' | 'ripe' | 'over';
export type PieceState = 'onPlant' | 'picked' | 'lost';

/** One piece of fruit or one root in the close-up. Field units, 0..1. */
export interface Piece {
  x: number;
  y: number;
  ripeness: Ripeness;
  state: PieceState;
  /** Why it was lost, for the view to say so. */
  lostHow?: 'unripe' | 'over' | 'snapped';
}

export type GrabOutcome = 'held' | 'miss';
export type ReleaseOutcome = 'picked' | 'early' | 'snapped' | 'unripe' | 'over' | 'nothing';

/**
 * Harvesting as it is actually done: look the plant over, take hold of a piece that is
 * ready, and ease it off with a steady pull. Ripeness is fixed when you open the game -
 * it reflects how the plant was cared for - so there is no clock, only judgement and a
 * steady hand. Yank and the stem snaps; grab green and it bruises; the over-ripe ones
 * come away as mush.
 */
export class HarvestModel {
  readonly pieces: Piece[] = [];
  picked = 0;
  /** The piece in hand, and how far through the pull it is (1 = comes free). */
  holding: Piece | null = null;
  tension = 0;
  private readonly params: HarvestParams;

  constructor(params: HarvestParams, fruitAt: 'top' | 'ground', random: () => number = Math.random) {
    this.params = params;
    const n = params.items;
    const ripeness: Ripeness[] = [
      ...Array<Ripeness>(params.ripe).fill('ripe'),
      ...Array<Ripeness>(params.under).fill('under'),
      ...Array<Ripeness>(params.over).fill('over'),
    ];
    // Shuffle so the ready ones are not always on the left.
    for (let i = ripeness.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ripeness[i], ripeness[j]] = [ripeness[j], ripeness[i]];
    }
    for (let i = 0; i < n; i++) {
      // Spread across the plant: fruit hangs in the canopy, roots sit along the soil line.
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = 0.28 + t * 0.44 + (random() - 0.5) * 0.06;
      const y = fruitAt === 'top' ? 0.42 + (random() - 0.5) * 0.16 : 0.79 + (random() - 0.5) * 0.02;
      this.pieces.push({ x, y, ripeness: ripeness[i] ?? 'ripe', state: 'onPlant' });
    }
  }

  /** Ready pieces still on the plant. The under-ripe ones are meant to be left. */
  get ripeLeft(): number {
    return this.pieces.filter((p) => p.state === 'onPlant' && p.ripeness === 'ripe').length;
  }

  get done(): boolean {
    return this.ripeLeft === 0 && !this.holding;
  }

  /** Take hold of the nearest piece. Nothing is decided until you let go. */
  grab(x: number, y: number): GrabOutcome {
    if (this.holding) return 'miss';
    let best: Piece | null = null;
    let bestD = Infinity;
    for (const p of this.pieces) {
      if (p.state !== 'onPlant') continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= this.params.pickRadius && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) return 'miss';
    this.holding = best;
    this.tension = 0;
    return 'held';
  }

  /** Keep pulling while held. Past the window the stem gives way - the piece is lost. */
  update(dtSec: number): ReleaseOutcome | null {
    if (!this.holding) return null;
    this.tension += dtSec / this.params.pullSecs;
    if (this.tension > 1 + this.params.window) {
      const p = this.holding;
      this.holding = null;
      p.state = 'lost';
      p.lostHow = 'snapped';
      return 'snapped';
    }
    return null;
  }

  release(): ReleaseOutcome {
    const p = this.holding;
    if (!p) return 'nothing';
    this.holding = null;
    if (p.ripeness === 'under') {
      p.state = 'lost';
      p.lostHow = 'unripe';
      return 'unripe';
    }
    if (p.ripeness === 'over') {
      p.state = 'lost';
      p.lostHow = 'over';
      return 'over';
    }
    if (this.tension < 1 - this.params.window) return 'early'; // still on the plant
    p.state = 'picked';
    this.picked += 1;
    return 'picked';
  }
}
