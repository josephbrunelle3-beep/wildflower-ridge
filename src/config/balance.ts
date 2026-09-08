/** Tunables. Everything that affects feel or pacing lives here. */
export const BALANCE = {
  /** Real milliseconds per in-game minute. 700 ms => a full day is ~16.8 real minutes. */
  realMsPerGameMinute: 700,

  player: {
    walkSpeed: 64,
    runSpeed: 104,
  },

  horse: {
    /** Top speed under throttle without asking for a gallop. */
    walkSpeed: 96,
    gallopSpeed: 168,
    wanderSpeed: 26,
    wanderRadius: 56,
    gallopEnergyPerSec: 2.5,
    minEnergyToGallop: 8,

    // --- Momentum. See systems/HorseMovement.ts. ---------------------------
    /** px/s^2 under throttle: about a second and a half from halt to full gallop. */
    accel: 110,
    /**
     * px/s^2 with the reins loose. Deliberately weak - this is the number that makes her
     * feel like an animal with her own momentum rather than a cursor. From a gallop she
     * runs on for roughly five seconds and most of a field.
     */
    coastDecel: 34,
    /** px/s^2 when reined back (holding roughly against the heading). The only fast stop. */
    brakeDecel: 150,
    /** px/s^2 when dropping from gallop to cruise after releasing Shift. */
    gaitDropDecel: 90,
    /** Turn rate in rad/s at a standstill. */
    turnRate: 3.4,
    /** Fraction of that turn rate left at full gallop, so speed carves a wide arc. */
    turnAtGallop: 0.28,
    /** At or below this speed she simply turns on the spot. */
    pivotSpeed: 18,
    /** Asking for a heading more than this far off her own is read as a rein-back. */
    reinBackAngle: 2.2,
    /** Speed at which each gait animation takes over. */
    gaitThresholds: { walk: 10, trot: 55, canter: 100, gallop: 140 },

    jump: {
      /** She needs impulsion to leave the ground. */
      minSpeed: 70,
      /** Frames per second for the jump animation; also sets how long the leap lasts. */
      frameRate: 20,
      /** Speed floor while airborne, so a jump always clears the obstacle. */
      airSpeed: 96,
    },
  },

  care: {
    carrotHunger: 25,
    carrotBond: 3,
    hayHunger: 15,
    hayBond: 1,
    brushClean: 30,
    brushBond: 2,
    groomEnergy: 10,
    groomBond: 3,
    petBond: 4,
    petCooldownMinutes: 60,
    /** Bond needed before the horse accepts a saddle. */
    tackMinBond: 10,
    /** Hunger below this and the horse refuses to be ridden. */
    rideMinHunger: 15,
    rideMinEnergy: 10,
  },

  decayPerHour: {
    hunger: 3,
    cleanliness: 2,
    energyRecover: 6,
  },

  startGold: 4826,
  startCarrots: 5,
  maxHay: 5,
};
