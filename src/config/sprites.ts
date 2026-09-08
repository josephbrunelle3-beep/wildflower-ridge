import type { Facing } from '../state/GameState';

/**
 * Layout of onfe's horse sprite sheets (see CREDITS.md).
 *
 * Every sheet is 18 rows of 80x64 frames, grouped by facing. Side-on groups carry an
 * extra gait (canter) that the head-on groups do not, which is why the groups differ
 * in length:
 *
 *   rows  0-4   facing right : idle, walk, trot, canter, gallop
 *   rows  5-9   facing left  : idle, walk, trot, canter, gallop
 *   rows 10-13  facing down  : idle, walk, trot, gallop
 *   rows 14-17  facing up    : idle, walk, trot, gallop
 *
 * So within a group: idle is first, walk is second, gallop is always last. Rows are
 * ragged - trailing cells in a row are empty - so each animation declares its own
 * frame count rather than assuming the full width of the sheet.
 */

export const HORSE_FRAME_W = 80;
export const HORSE_FRAME_H = 64;

/**
 * Columns per sheet. onfe also ships 11-column "ridden" sheets, but their rider is an
 * unclothed base for the developer to paint over, so we use the riderless saddled horse
 * and draw our own rider on top instead.
 */
export const HORSE_SHEET_COLS = {
  base: 9,
  tacked: 9,
} as const;

export type HorseSheet = keyof typeof HORSE_SHEET_COLS;
export type HorseAnim = 'idle' | 'walk' | 'gallop';

interface Group {
  /** First row of the group. */
  row: number;
  /** Number of rows in the group. */
  rows: number;
}

const GROUPS: Record<Facing, Group> = {
  right: { row: 0, rows: 5 },
  left: { row: 5, rows: 5 },
  down: { row: 10, rows: 4 },
  up: { row: 14, rows: 4 },
};

/** Row index for one facing + animation. */
export function horseRow(facing: Facing, anim: HorseAnim): number {
  const g = GROUPS[facing];
  if (anim === 'idle') return g.row;
  if (anim === 'walk') return g.row + 1;
  return g.row + g.rows - 1; // gallop is always the last row of the group
}

/**
 * Frames actually drawn in each row, measured from the sheets (empty trailing cells
 * are excluded). Indexed [sheet][facing][anim].
 */
const FRAME_COUNTS: Record<HorseSheet, Record<Facing, Record<HorseAnim, number>>> = {
  base: {
    right: { idle: 9, walk: 8, gallop: 6 },
    left: { idle: 9, walk: 8, gallop: 6 },
    down: { idle: 2, walk: 8, gallop: 6 },
    up: { idle: 1, walk: 8, gallop: 6 },
  },
  tacked: {
    right: { idle: 9, walk: 8, gallop: 6 },
    left: { idle: 9, walk: 8, gallop: 6 },
    down: { idle: 2, walk: 8, gallop: 6 },
    up: { idle: 1, walk: 8, gallop: 6 },
  },
};

export function horseFrameCount(sheet: HorseSheet, facing: Facing, anim: HorseAnim): number {
  return FRAME_COUNTS[sheet][facing][anim];
}

/** Absolute frame indices for one animation, in play order. */
export function horseFrames(sheet: HorseSheet, facing: Facing, anim: HorseAnim): number[] {
  const cols = HORSE_SHEET_COLS[sheet];
  const base = horseRow(facing, anim) * cols;
  const count = horseFrameCount(sheet, facing, anim);
  return Array.from({ length: count }, (_, i) => base + i);
}

/** The frame shown when the horse is standing still. */
export function horseIdleFrame(sheet: HorseSheet, facing: Facing): number {
  return horseRow(facing, 'idle') * HORSE_SHEET_COLS[sheet];
}

export const HORSE_ANIMS: HorseAnim[] = ['idle', 'walk', 'gallop'];
export const FACINGS: Facing[] = ['down', 'left', 'right', 'up'];

export const horseAnimKey = (sheet: HorseSheet, anim: HorseAnim, facing: Facing): string =>
  `horse-${sheet}-${anim}-${facing}`;
