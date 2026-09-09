import type { WateringParams } from './tuning';

export type WateringVerdict = 'under' | 'perfect' | 'over';

/**
 * Hold to pour, let go when the water has soaked down to the roots. `level` is how far
 * down the soil profile the wet front has reached; it sinks while `pouring` is true.
 * Letting go settles the verdict, and soaking right to the bottom waterlogs the square
 * without waiting for you.
 */
export class WateringModel {
  level = 0;
  pouring = false;
  verdict: WateringVerdict | null = null;
  readonly zoneLo: number;
  readonly zoneHi: number;
  readonly rootDepth: number;
  private readonly fillPerSec: number;

  constructor(params: WateringParams) {
    this.zoneLo = params.zoneLo;
    this.zoneHi = params.zoneHi;
    this.rootDepth = params.rootDepth;
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
