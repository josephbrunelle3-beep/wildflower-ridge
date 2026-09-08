import { BALANCE } from '../config/balance';
import type { Gait } from '../config/sprites';
import type { Facing } from '../state/GameState';

/**
 * Momentum model for a ridden horse.
 *
 * A horse is not a cursor: it takes ground to get going, a lot more ground to stop, and
 * it cannot pivot on the spot at speed. So instead of writing a velocity straight from
 * the keys, we keep a speed and a heading and move them toward what the rider asks for:
 *
 *   - Throttle accelerates toward the top speed of the requested gait.
 *   - Letting go coasts: a deliberately weak deceleration, so she runs on.
 *   - Reining back (holding roughly opposite the heading) brakes far harder, and is the
 *     only quick way to stop.
 *   - Turn rate falls as speed rises, so a gallop carves a wide arc while a walk can
 *     turn almost in place.
 *
 * Pure and Phaser-free so the feel can be unit-tested.
 */

export interface MoveState {
  /** Current speed in px/s, always >= 0. */
  speed: number;
  /** Heading in radians; only meaningful once moving, but always kept valid. */
  heading: number;
}

export interface MoveInput {
  /** Desired direction, not necessarily normalised. Zero means no throttle. */
  dx: number;
  dy: number;
  /** Rider is asking for a gallop. */
  gallop: boolean;
}

export const createMoveState = (heading = 0): MoveState => ({ speed: 0, heading });

const TAU = Math.PI * 2;

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * How fast she can turn at the current speed, in radians/sec. Full agility at a standstill,
 * falling to `turnAtGallop` of that by top speed.
 */
export function turnRateAt(speed: number): number {
  const m = BALANCE.horse;
  const t = Math.min(1, speed / m.gallopSpeed);
  return m.turnRate * (1 - t * (1 - m.turnAtGallop));
}

export function gaitFor(speed: number): Gait {
  const g = BALANCE.horse.gaitThresholds;
  if (speed < g.walk) return 'idle';
  if (speed < g.trot) return 'walk';
  if (speed < g.canter) return 'trot';
  if (speed < g.gallop) return 'canter';
  return 'gallop';
}

export function facingFor(heading: number): Facing {
  // Snap a continuous heading to the four drawn directions.
  const deg = ((heading * 180) / Math.PI + 360) % 360;
  if (deg >= 45 && deg < 135) return 'down';
  if (deg >= 135 && deg < 225) return 'left';
  if (deg >= 225 && deg < 315) return 'up';
  return 'right';
}

export interface MoveResult {
  vx: number;
  vy: number;
  /** True while the rider is actively reining her back. */
  braking: boolean;
}

export function stepMovement(state: MoveState, input: MoveInput, dtSec: number): MoveResult {
  const m = BALANCE.horse;
  const throttled = input.dx !== 0 || input.dy !== 0;
  let braking = false;

  if (throttled) {
    const wanted = Math.atan2(input.dy, input.dx);

    if (state.speed <= m.pivotSpeed) {
      // Slow enough to simply turn on the spot.
      state.heading = wanted;
    } else {
      const delta = angleDelta(state.heading, wanted);
      // Asking for a direction well behind her is a rein-back, not a turn.
      if (Math.abs(delta) > m.reinBackAngle) {
        braking = true;
        state.speed = Math.max(0, state.speed - m.brakeDecel * dtSec);
      } else {
        const maxTurn = turnRateAt(state.speed) * dtSec;
        state.heading += Math.abs(delta) <= maxTurn ? delta : Math.sign(delta) * maxTurn;
      }
    }

    if (!braking) {
      const top = input.gallop ? m.gallopSpeed : m.walkSpeed;
      if (state.speed < top) {
        state.speed = Math.min(top, state.speed + m.accel * dtSec);
      } else {
        // Above the requested gait she eases down rather than snapping.
        state.speed = Math.max(top, state.speed - m.gaitDropDecel * dtSec);
      }
    }
  } else {
    // No throttle: she runs on. This is the "hard to slow down" part.
    state.speed = Math.max(0, state.speed - m.coastDecel * dtSec);
  }

  state.heading = ((state.heading % TAU) + TAU) % TAU;
  return {
    vx: Math.cos(state.heading) * state.speed,
    vy: Math.sin(state.heading) * state.speed,
    braking,
  };
}

/** A jump needs enough impulsion to be worth attempting. */
export function canJump(state: MoveState): boolean {
  return state.speed >= BALANCE.horse.jump.minSpeed;
}
