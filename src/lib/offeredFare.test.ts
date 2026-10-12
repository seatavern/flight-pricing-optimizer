import assert from "node:assert/strict";
import test from "node:test";
import { offeredFareLabel } from "./offeredFare.ts";

test("a sold-out flight does not display an actionable fare", () => {
  assert.equal(offeredFareLabel(50, true), "SOLD OUT");
  assert.equal(offeredFareLabel(null, true), "SOLD OUT");
  assert.equal(offeredFareLabel(null, false), "—");
  assert.equal(offeredFareLabel(120, false), "$120");
});
