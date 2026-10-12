import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStrengthOnReset,
  createFlightMarket,
  initialStrengthSelection,
  isStrengthPending,
  randomizeStrength,
  strengthAfterStrategyChange,
  strengthFromStandardNormal,
  trueMarketMean,
} from "./market.ts";
import { mulberry32 } from "./poisson.ts";

test("the application starts with strength exactly 0.50", () => {
  const selection = initialStrengthSelection();
  assert.equal(selection.selected, 0.5);
  assert.equal(selection.active, 0.5);
  assert.equal(isStrengthPending(selection), false);
  assert.equal(createFlightMarket(1, 10, selection.active).strength, 0.5);
});

test("randomize follows the clipped normal and leaves the active flight unchanged", () => {
  const random = mulberry32(11);
  const draws: number[] = [];
  const recorded = () => {
    const value = random();
    draws.push(value);
    return value;
  };
  const next = randomizeStrength(initialStrengthSelection(), recorded);
  const z = Math.sqrt(-2 * Math.log(draws[0])) * Math.cos(2 * Math.PI * draws[1]);
  assert.equal(next.selected, strengthFromStandardNormal(z));
  assert.equal(next.active, 0.5);
  assert.equal(isStrengthPending(next), true);
  assert.equal(strengthFromStandardNormal(0), 0.5);
  assert.equal(strengthFromStandardNormal(8), 1);
  assert.equal(strengthFromStandardNormal(-8), 0);
});

test("reset applies the selected strength and does not draw another one", () => {
  const pending = randomizeStrength(initialStrengthSelection(), mulberry32(4));
  const applied = applyStrengthOnReset(pending);
  assert.equal(applied.active, pending.selected);
  assert.equal(applied.selected, pending.selected);
  assert.equal(isStrengthPending(applied), false);
  assert.deepEqual(applyStrengthOnReset(applied), applied);
});

test("switching strategy and continuing a flight keep the active strength", () => {
  const pending = randomizeStrength(initialStrengthSelection(), mulberry32(9));
  const switched = strengthAfterStrategyChange(pending);
  assert.equal(switched.active, 0.5);
  assert.equal(switched.selected, pending.selected);
  assert.equal(isStrengthPending(switched), true);
  assert.deepEqual(strengthAfterStrategyChange(switched), switched);
});

test("the same strength, fare, and period produce the same latent demand for every strategy", () => {
  const strength = 0.5;
  const fixed = createFlightMarket(42, 10, strength);
  const myopic = createFlightMarket(42, 10, strength);
  const optimized = createFlightMarket(42, 10, 0.73);
  assert.equal(fixed.strength, 0.5);
  assert.deepEqual(myopic.uniforms, fixed.uniforms);
  assert.deepEqual(optimized.uniforms, fixed.uniforms);
  assert.equal(trueMarketMean(100, 0, fixed.strength), trueMarketMean(100, 0, myopic.strength));
  assert.notEqual(trueMarketMean(100, 0, fixed.strength), trueMarketMean(100, 0, optimized.strength));
});
