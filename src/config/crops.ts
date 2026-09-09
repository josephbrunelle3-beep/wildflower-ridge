/**
 * The kitchen garden: what grows, how long it takes, and what it is worth.
 *
 * Growth is measured in *watered days*, not calendar days - a crop that never sees the
 * bucket simply sits there. Everything here is a tunable; the rules that use it live in
 * `systems/FarmingSystem.ts`.
 */

/** Season indices, matching GameState.SEASONS. */
export const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'];

export const SPRING = 0;
export const SUMMER = 1;
export const FALL = 2;
export const WINTER = 3;

export interface CropDef {
  id: string;
  name: string;
  /** Seasons the crop can be planted and will keep growing in. */
  seasons: number[];
  /** Watered days from sowing to ripe. */
  days: number;
  seedCost: number;
  /** What the shipping crate pays per crop. */
  sellPrice: number;
  /**
   * Set for crops that keep bearing: after a harvest the plant drops back to this many
   * watered days short of ripe instead of being used up.
   */
  regrowDays?: number;
  /** Crops that go straight into the barn rather than the crate. */
  feeds?: 'carrot' | 'hay';
  /** Leaf and fruit colours, used to draw the four growth stages. */
  leaf: string;
  leafDark: string;
  fruit: string;
  fruitDark: string;
  /** Ripe fruit hangs on the stalk (corn, tomato) or sits on the ground (pumpkin, carrot). */
  fruitAt: 'top' | 'ground';
  /** What one piece looks like in the harvest close-up. */
  piece: 'round' | 'root' | 'ear' | 'bloom' | 'sheaf';
  /**
   * How demanding the plant is to tend, 1 (forgiving) to 3 (fussy). Drives every mini-game:
   * how many weeds crowd in and how close, how narrow the watering sweet spot is, how
   * briefly the fruit stays ripe. See `systems/minigames/tuning.ts`.
   */
  difficulty: 1 | 2 | 3;
  /** Pieces on the plant at harvest - each one picked in the harvest game is one crop. */
  harvestItems: number;
  /**
   * How far down a grown plant's roots reach, as a fraction of the soil profile shown in
   * the watering close-up. Deep roots want a long soak; shallow ones drown easily. A
   * seedling's roots are a fraction of this and deepen as it grows.
   */
  rootDepth: number;
  blurb: string;
}

export const CROPS: CropDef[] = [
  {
    id: 'carrot', name: 'Carrots', seasons: [SPRING, FALL], days: 4, seedCost: 12, sellPrice: 30,
    feeds: 'carrot', leaf: '#5f9c46', leafDark: '#3f7330', fruit: '#e8843a', fruitDark: '#c05f22',
    fruitAt: 'ground', piece: 'root', difficulty: 1, harvestItems: 3, rootDepth: 0.72, blurb: "Four days to Star's favourite treat.",
  },
  {
    id: 'timothy', name: 'Timothy Grass', seasons: [SPRING, SUMMER], days: 5, seedCost: 15, sellPrice: 22,
    feeds: 'hay', leaf: '#9cb054', leafDark: '#7a8c3c', fruit: '#d4ad4a', fruitDark: '#ab8a33',
    fruitAt: 'top', piece: 'sheaf', difficulty: 1, harvestItems: 2, rootDepth: 0.38, blurb: 'Cut and dried, it is a winter of hay.',
  },
  {
    id: 'sweetpea', name: 'Sweet Peas', seasons: [SPRING], days: 6, seedCost: 20, sellPrice: 60,
    leaf: '#6aa855', leafDark: '#487a3a', fruit: '#e07fb0', fruitDark: '#b8558a',
    fruitAt: 'top', piece: 'bloom', difficulty: 2, harvestItems: 3, rootDepth: 0.5, blurb: 'The ridge sells them by the jar-full.',
  },
  {
    id: 'tomato', name: 'Tomatoes', seasons: [SUMMER], days: 7, regrowDays: 3, seedCost: 30, sellPrice: 55,
    leaf: '#5a9440', leafDark: '#3d6b2c', fruit: '#d4402f', fruitDark: '#a72d20',
    fruitAt: 'top', piece: 'round', difficulty: 2, harvestItems: 4, rootDepth: 0.66, blurb: 'Bears again three days after picking.',
  },
  {
    id: 'corn', name: 'Corn', seasons: [SUMMER, FALL], days: 8, regrowDays: 4, seedCost: 35, sellPrice: 70,
    leaf: '#78a83f', leafDark: '#557c2c', fruit: '#f0c94a', fruitDark: '#c69c2e',
    fruitAt: 'top', piece: 'ear', difficulty: 3, harvestItems: 2, rootDepth: 0.7, blurb: 'Stands through two seasons and keeps cropping.',
  },
  {
    id: 'pumpkin', name: 'Pumpkins', seasons: [FALL], days: 9, seedCost: 45, sellPrice: 170,
    leaf: '#4f8c3c', leafDark: '#356028', fruit: '#e0761f', fruitDark: '#b05412',
    fruitAt: 'ground', piece: 'round', difficulty: 3, harvestItems: 1, rootDepth: 0.58, blurb: 'Slow, greedy, and worth every day of it.',
  },
];

export const CROP_BY_ID: Record<string, CropDef> = Object.fromEntries(CROPS.map((c) => [c.id, c]));

/** Four drawn stages: sown, sprouted, leafy, ripe. */
export const CROP_STAGES = 4;

export const FARM = {
  /**
   * The farmyard: a fenced square west of the house, with the pond at its back. The fence
   * ring runs around `yard`; `plot` is the workable ground inside it, and the east column
   * of the yard is left for the crates and the pump.
   */
  yard: { x0: 16, y0: 20, x1: 24, y1: 25 },
  /** The most ground the garden can ever cover; each tier below unlocks a corner of it. */
  plot: { x0: 17, y0: 21, x1: 22, y1: 24 },
  /**
   * The garden starts small and is bought bigger at the seed crate. Each tier is the
   * width and height of workable ground from the plot's top-left corner, and what the
   * next one costs. A small garden tended well beats a big one half-watered.
   */
  tiers: [
    { w: 3, h: 2, cost: 0 },
    { w: 4, h: 3, cost: 400 },
    { w: 5, h: 4, cost: 1200 },
    { w: 6, h: 4, cost: 2500 },
  ],
  /** Two tiles wide, like the pasture gate - a mounted horse is wider than one tile. */
  gate: { x: 24, y0: 23, y1: 24 },
  /** The track from the gate east to the house path. */
  pathRow: { y: 23, x0: 25, x1: 30 },
  seedCrate: { x: 23, y: 21 },
  pump: { x: 23, y: 22 },
  shipCrate: { x: 23, y: 23 },

  /** Seeds are sold by the packet. */
  seedsPerPacket: 3,

  care: {
    /**
     * A dry crop wilts the first morning it is missed and dies on the third. The window is
     * deliberately wide enough to survive one forgotten day and narrow enough to matter.
     */
    dieAfterDryDays: 3,
    /**
     * Weeds sprout small and grow a level a night. Below `weedsChoke` they are a warning
     * you can see from the path; at it, the square stops growing until they are pulled.
     */
    weedSproutChance: 0.2,
    weedSproutChanceBare: 0.35,
    weedsChoke: 3,
    /** Bare soil left choked this long goes back to wild grass. */
    weedsReclaimAfter: 3,
    /** A crop that never went dry or weedy comes up prize-worthy. */
    prizeMultiplier: 2,
    /** Waterings the bucket holds before it needs refilling at the pump. */
    bucketCapacity: 12,
  },

  /** Field work costs daylight. These are the minutes each action puts on the clock. */
  minutes: { till: 10, sow: 5, water: 2, weed: 4, harvest: 3, clear: 5 },

  /** Chance of overnight rain per season, which waters the whole garden for you. */
  rainChance: [0.3, 0.18, 0.24, 0.12],

  /** Out-of-season crops wither where they stand. */
  witherOutOfSeason: true,
} as const;

export const plotWidth = FARM.plot.x1 - FARM.plot.x0 + 1;
export const plotHeight = FARM.plot.y1 - FARM.plot.y0 + 1;

export interface PlotRect { x0: number; y0: number; x1: number; y1: number }

/** The ground the garden covers at a given tier (inclusive tile bounds). */
export function plotAtTier(tier: number): PlotRect {
  const t = FARM.tiers[Math.max(0, Math.min(FARM.tiers.length - 1, tier))];
  return { x0: FARM.plot.x0, y0: FARM.plot.y0, x1: FARM.plot.x0 + t.w - 1, y1: FARM.plot.y0 + t.h - 1 };
}

export function inRect(r: PlotRect, tx: number, ty: number): boolean {
  return tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1;
}

/** Inside the yard's workable ground at all, whatever the current tier. */
export function inPlot(tx: number, ty: number): boolean {
  return inRect(FARM.plot, tx, ty);
}

export function inSeason(crop: CropDef, season: number): boolean {
  return crop.seasons.includes(season);
}

/** "Spring · Fall" - the seasons a packet is good for, for the seed crate listing. */
export function seedPacketLabel(crop: CropDef): string {
  return crop.seasons.map((s) => SEASON_NAMES[s]).join(' · ');
}
