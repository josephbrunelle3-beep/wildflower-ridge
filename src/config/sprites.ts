import type { Facing } from '../state/GameState';

/**
 * Layout of onfe's horse sprite sheets (see CREDITS.md).
 *
 * The gait sheets are 18 rows of 80x64 frames, grouped by facing. Side-on groups carry
 * an extra gait (canter) that the head-on groups do not, so the groups differ in length:
 *
 *   rows  0-4   facing right : idle, walk, trot, canter, gallop
 *   rows  5-9   facing left  : idle, walk, trot, canter, gallop
 *   rows 10-13  facing down  : idle, walk, trot, gallop
 *   rows 14-17  facing up    : idle, walk, trot, gallop
 *
 * Rows are ragged - trailing cells are empty - so every animation declares its own frame
 * count, measured from the sheets rather than assumed from the sheet width.
 *
 * The jump sheet is separate: taller 80x82 frames, one row per facing in the same order
 * (right, left, down, up).
 */

export const HORSE_FRAME_W = 80;
export const HORSE_FRAME_H = 64;
export const JUMP_FRAME_W = 80;
export const JUMP_FRAME_H = 82;

/**
 * Columns per gait sheet. onfe also ships 11-column "ridden" sheets, but their rider is
 * an unclothed base for the developer to paint over, so we use the riderless saddled
 * horse and draw our own rider on top instead.
 */
export const HORSE_SHEET_COLS = {
  base: 9,
  tacked: 9,
} as const;

export type HorseSheet = keyof typeof HORSE_SHEET_COLS;

/** Gaits, slowest to fastest. This order is also the row order within a facing group. */
export type Gait = 'idle' | 'walk' | 'trot' | 'canter' | 'gallop';

/** Row order per facing. Head-on views have no canter. */
const ROW_ORDER: Record<Facing, Gait[]> = {
  right: ['idle', 'walk', 'trot', 'canter', 'gallop'],
  left: ['idle', 'walk', 'trot', 'canter', 'gallop'],
  down: ['idle', 'walk', 'trot', 'gallop'],
  up: ['idle', 'walk', 'trot', 'gallop'],
};

/** First row of each facing group. */
const GROUP_START: Record<Facing, number> = { right: 0, left: 5, down: 10, up: 14 };

/** Frames actually drawn per row, measured from the sheets, in ROW_ORDER order. */
const FRAME_COUNTS: Record<Facing, number[]> = {
  right: [9, 8, 9, 8, 6],
  left: [9, 8, 9, 8, 6],
  down: [2, 8, 8, 6],
  up: [1, 8, 8, 6],
};

/** Head-on views lack a canter row, so canter falls back to trot there. */
function gaitIndex(facing: Facing, gait: Gait): number {
  const order = ROW_ORDER[facing];
  const i = order.indexOf(gait);
  if (i >= 0) return i;
  return order.indexOf(gait === 'canter' ? 'trot' : 'gallop');
}

export function horseRow(facing: Facing, gait: Gait): number {
  return GROUP_START[facing] + gaitIndex(facing, gait);
}

export function horseFrameCount(facing: Facing, gait: Gait): number {
  return FRAME_COUNTS[facing][gaitIndex(facing, gait)];
}

/** Absolute frame indices for one animation, in play order. */
export function horseFrames(sheet: HorseSheet, facing: Facing, gait: Gait): number[] {
  const cols = HORSE_SHEET_COLS[sheet];
  const base = horseRow(facing, gait) * cols;
  return Array.from({ length: horseFrameCount(facing, gait) }, (_, i) => base + i);
}

/** The frame shown when the horse is standing still. */
export function horseIdleFrame(sheet: HorseSheet, facing: Facing): number {
  return horseRow(facing, 'idle') * HORSE_SHEET_COLS[sheet];
}

export const GAITS: Gait[] = ['idle', 'walk', 'trot', 'canter', 'gallop'];
export const FACINGS: Facing[] = ['down', 'left', 'right', 'up'];

export const horseAnimKey = (sheet: HorseSheet, gait: Gait, facing: Facing): string =>
  `horse-${sheet}-${gait}-${facing}`;

// --- Jump sheet -------------------------------------------------------------

export const JUMP_COLS = 16;
const JUMP_ROW: Record<Facing, number> = { right: 0, left: 1, down: 2, up: 3 };
const JUMP_FRAME_COUNTS: Record<Facing, number> = { right: 16, left: 16, down: 13, up: 14 };

export function jumpFrames(facing: Facing): number[] {
  const base = JUMP_ROW[facing] * JUMP_COLS;
  return Array.from({ length: JUMP_FRAME_COUNTS[facing] }, (_, i) => base + i);
}

export const jumpAnimKey = (facing: Facing): string => `horse-jump-${facing}`;
