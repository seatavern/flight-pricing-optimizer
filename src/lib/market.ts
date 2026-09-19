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

export function sampleStandardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function sampleHiddenStrength(): number {
  return clip01(sampleStandardNormal() / 4 + 0.5);
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
