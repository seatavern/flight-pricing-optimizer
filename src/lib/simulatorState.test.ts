import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLIGHT } from "./constants";
import {
  applyPeriodRealization,
  emptyPeriodSnapshot,
  flightMetrics,
  realizedSales,
  revenueAfterRealization,
  stepViewIndex,
} from "./simulatorState";
import type { PeriodSnapshot, PricingStrategy } from "./types";

function seats(count: number, prefix = "s"): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function snapshot(overrides: Partial<PeriodSnapshot> = {}): PeriodSnapshot {
  return {
    ...emptyPeriodSnapshot("fixed", 9),
    selectedFare: 100,
    ...overrides,
  };
}

function realize(
  history: PeriodSnapshot[],
  viewIndex: number,
  booked: number,
  strategy: PricingStrategy = "fixed",
  fare = 100,
) {
  const current = history[viewIndex];
  const remaining = FLIGHT.capacity - current.occupiedSeatIds.length;
  const sales = realizedSales(booked, remaining);
  return applyPeriodRealization({
    history,
    viewIndex,
    booked,
    fare,
    nextOccupiedSeatIds: [...current.occupiedSeatIds, ...seats(sales, `p${current.period}-`)],
    strategy,
  });
}

describe("start of period", () => {
  it("hides realized bookings and shows the entering state", () => {
    const entering = snapshot({ occupiedSeatIds: [], revenue: 0, realizedBookings: null });
    const metrics = flightMetrics(entering);
    assert.equal(metrics.realizedBookings, null);
    assert.equal(metrics.seatsSold, 0);
    assert.equal(metrics.remaining, 100);
    assert.equal(metrics.loadFactor, 0);
    assert.equal(metrics.revenue, 0);
  });
});

describe("after simulation", () => {
  it("updates the completed period and jumps to the next period", () => {
    const start = [snapshot({ period: 9, selectedFare: 100 })];
    const result = realize(start, 0, 3);
    assert.equal(result.viewIndex, 1);
    assert.equal(result.history[0].period, 9);
    assert.equal(result.history[1].period, 8);
    const completed = flightMetrics(result.history[0]);
    assert.equal(completed.realizedBookings, 3);
    assert.equal(completed.seatsSold, 3);
    assert.equal(completed.remaining, 97);
    assert.equal(completed.loadFactor, 3);
    assert.equal(completed.revenue, 300);
    const next = flightMetrics(result.history[1]);
    assert.equal(next.realizedBookings, null);
    assert.equal(next.seatsSold, 3);
    assert.equal(next.revenue, 300);
  });
});

describe("revenue identity", () => {
  it("adds fare times realized sales once", () => {
    const before = 0;
    const after = revenueAfterRealization(before, 100, 3);
    assert.equal(after, 300);
    const result = realize([snapshot({ period: 9, revenue: before, selectedFare: 100 })], 0, 3);
    assert.equal(result.history[0].revenue, after);
  });
});

describe("capacity truncation", () => {
  it("uses capped realized sales for occupancy and revenue", () => {
    assert.equal(realizedSales(50, 2), 2);
    const start = [
      snapshot({
        period: 1,
        occupiedSeatIds: seats(98),
        revenue: 9800,
        selectedFare: 100,
      }),
    ];
    const result = realize(start, 0, 50);
    const metrics = flightMetrics(result.history[0]);
    assert.equal(metrics.realizedBookings, 2);
    assert.equal(metrics.seatsSold, 100);
    assert.equal(metrics.remaining, 0);
    assert.equal(metrics.revenue, 10000);
    assert.ok(metrics.seatsSold <= FLIGHT.capacity);
  });
});

describe("navigation", () => {
  it("does not generate bookings, revenue, or resample demand", () => {
    const realized = realize([snapshot({ period: 9, selectedFare: 100 })], 0, 3);
    const frozen = structuredClone(realized.history);
    const previous = stepViewIndex(realized.viewIndex, frozen.length - 1, -1);
    const next = stepViewIndex(realized.viewIndex, frozen.length - 1, 1);
    const back = stepViewIndex(previous, frozen.length - 1, 1);
    assert.equal(realized.viewIndex, 1);
    assert.equal(previous, 0);
    assert.equal(next, 1);
    assert.equal(back, 1);
    assert.deepEqual(realized.history, frozen);
    assert.equal(flightMetrics(realized.history[0]).revenue, 300);
    assert.equal(realized.history[0].realizedBookings, 3);
    assert.equal(realized.history[1].realizedBookings, null);
  });
});

describe("no double counting", () => {
  it("does not apply T-9 revenue again when moving to T-8 or re-applying T-9", () => {
    const afterT9 = realize([snapshot({ period: 9, selectedFare: 100 })], 0, 3);
    const t8Index = afterT9.viewIndex;
    assert.equal(t8Index, 1);
    assert.equal(flightMetrics(afterT9.history[t8Index]).revenue, 300);
    assert.equal(flightMetrics(afterT9.history[t8Index]).seatsSold, 3);
    const ignored = applyPeriodRealization({
      history: afterT9.history,
      viewIndex: 0,
      booked: 3,
      fare: 100,
      nextOccupiedSeatIds: afterT9.history[0].occupiedSeatIds,
      strategy: "fixed",
    });
    assert.equal(flightMetrics(ignored.history[0]).revenue, 300);
    const afterT8 = realize(afterT9.history, t8Index, 1, "fixed", 100);
    assert.equal(flightMetrics(afterT8.history[1]).revenue, 400);
    assert.equal(flightMetrics(afterT8.history[0]).revenue, 300);
  });
});

describe("historical completed period", () => {
  it("restores stored post-realization metrics", () => {
    const afterT9 = realize([snapshot({ period: 9, selectedFare: 100 })], 0, 3);
    const afterT8 = realize(afterT9.history, afterT9.viewIndex, 4, "fixed", 80);
    const backToT9 = stepViewIndex(
      stepViewIndex(afterT8.viewIndex, afterT8.history.length - 1, -1),
      afterT8.history.length - 1,
      -1,
    );
    const historical = flightMetrics(afterT8.history[backToT9]);
    assert.equal(afterT8.history[backToT9].period, 9);
    assert.equal(historical.realizedBookings, 3);
    assert.equal(historical.seatsSold, 3);
    assert.equal(historical.remaining, 97);
    assert.equal(historical.loadFactor, 3);
    assert.equal(historical.revenue, 300);
    assert.equal(afterT8.history[backToT9].selectedFare, 100);
  });
});

describe("strategies", () => {
  for (const strategy of ["fixed", "myopic", "optimized"] as const) {
    it(`${strategy} applies the selected fare once and keeps navigation inspect-only`, () => {
      const start = [
        snapshot({
          period: 9,
          selectedFare: strategy === "fixed" ? 100 : 70,
          fareKind: strategy,
        }),
      ];
      const fare = start[0].selectedFare ?? 70;
      const result = realize(start, 0, 3, strategy, fare);
      const metrics = flightMetrics(result.history[0]);
      assert.equal(metrics.realizedBookings, 3);
      assert.equal(metrics.revenue, fare * 3);
      assert.equal(result.history[1].revenue, metrics.revenue);
      assert.equal(result.history[1].selectedFare, strategy === "fixed" ? fare : null);
      const next = stepViewIndex(result.viewIndex, result.history.length - 1, 1);
      const previous = stepViewIndex(next, result.history.length - 1, -1);
      assert.equal(flightMetrics(result.history[previous]).revenue, fare * 3);
    });
  }
});

describe("departure", () => {
  it("equals the final post-T-1 state and does not add demand", () => {
    const start = [
      snapshot({
        period: 1,
        occupiedSeatIds: seats(10),
        revenue: 1000,
        selectedFare: 100,
      }),
    ];
    const afterT1 = realize(start, 0, 3);
    const t1 = flightMetrics(afterT1.history[0]);
    const departureIndex = afterT1.viewIndex;
    const departure = afterT1.history[departureIndex];
    assert.equal(departure.period, 0);
    assert.equal(departure.realizedBookings, null);
    assert.deepEqual(flightMetrics(departure), {
      seatsSold: t1.seatsSold,
      remaining: t1.remaining,
      loadFactor: t1.loadFactor,
      revenue: t1.revenue,
      realizedBookings: null,
    });
    const ignored = applyPeriodRealization({
      history: afterT1.history,
      viewIndex: departureIndex,
      booked: 9,
      fare: 100,
      nextOccupiedSeatIds: seats(99),
      strategy: "fixed",
    });
    assert.equal(flightMetrics(ignored.history[departureIndex]).revenue, t1.revenue);
    assert.equal(ignored.history[departureIndex].realizedBookings, null);
  });
});
