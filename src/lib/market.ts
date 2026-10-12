export const expectedFareMin = [60, 60, 55, 55, 50, 50, 50, 55, 65, 75];
export const expectedFareMax = [120, 120, 120, 120, 110, 105, 100, 110, 130, 150];
export const expectedBookingsMin = [2, 3, 3, 3, 4, 5, 9, 9, 7, 5];
export const expectedBookingsMax = [6, 6, 8, 8, 10, 13, 16, 15, 13, 11];
export const elasticityMin = [-1.8, -1.8, -1.8, -1.8, -1.8, -2.0, -2.2, -2.2, -1.7, -1.6];
export const elasticityMax = [-1.4, -1.4, -1.6, -1.6, -1.7, -1.8, -1.8, -1.8, -1.5, -1.3];

export function uiPeriodToModelIndex(uiPeriod: number): number | null {
  if (uiPeriod < 1 || uiPeriod > 10) return null;
  return 10 - uiPeriod;
}

function clip01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const INITIAL_MARKET_STRENGTH = 0.5;

export type StrengthSelection = {
  selected: number;
  active: number;
};

export function initialStrengthSelection(): StrengthSelection {
  return { selected: INITIAL_MARKET_STRENGTH, active: INITIAL_MARKET_STRENGTH };
}

/** Draw a new selected strength. The flight already in progress keeps its active strength. */
export function randomizeStrength(
  selection: StrengthSelection,
  random: () => number = Math.random,
): StrengthSelection {
  return {
    selected: sampleHiddenStrength(random),
    active: selection.active,
  };
}

/** Apply the selected strength. Does not draw another value. */
export function applyStrengthOnReset(selection: StrengthSelection): StrengthSelection {
  return { selected: selection.selected, active: selection.selected };
}

/** Strategy changes restart the flight on the active strength, ignoring a pending selection. */
export function strengthAfterStrategyChange(selection: StrengthSelection): StrengthSelection {
  return { selected: selection.selected, active: selection.active };
}

export function isStrengthPending(selection: StrengthSelection): boolean {
  return selection.selected !== selection.active;
}

export function sampleStandardNormal(): number {
  return sampleStandardNormalFrom(Math.random);
}

/** clip(0.5 + 0.25 Z, 0, 1), the same distribution as backend sample_strength. */
export function strengthFromStandardNormal(z: number): number {
  return clip01(0.5 + 0.25 * z);
}

export function sampleHiddenStrength(random: () => number = Math.random): number {
  return strengthFromStandardNormal(sampleStandardNormalFrom(random));
}

function sampleStandardNormalFrom(random: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type FlightMarket = {
  seed: number;
  strength: number;
  uniforms: number[];
};

/** One hidden market and one uniform per selling period, shared across strategies.
 * An explicit strength is used as given. Only the default path draws one from the seed.
 */
export function createFlightMarket(
  seed: number,
  periods = 10,
  strength?: number,
): FlightMarket {
  const random = mulberry32(seed);
  const resolved = strength === undefined ? sampleHiddenStrength(random) : clip01(strength);
  const uniforms = Array.from({ length: periods }, () => random());
  return { seed: seed >>> 0, strength: resolved, uniforms };
}

function mix(min: number, max: number, strength: number): number {
  return max * strength + min * (1 - strength);
}

export function trueMarketMean(
  fare: number,
  modelIndex: number,
  strength: number,
): number {
  const expectedFare = mix(expectedFareMin[modelIndex], expectedFareMax[modelIndex], strength);
  const expectedBookings = mix(
    expectedBookingsMin[modelIndex],
    expectedBookingsMax[modelIndex],
    strength,
  );
  const elasticity = mix(elasticityMin[modelIndex], elasticityMax[modelIndex], strength);
  const p = fare;
  const numerator =
    expectedBookings * (elasticity * (p - expectedFare) + (expectedFare + p));
  const denominator = p + expectedFare - elasticity * (p - expectedFare);
  if (denominator === 0) return 0;
  return Math.max(0, numerator / denominator);
}
