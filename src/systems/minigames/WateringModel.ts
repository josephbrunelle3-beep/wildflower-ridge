import type { WateringParams } from './tuning';

export type WateringVerdict = 'under' | 'perfect' | 'over';

/**
 * Hold to pour, let go in the sweet spot. The bar fills while `pouring` is true; letting go
 * settles the verdict, and filling right to the top spills over without waiting for you.
 */
export class WateringModel {
  level = 0;
  pouring = false;
  verdict: WateringVerdict | null = null;
  readonly zoneLo: number;
  readonly zoneHi: number;
  private readonly fillPerSec: number;

  constructor(params: WateringParams, random: () => number = Math.random) {
    const span = Math.max(0, params.zoneMax - params.zoneMin);
    this.zoneLo = params.zoneMin + random() * span;
    this.zoneHi = Math.min(1, this.zoneLo + params.zoneWidth);
    this.fillPerSec = params.fillPerSec;
  }

  get done(): boolean {
    return this.verdict !== null;
  }

  startPour(): void {
    if (!this.done) this.pouring = true;
  }

  /** Letting go is what settles it - no verdict until you do. */
  stopPour(): WateringVerdict | null {
    if (this.done) return this.verdict;
    if (!this.pouring) return null;
    this.pouring = false;
    this.verdict = this.level < this.zoneLo ? 'under' : this.level > this.zoneHi ? 'over' : 'perfect';
    return this.verdict;
  }

  update(dtSec: number): void {
    if (this.done || !this.pouring) return;
    this.level = Math.min(1, this.level + this.fillPerSec * dtSec);
    if (this.level >= 1) {
      this.pouring = false;
      this.verdict = 'over';
    }
  }
}
