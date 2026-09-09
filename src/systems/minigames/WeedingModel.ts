import type { WeedingParams } from './tuning';

/** One weed in the close-up: a base you grab and a stalk you must not. Field units, 0..1. */
export interface Weed {
  x: number;
  /** Where the roots meet the soil - the only place a grab actually pulls it. */
  baseY: number;
  /** Top of the stalk. Grabbing between base and top snaps it and it stays. */
  topY: number;
  pulled: boolean;
  /** Times it has been grabbed by the stalk; it shrinks a little each time. */
  snapped: number;
}

export type GrabOutcome = 'pulled' | 'snapped' | 'plant' | 'miss';

/** The plant stands in the middle of the field, roots at the soil line. */
export const PLANT_X = 0.5;
export const SOIL_Y = 0.78;

/**
 * Pull the weeds by the base, not the plant. Weeds come up either side of the crop, some
 * uncomfortably close; a grab lands on whichever thing is nearest, and where on it.
 */
export class WeedingModel {
  readonly weeds: Weed[] = [];
  damage = 0;
  private readonly params: WeedingParams;

  constructor(params: WeedingParams, random: () => number = Math.random) {
    this.params = params;
    const n = params.count;
    for (let i = 0; i < n; i++) {
      // Alternate sides, spread outward, jittered so no two runs look the same.
      const side = i % 2 === 0 ? -1 : 1;
      const rank = Math.floor(i / 2);
      const gap = params.minPlantGap + rank * 0.13 + random() * 0.06;
      const x = Math.max(0.06, Math.min(0.94, PLANT_X + side * gap));
      const baseY = SOIL_Y + (random() - 0.5) * 0.06;
      const height = 0.22 + random() * 0.14;
      this.weeds.push({ x, baseY, topY: baseY - height, pulled: false, snapped: 0 });
    }
  }

  get remaining(): number {
    return this.weeds.filter((w) => !w.pulled).length;
  }

  get done(): boolean {
    return this.remaining === 0;
  }

  /** Hit-test a grab at (x, y) in field units. Mutates the weed or the damage tally. */
  grab(x: number, y: number): GrabOutcome {
    if (this.done) return 'miss';
    const { baseRadius, canopyRadius } = this.params;

    // Bases first: a grab near the roots always counts as a pull, even beside the plant.
    let best: Weed | null = null;
    let bestD = Infinity;
    for (const w of this.weeds) {
      if (w.pulled) continue;
      const d = Math.hypot(w.x - x, w.baseY - y);
      if (d <= baseRadius && d < bestD) {
        best = w;
        bestD = d;
      }
    }
    if (best) {
      best.pulled = true;
      return 'pulled';
    }

    // Then the plant's canopy, which sits above the soil line. A zero radius means there
    // is no plant in the frame at all (weeding bare soil), so nothing can be torn.
    const canopyY = SOIL_Y - 0.22;
    if (canopyRadius > 0 && Math.hypot(PLANT_X - x, canopyY - y) <= canopyRadius) {
      this.damage += 1;
      return 'plant';
    }

    // Then a stalk: between base and top, within a thin band either side.
    for (const w of this.weeds) {
      if (w.pulled) continue;
      const withinX = Math.abs(w.x - x) <= 0.045;
      const withinY = y >= w.topY - 0.02 && y < w.baseY - baseRadius;
      if (withinX && withinY) {
        w.snapped += 1;
        // It breaks off shorter each time, which brings the base closer to hand.
        w.topY = Math.min(w.baseY - 0.08, w.topY + 0.07);
        return 'snapped';
      }
    }
    return 'miss';
  }
}
