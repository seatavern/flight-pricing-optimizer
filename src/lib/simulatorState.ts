import { DEFAULT_FARE, FLIGHT } from "./constants";
import type { PeriodSnapshot, PricingStrategy } from "./types";

export type SimulatorMetrics = {
  seatsSold: number;
  remaining: number;
  loadFactor: number;
  revenue: number;
  realizedBookings: number | null;
};

export function emptyPeriodSnapshot(
  strategy: PricingStrategy,
  period: number = FLIGHT.openingPeriod,
): PeriodSnapshot {
  return {
    period,
    occupiedSeatIds: [],
    revenue: 0,
    realizedBookings: null,
    selectedFare: strategy === "fixed" ? DEFAULT_FARE : null,
    fareKind: strategy,
    trueMarketMean: null,
    mlPredictedMean: null,
    immediateExpectedRevenue: null,
    futureValue: null,
    totalValue: null,
  };
}

export function flightMetrics(snapshot: PeriodSnapshot): SimulatorMetrics {
  const seatsSold = snapshot.occupiedSeatIds.length;
  return {
    seatsSold,
    remaining: FLIGHT.capacity - seatsSold,
    loadFactor: Math.round((seatsSold / FLIGHT.capacity) * 100),
    revenue: snapshot.revenue,
    realizedBookings: snapshot.realizedBookings,
  };
}

export function realizedSales(latentDemand: number, remainingCapacity: number): number {
  if (remainingCapacity <= 0 || latentDemand <= 0) return 0;
  return Math.min(latentDemand, remainingCapacity);
}

export function revenueAfterRealization(
  revenueBefore: number,
  fare: number,
  realizedSalesCount: number,
): number {
  return revenueBefore + fare * realizedSalesCount;
}

export function stepViewIndex(
  viewIndex: number,
  latestIndex: number,
  direction: -1 | 1,
): number {
  if (direction < 0) return Math.max(0, viewIndex - 1);
  return Math.min(latestIndex, viewIndex + 1);
}

export function applyPeriodRealization(input: {
  history: readonly PeriodSnapshot[];
  viewIndex: number;
  booked: number;
  fare: number;
  nextOccupiedSeatIds: readonly string[];
  strategy: PricingStrategy;
  trueMarketMean?: number | null;
}): { history: PeriodSnapshot[]; viewIndex: number } {
  const current = input.history[input.viewIndex];
  const atLiveEdge = input.viewIndex === input.history.length - 1;
  if (
    !current ||
    !atLiveEdge ||
    current.period <= 0 ||
    current.realizedBookings !== null ||
    current.selectedFare === null
  ) {
    return { history: input.history.map((row) => ({ ...row })), viewIndex: input.viewIndex };
  }

  const remaining = FLIGHT.capacity - current.occupiedSeatIds.length;
  const booked = realizedSales(input.booked, remaining);
  const occupiedSeatIds = input.nextOccupiedSeatIds.slice(0, current.occupiedSeatIds.length + booked);
  const revenue = revenueAfterRealization(current.revenue, input.fare, booked);

  const recorded: PeriodSnapshot = {
    ...current,
    occupiedSeatIds,
    revenue,
    realizedBookings: booked,
    selectedFare: input.fare,
    trueMarketMean: input.trueMarketMean ?? current.trueMarketMean,
  };

  const nextPeriod: PeriodSnapshot = {
    period: current.period - 1,
    occupiedSeatIds: [...occupiedSeatIds],
    revenue,
    realizedBookings: null,
    selectedFare: input.strategy === "fixed" ? input.fare : null,
    fareKind: input.strategy,
    trueMarketMean: null,
    mlPredictedMean: null,
    immediateExpectedRevenue: null,
    futureValue: null,
    totalValue: null,
  };

  return {
    history: [...input.history.slice(0, input.viewIndex), recorded, nextPeriod],
    viewIndex: input.viewIndex + 1,
  };
}
