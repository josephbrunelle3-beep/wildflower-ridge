/** Tunables. Everything that affects feel or pacing lives here. */
export const BALANCE = {
  /** Real milliseconds per in-game minute. 700 ms => a full day is ~16.8 real minutes. */
  realMsPerGameMinute: 700,

  player: {
    walkSpeed: 64,
    runSpeed: 104,
  },

  horse: {
    walkSpeed: 96,
    gallopSpeed: 168,
    wanderSpeed: 26,
    wanderRadius: 56,
    gallopEnergyPerSec: 2.5,
    minEnergyToGallop: 8,
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
