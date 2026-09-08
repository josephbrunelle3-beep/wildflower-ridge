import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import {
  angleDelta, canJump, createMoveState, facingFor, gaitFor, stepMovement, turnRateAt,
} from '../src/systems/HorseMovement';

const DT = 1 / 60;

/** Run the model for `seconds` with a fixed input, returning the final state. */
function run(state = createMoveState(), input = { dx: 1, dy: 0, gallop: false }, seconds = 1) {
  let last = { vx: 0, vy: 0, braking: false };
  for (let i = 0; i < Math.round(seconds / DT); i++) last = stepMovement(state, input, DT);
  return { state, last };
}

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(Math.PI * 2 - 0.1, 0.1)).toBeCloseTo(0.2);
  });
});

describe('gaits', () => {
  it('steps up through the gaits with speed', () => {
    const g = BALANCE.horse.gaitThresholds;
    expect(gaitFor(0)).toBe('idle');
    expect(gaitFor(g.walk)).toBe('walk');
    expect(gaitFor(g.trot)).toBe('trot');
    expect(gaitFor(g.canter)).toBe('canter');
    expect(gaitFor(g.gallop)).toBe('gallop');
  });

  it('snaps a heading to the four drawn facings', () => {
    expect(facingFor(0)).toBe('right');
    expect(facingFor(Math.PI / 2)).toBe('down');
    expect(facingFor(Math.PI)).toBe('left');
    expect(facingFor((3 * Math.PI) / 2)).toBe('up');
  });
});

describe('acceleration and momentum', () => {
  it('builds speed under throttle rather than snapping to it', () => {
    const { state } = run(createMoveState(), { dx: 1, dy: 0, gallop: true }, 0.25);
    expect(state.speed).toBeGreaterThan(0);
    expect(state.speed).toBeLessThan(BALANCE.horse.gallopSpeed);
  });

  it('reaches, but does not exceed, the requested top speed', () => {
    const { state } = run(createMoveState(), { dx: 1, dy: 0, gallop: true }, 4);
    expect(state.speed).toBeCloseTo(BALANCE.horse.gallopSpeed, 0);
  });

  it('runs on for a long way once the reins go loose', () => {
    const state = createMoveState();
    run(state, { dx: 1, dy: 0, gallop: true }, 4);
    const top = state.speed;

    // One second of coasting should barely dent a gallop.
    run(state, { dx: 0, dy: 0, gallop: false }, 1);
    expect(state.speed).toBeGreaterThan(top * 0.7);

    // It takes several seconds to actually stop.
    run(state, { dx: 0, dy: 0, gallop: false }, 3);
    expect(state.speed).toBeGreaterThan(0);
    run(state, { dx: 0, dy: 0, gallop: false }, 2);
    expect(state.speed).toBe(0);
  });

  it('stops far quicker when reined back than when coasting', () => {
    const coasting = createMoveState();
    run(coasting, { dx: 1, dy: 0, gallop: true }, 4);
    run(coasting, { dx: 0, dy: 0, gallop: false }, 1);

    const reined = createMoveState();
    run(reined, { dx: 1, dy: 0, gallop: true }, 4);
    // Asking for the opposite direction is a rein-back, not a turn.
    const { last } = run(reined, { dx: -1, dy: 0, gallop: false }, 1);

    expect(last.braking).toBe(true);
    expect(reined.speed).toBeLessThan(coasting.speed);
  });

  it('eases down to a cruise when the gallop is released', () => {
    const state = createMoveState();
    run(state, { dx: 1, dy: 0, gallop: true }, 4);
    run(state, { dx: 1, dy: 0, gallop: false }, 2);
    expect(state.speed).toBeCloseTo(BALANCE.horse.walkSpeed, 0);
  });
});

describe('steering', () => {
  it('turns more slowly the faster she is going', () => {
    expect(turnRateAt(0)).toBeCloseTo(BALANCE.horse.turnRate);
    expect(turnRateAt(BALANCE.horse.gallopSpeed)).toBeCloseTo(
      BALANCE.horse.turnRate * BALANCE.horse.turnAtGallop,
    );
    expect(turnRateAt(BALANCE.horse.gallopSpeed)).toBeLessThan(turnRateAt(0));
  });

  it('pivots on the spot at a standstill', () => {
    const state = createMoveState(0);
    stepMovement(state, { dx: 0, dy: 1, gallop: false }, DT);
    expect(state.heading).toBeCloseTo(Math.PI / 2);
  });

  it('carves a wide arc at a gallop instead of turning on a sixpence', () => {
    const state = createMoveState(0);
    run(state, { dx: 1, dy: 0, gallop: true }, 4);
    // Ask for a quarter turn and give her a tenth of a second.
    run(state, { dx: 0, dy: 1, gallop: true }, 0.1);
    expect(state.heading).toBeGreaterThan(0);
    expect(state.heading).toBeLessThan(Math.PI / 2);
  });
});

describe('jumping', () => {
  it('needs impulsion to leave the ground', () => {
    const state = createMoveState();
    expect(canJump(state)).toBe(false);
    state.speed = BALANCE.horse.jump.minSpeed;
    expect(canJump(state)).toBe(true);
  });
});
