import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedRealizedSales,
  poissonCappedPmfs,
  realizedSalesPmf,
  samplePoisson,
} from "./poisson.ts";

const SCIPY_PPF: Array<[number, number, number]> = [
  [0.4, 0.2, 0],
  [0.4, 0.9, 1],
  [8, 0.1, 5],
  [8, 0.5, 8],
  [8, 0.99, 15],
  [47.5, 0.5, 47],
  [47.5, 0.99, 64],
  [60, 0.5, 60],
  [60, 0.99, 79],
  [77, 0.999, 105],
];

test("inverse-CDF Poisson sampler matches scipy and is not capped at 40", () => {
  for (const [lambda, uniform, expected] of SCIPY_PPF) {
    assert.equal(samplePoisson(lambda, uniform), expected);
  }
  assert.ok(samplePoisson(60, 0.99) > 40);
  assert.ok(samplePoisson(77, 0.999) > 40);
});

test("quantile grid recovers low, moderate, and high Poisson means", () => {
  for (const lambda of [0.4, 8, 60]) {
    let mean = 0;
    const steps = 2000;
    for (let index = 1; index < steps; index += 1) {
      mean += samplePoisson(lambda, index / steps);
    }
    mean /= steps - 1;
    assert.ok(Math.abs(mean - lambda) < 0.35, `mean ${mean} for lambda ${lambda}`);
  }
});

test("realized-sales distributions put the Poisson tail on remaining capacity", () => {
  for (const [lambda, remaining] of [
    [0.4, 3],
    [8, 5],
    [60, 40],
  ] as const) {
    const pmf = realizedSalesPmf(lambda, remaining);
    assert.equal(pmf.length, remaining + 1);
    const total = pmf.reduce((sum, probability) => sum + probability, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    const head = poissonCappedPmfs(lambda, remaining).slice(0, remaining);
    const headMass = head.reduce((sum, probability) => sum + probability, 0);
    assert.ok(Math.abs(pmf[remaining] - (1 - headMass)) < 1e-12);
    assert.ok(pmf[remaining] > poissonPmfAt(lambda, remaining));
  }
});

test("zero remaining capacity puts all realized-sales probability on zero", () => {
  for (const lambda of [0.4, 8, 47.5, 77]) {
    assert.deepEqual(realizedSalesPmf(lambda, 0), [1]);
    assert.equal(expectedRealizedSales(lambda, 0), 0);
  }
});

test("abundant capacity makes expected realized sales approach latent demand", () => {
  for (const lambda of [0.4, 8, 47.5]) {
    const expected = expectedRealizedSales(lambda, 400);
    assert.ok(Math.abs(expected - lambda) < 1e-6, `${expected} vs ${lambda}`);
  }
});

function poissonPmfAt(lambda: number, k: number): number {
  let probability = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) probability *= lambda / i;
  return probability;
}
