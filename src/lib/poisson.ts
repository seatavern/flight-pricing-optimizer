export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0 || !Number.isInteger(k)) return 0;

  let probability = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) {
    probability *= lambda / i;
  }
  return probability;
}

export function poissonPmfs(lambda: number, maxK: number): number[] {
  const values: number[] = [];
  let probability = Math.exp(-lambda);
  values.push(probability);
  for (let k = 1; k <= maxK; k += 1) {
    probability *= lambda / k;
    values.push(probability);
  }
  return values;
}

function poissonSearchLimit(lambda: number): number {
  return Math.ceil(lambda + 32 * Math.sqrt(lambda) + 64);
}

export function poissonSupportMax(lambda: number, coverage = 0.999): number {
  if (!(lambda > 0) || !Number.isFinite(lambda)) return 0;
  let cdf = 0;
  let probability = Math.exp(-lambda);
  let k = 0;
  const limit = poissonSearchLimit(lambda);
  while (k < limit) {
    cdf += probability;
    if (cdf >= coverage) return k;
    k += 1;
    probability *= lambda / k;
    if (!Number.isFinite(probability) || probability === 0) return k;
  }
  return limit;
}

export function samplePoisson(lambda: number, unitRandom: number): number {
  if (!(lambda > 0) || !Number.isFinite(lambda)) return 0;
  const u = Math.min(Math.max(unitRandom, 0), 1 - 1e-16);
  let cdf = 0;
  let probability = Math.exp(-lambda);
  let k = 0;
  const limit = poissonSearchLimit(lambda);

  while (k < limit) {
    cdf += probability;
    if (u <= cdf) return k;
    k += 1;
    probability *= lambda / k;
    if (!Number.isFinite(probability) || probability === 0) return k;
  }

  return k;
}

export function poissonCappedPmfs(lambda: number, remaining: number): number[] {
  if (remaining <= 0) return [1];
  const head = poissonPmfs(lambda, remaining - 1);
  const mass = head.reduce((sum, value) => sum + value, 0);
  const tail = Math.max(0, 1 - mass);
  return [...head, tail];
}

/** Probability mass of Y = min(D, remaining) for latent D ~ Poisson(lambda). */
export function realizedSalesPmf(lambda: number, remaining: number): number[] {
  return poissonCappedPmfs(lambda, remaining);
}

/** E[min(D, remaining)] for latent D ~ Poisson(lambda). */
export function expectedRealizedSales(lambda: number, remaining: number): number {
  const pmf = realizedSalesPmf(lambda, remaining);
  return pmf.reduce((sum, probability, sales) => sum + probability * sales, 0);
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
