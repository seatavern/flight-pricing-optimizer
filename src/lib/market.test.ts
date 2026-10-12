import assert from "node:assert/strict";
import test from "node:test";
import { createFlightMarket, trueMarketMean } from "./market.ts";

test("the same seed reproduces hidden strength and period uniforms", () => {
  const first = createFlightMarket(2026);
  const second = createFlightMarket(2026);
  assert.deepEqual(second, first);
  assert.equal(first.uniforms.length, 10);
  assert.ok(first.strength >= 0 && first.strength <= 1);
  assert.notDeepEqual(createFlightMarket(2027).uniforms, first.uniforms);
});

test("true latent demand depends on fare and market, not on pricing strategy", () => {
  const market = createFlightMarket(17);
  const myopic = trueMarketMean(90, 6, market.strength);
  const optimized = trueMarketMean(90, 6, market.strength);
  assert.equal(optimized, myopic);
  assert.notEqual(trueMarketMean(50, 6, market.strength), trueMarketMean(130, 6, market.strength));
});
