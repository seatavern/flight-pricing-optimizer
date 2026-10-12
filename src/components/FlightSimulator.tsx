"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Aircraft } from "@/components/Aircraft";
import { SimulatorModelStatus } from "@/components/SimulatorModelStatus";
import { DemandPanel } from "@/components/DemandPanel";
import { FareSelector } from "@/components/FareSelector";
import { FlightMetrics } from "@/components/FlightMetrics";
import { Header } from "@/components/Header";
import { SimulationControls } from "@/components/SimulationControls";
import { StrategySelector } from "@/components/StrategySelector";
import { Timeline } from "@/components/Timeline";
import { DEFAULT_FARE, FLIGHT, type Fare } from "@/lib/constants";
import {
  applyStrengthOnReset,
  createFlightMarket,
  INITIAL_MARKET_STRENGTH,
  initialStrengthSelection,
  isStrengthPending,
  randomizeStrength,
  strengthAfterStrategyChange,
  trueMarketMean,
  uiPeriodToModelIndex,
  type FlightMarket,
} from "@/lib/market";
import { samplePoisson } from "@/lib/poisson";
import { fetchMyopicDecision, fetchOptimizedDecision } from "@/lib/pricingApi";
import { SEAT_IDS_FRONT_TO_BACK } from "@/lib/seats";
import {
  applyPeriodRealization,
  emptyPeriodSnapshot,
  flightMetrics,
  realizedSales,
  stepViewIndex,
} from "@/lib/simulatorState";
import type { PeriodSnapshot, PricingStrategy } from "@/lib/types";
import { useDemandModel } from "@/lib/useDemandModel";

let activeStrength = INITIAL_MARKET_STRENGTH;
let activeMarket: FlightMarket | null = null;
const strengthListeners = new Set<() => void>();

function subscribeStrength(listener: () => void) {
  strengthListeners.add(listener);
  return () => {
    strengthListeners.delete(listener);
  };
}

function getActiveStrength() {
  return activeStrength;
}

function getServerStrength() {
  return INITIAL_MARKET_STRENGTH;
}

function notifyStrength() {
  strengthListeners.forEach((listener) => listener());
}

function flightSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

function ensureActiveMarket(): FlightMarket {
  if (activeMarket === null) {
    activeMarket = createFlightMarket(flightSeed(), 10, activeStrength);
  }
  return activeMarket;
}

function beginFlight(strength: number) {
  activeStrength = strength;
  activeMarket = createFlightMarket(flightSeed(), 10, strength);
  notifyStrength();
}

function lastOfferedFare(history: readonly PeriodSnapshot[], beforeIndex: number): number | null {
  for (let index = beforeIndex; index >= 0; index -= 1) {
    const fare = history[index]?.selectedFare;
    if (fare !== null && fare !== undefined) return fare;
  }
  return null;
}

function emptySnapshot(strategy: PricingStrategy): PeriodSnapshot {
  return emptyPeriodSnapshot(strategy);
}

function fareMetricLabel(strategy: PricingStrategy): string {
  if (strategy === "myopic") return "MYOPIC FARE";
  if (strategy === "optimized") return "OPTIMIZED FARE";
  return "FIXED FARE";
}

type RealizationPhase = "sampling" | "reveal" | "consequences" | "hold";

type PeriodRealization = {
  phase: RealizationPhase;
  booked: number;
  fromSold: number;
  toSold: number;
  fromRemaining: number;
  toRemaining: number;
  fromLoadFactor: number;
  toLoadFactor: number;
  fromRevenue: number;
  toRevenue: number;
  revenueDelta: number;
  fromOccupied: string[];
  newSeatIds: string[];
  occupiedShown: string[];
  nextViewIndex: number;
  reducedMotion: boolean;
};

const REALIZATION_MS = {
  sampling: 450,
  reveal: 220,
  consequences: 560,
  hold: 380,
  reducedHold: 480,
} as const;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function formatMetricValue(value: number, money = false, suffix = "") {
  return `${money ? "$" : ""}${value}${suffix}`;
}

function metricDisplay(
  realization: PeriodRealization | null,
  from: number,
  to: number,
  current: number,
  money = false,
  suffix = "",
) {
  if (!realization) return formatMetricValue(current, money, suffix);
  if (realization.phase === "sampling" || realization.phase === "reveal") {
    return formatMetricValue(from, money, suffix);
  }
  return formatMetricValue(to, money, suffix);
}

function samplePeriodDemand(mu: number, modelIndex: number) {
  const uniform = ensureActiveMarket().uniforms[modelIndex] ?? Math.random();
  return samplePoisson(mu, uniform);
}

export function FlightSimulator() {
  const [strategy, setStrategy] = useState<PricingStrategy>("fixed");
  const [selectedStrength, setSelectedStrength] = useState(initialStrengthSelection().selected);
  const strength = useSyncExternalStore(subscribeStrength, getActiveStrength, getServerStrength);
  const [history, setHistory] = useState<PeriodSnapshot[]>(() => [emptySnapshot("fixed")]);
  const [viewIndex, setViewIndex] = useState(0);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [realization, setRealization] = useState<PeriodRealization | null>(null);
  const realizingRef = useRef(false);
  const [lastShownDemand, setLastShownDemand] = useState({
    trueMarketMean: null as number | null,
    mlPredictedMean: null as number | null,
    selectedFare: DEFAULT_FARE as number | null,
    soldOut: false,
    fareKind: "fixed" as PricingStrategy,
    showMlMean: false,
    realizedBookings: null as number | null,
  });
  const demandModel = useDemandModel();

  useEffect(() => {
    ensureActiveMarket();
    notifyStrength();
  }, []);

  const snapshot = history[viewIndex] ?? emptySnapshot(strategy);
  const latestIndex = history.length - 1;
  const isAtLiveEdge = viewIndex === latestIndex;
  const { seatsSold, remaining, loadFactor } = flightMetrics(snapshot);
  const modelIndex = uiPeriodToModelIndex(snapshot.period);
  const modelReady = demandModel.status.status === "ready";
  const liveSoldOut = isAtLiveEdge && remaining === 0 && snapshot.realizedBookings === null;
  const referenceFare =
    snapshot.selectedFare ??
    (remaining === 0 ? lastOfferedFare(history, viewIndex - 1) : null);
  const liveTrueMean =
    modelIndex === null || strength === null || referenceFare === null
      ? null
      : trueMarketMean(referenceFare, modelIndex, strength);
  const displayTrueMean = snapshot.trueMarketMean ?? liveTrueMean;
  const occupiedSet = new Set(snapshot.occupiedSeatIds);

  const livePeriod = history[latestIndex]?.period ?? snapshot.period;
  const isRealizing = realization !== null;
  const canGoPrevious = viewIndex > 0 && !isRealizing;
  const canGoNext = viewIndex < latestIndex && !isRealizing;
  const canSimulate =
    !isRealizing &&
    isAtLiveEdge &&
    snapshot.period > 0 &&
    snapshot.realizedBookings === null &&
    strength !== null &&
    (snapshot.selectedFare !== null || liveSoldOut);

  const needsLiveDecision =
    (strategy === "myopic" || strategy === "optimized") &&
    modelReady &&
    isAtLiveEdge &&
    snapshot.period > 0 &&
    snapshot.selectedFare === null &&
    snapshot.mlPredictedMean === null &&
    modelIndex !== null;

  useEffect(() => {
    if (!needsLiveDecision || modelIndex === null) return;
    let cancelled = false;
    const request =
      strategy === "optimized"
        ? fetchOptimizedDecision(modelIndex, seatsSold)
        : fetchMyopicDecision(modelIndex, seatsSold);
    request
      .then((decision) => {
        if (cancelled) return;
        setPricingError(null);
        const offeredFare = decision.selected_fare;
        const fareForMean =
          offeredFare ?? lastOfferedFare(history, history.length - 1);
        const matched = decision.candidates.find((candidate) => candidate.fare === fareForMean);
        const predictedMu =
          offeredFare !== null ? (decision.predicted_mu ?? matched?.predicted_mu ?? 0) : (matched?.predicted_mu ?? 0);
        const trueMu =
          strength === null || fareForMean === null
            ? null
            : trueMarketMean(fareForMean, modelIndex, strength);
        const optimizedValues =
          strategy === "optimized" && "total_value" in decision
            ? {
                immediateExpectedRevenue: decision.immediate_expected_revenue,
                futureValue: decision.future_value,
                totalValue: decision.total_value,
              }
            : {
                immediateExpectedRevenue: null,
                futureValue: null,
                totalValue: null,
              };
        setHistory((current) => {
          const live = current[current.length - 1];
          if (
            !live ||
            live.selectedFare !== null ||
            live.mlPredictedMean !== null ||
            live.period !== snapshot.period
          ) {
            return current;
          }
          return [
            ...current.slice(0, -1),
            {
              ...live,
              selectedFare: offeredFare,
              fareKind: strategy,
              mlPredictedMean: predictedMu,
              trueMarketMean: trueMu,
              ...optimizedValues,
            },
          ];
        });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setPricingError(
          caught instanceof Error
            ? caught.message
            : strategy === "optimized"
              ? "Optimized pricing failed."
              : "Myopic pricing failed.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [needsLiveDecision, strategy, modelIndex, seatsSold, snapshot.period, strength, history]);

  useEffect(() => {
    const phase = realization?.phase;
    const reducedMotion = realization?.reducedMotion ?? false;
    const nextViewIndex = realization?.nextViewIndex;
    if (phase == null || nextViewIndex == null) return;
    const timers: number[] = [];

    if (reducedMotion) {
      timers.push(
        window.setTimeout(() => {
          realizingRef.current = false;
          setViewIndex(nextViewIndex);
          setRealization(null);
        }, REALIZATION_MS.reducedHold),
      );
      return () => timers.forEach((id) => window.clearTimeout(id));
    }

    if (phase === "sampling") {
      timers.push(
        window.setTimeout(() => {
          setRealization((current) => (current ? { ...current, phase: "reveal" } : current));
        }, REALIZATION_MS.sampling),
      );
    } else if (phase === "reveal") {
      timers.push(
        window.setTimeout(() => {
          setRealization((current) => (current ? { ...current, phase: "consequences" } : current));
        }, REALIZATION_MS.reveal),
      );
    } else if (phase === "consequences") {
      timers.push(
        window.setTimeout(() => {
          setRealization((current) =>
            current
              ? {
                  ...current,
                  phase: "hold",
                  occupiedShown: [...current.fromOccupied, ...current.newSeatIds],
                }
              : current,
          );
        }, REALIZATION_MS.consequences),
      );
    } else {
      timers.push(
        window.setTimeout(() => {
          realizingRef.current = false;
          setViewIndex(nextViewIndex);
          setRealization(null);
        }, REALIZATION_MS.hold),
      );
    }

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [realization?.phase, realization?.reducedMotion, realization?.nextViewIndex]);

  useEffect(() => {
    const phase = realization?.phase;
    const reducedMotion = realization?.reducedMotion ?? false;
    const fromOccupied = realization?.fromOccupied;
    const newSeatIds = realization?.newSeatIds;
    if (phase !== "consequences" || reducedMotion || !fromOccupied || !newSeatIds) {
      return;
    }
    const start = performance.now();
    const duration = 520;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const count = Math.round(easeOutCubic(t) * newSeatIds.length);
      const occupiedShown = fromOccupied.concat(newSeatIds.slice(0, count));
      setRealization((current) => {
        if (!current || current.phase !== "consequences") return current;
        if (
          current.occupiedShown.length === occupiedShown.length &&
          current.occupiedShown[current.occupiedShown.length - 1] ===
            occupiedShown[occupiedShown.length - 1]
        ) {
          return current;
        }
        return { ...current, occupiedShown };
      });
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    realization?.phase,
    realization?.reducedMotion,
    realization?.fromOccupied,
    realization?.newSeatIds,
  ]);

  useEffect(() => {
    return () => {
      realizingRef.current = false;
    };
  }, []);

  function handleSimulate() {
    if (!canSimulate || realizingRef.current) return;
    if (!liveSoldOut && snapshot.selectedFare === null) return;
    const fare = liveSoldOut ? null : snapshot.selectedFare;
    const mu = displayTrueMean;
    if (mu === null && !liveSoldOut) return;

    const demand =
      mu === null || modelIndex === null ? 0 : samplePeriodDemand(mu, modelIndex);
    const booked = realizedSales(demand, remaining);
    const nextOccupied = [
      ...snapshot.occupiedSeatIds,
      ...SEAT_IDS_FRONT_TO_BACK.map((seat) => seat.id)
        .filter((id) => !occupiedSet.has(id))
        .slice(0, booked),
    ];

    const result = applyPeriodRealization({
      history,
      viewIndex,
      booked,
      fare,
      nextOccupiedSeatIds: nextOccupied,
      strategy,
      trueMarketMean: mu,
    });
    if (result.history.length === history.length) return;

    const recorded = result.history[viewIndex];
    if (!recorded || recorded.realizedBookings === null) return;

    realizingRef.current = true;
    const reducedMotion = prefersReducedMotion();
    const fromOccupied = [...snapshot.occupiedSeatIds];
    const occupiedAfter = recorded.occupiedSeatIds;
    const newSeatIds = occupiedAfter.filter((id) => !occupiedSet.has(id));
    const toSold = occupiedAfter.length;
    const toRemaining = FLIGHT.capacity - toSold;
    setHistory(result.history);
    setRealization({
      phase: reducedMotion ? "hold" : "sampling",
      booked: recorded.realizedBookings,
      fromSold: seatsSold,
      toSold,
      fromRemaining: remaining,
      toRemaining,
      fromLoadFactor: loadFactor,
      toLoadFactor: Math.round((toSold / FLIGHT.capacity) * 100),
      fromRevenue: snapshot.revenue,
      toRevenue: recorded.revenue,
      revenueDelta: recorded.revenue - snapshot.revenue,
      fromOccupied,
      newSeatIds,
      occupiedShown: reducedMotion ? [...occupiedAfter] : fromOccupied,
      nextViewIndex: result.viewIndex,
      reducedMotion,
    });
  }

  function handleRandomizeStrength() {
    setSelectedStrength((current) => randomizeStrength({ selected: current, active: activeStrength }).selected);
  }

  function handleReset() {
    if (realizingRef.current) return;
    realizingRef.current = false;
    const applied = applyStrengthOnReset({ selected: selectedStrength, active: activeStrength });
    setRealization(null);
    setStrategy("fixed");
    setPricingError(null);
    beginFlight(applied.active);
    setHistory([emptySnapshot("fixed")]);
    setViewIndex(0);
  }

  function handleStrategyChange(next: PricingStrategy) {
    if (next === strategy || realizingRef.current) return;
    const kept = strengthAfterStrategyChange({ selected: selectedStrength, active: activeStrength });
    setRealization(null);
    setStrategy(next);
    setPricingError(null);
    if (kept.active !== activeStrength) beginFlight(kept.active);
    setHistory([emptySnapshot(next)]);
    setViewIndex(0);
  }

  function handleFareChange(fare: Fare) {
    if (realizingRef.current || !isAtLiveEdge || strategy !== "fixed") return;
    setHistory((current) => {
      const live = current[current.length - 1];
      if (!live) return current;
      return [
        ...current.slice(0, -1),
        {
          ...live,
          selectedFare: fare,
          trueMarketMean: null,
        },
      ];
    });
  }

  const sampling = realization?.phase === "sampling";
  const displayOccupied = realization ? realization.occupiedShown : snapshot.occupiedSeatIds;
  const displayRealized = sampling
    ? null
    : realization
      ? realization.booked
      : snapshot.realizedBookings;
  const showMetricDeltas =
    realization !== null &&
    (realization.phase === "consequences" || realization.phase === "hold");
  const currentDemand = {
    trueMarketMean: displayTrueMean,
    mlPredictedMean: snapshot.mlPredictedMean,
    selectedFare: (liveSoldOut ? null : snapshot.selectedFare) as number | null,
    soldOut: liveSoldOut || (snapshot.selectedFare === null && remaining === 0),
    fareKind: snapshot.fareKind,
    showMlMean:
      (snapshot.fareKind === "myopic" || snapshot.fareKind === "optimized") && modelReady,
    realizedBookings: displayRealized,
  };
  // Preserve the previous display while the next pricing decision is loading.
  // Only update when its values change, so this converges after one render.
  if (!needsLiveDecision && (
    !Object.is(currentDemand.trueMarketMean, lastShownDemand.trueMarketMean) ||
    !Object.is(currentDemand.mlPredictedMean, lastShownDemand.mlPredictedMean) ||
    currentDemand.selectedFare !== lastShownDemand.selectedFare ||
    currentDemand.soldOut !== lastShownDemand.soldOut ||
    currentDemand.fareKind !== lastShownDemand.fareKind ||
    currentDemand.showMlMean !== lastShownDemand.showMlMean ||
    currentDemand.realizedBookings !== lastShownDemand.realizedBookings
  )) {
    setLastShownDemand(currentDemand);
  }
  const shownDemand = needsLiveDecision ? lastShownDemand : currentDemand;

  return (
    <div className="min-h-full bg-page px-6 py-2.5 lg:px-10 lg:py-3">
      <Header
        marketStrength={selectedStrength}
        strengthPending={isStrengthPending({ selected: selectedStrength, active: strength })}
        onRandomizeStrength={handleRandomizeStrength}
      />

      <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between xl:gap-8">
        <FlightMetrics
          period={snapshot.period}
          seatsSold={metricDisplay(
            realization,
            realization?.fromSold ?? seatsSold,
            realization?.toSold ?? seatsSold,
            seatsSold,
          )}
          remaining={metricDisplay(
            realization,
            realization?.fromRemaining ?? remaining,
            realization?.toRemaining ?? remaining,
            remaining,
          )}
          loadFactor={metricDisplay(
            realization,
            realization?.fromLoadFactor ?? loadFactor,
            realization?.toLoadFactor ?? loadFactor,
            loadFactor,
            false,
            "%",
          )}
          revenue={metricDisplay(
            realization,
            realization?.fromRevenue ?? snapshot.revenue,
            realization?.toRevenue ?? snapshot.revenue,
            snapshot.revenue,
            true,
          )}
          selectedFare={shownDemand.selectedFare}
          soldOut={shownDemand.soldOut}
          fareLabel={fareMetricLabel(shownDemand.fareKind)}
          seatsSoldDelta={
            showMetricDeltas && realization
              ? realization.toSold - realization.fromSold
              : null
          }
          remainingDelta={
            showMetricDeltas && realization
              ? realization.toRemaining - realization.fromRemaining
              : null
          }
          loadFactorDelta={
            showMetricDeltas && realization
              ? realization.toLoadFactor - realization.fromLoadFactor
              : null
          }
          revenueDelta={showMetricDeltas && realization ? realization.revenueDelta : null}
        />
        <SimulationControls
          period={snapshot.period}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          canSimulate={canSimulate}
          canReset={!isRealizing}
          onPrevious={() => setViewIndex((index) => stepViewIndex(index, latestIndex, -1))}
          onSimulate={handleSimulate}
          onNext={() => setViewIndex((index) => stepViewIndex(index, latestIndex, 1))}
          onReset={handleReset}
        />
      </div>

      <div className="mt-2">
        <Aircraft
          occupiedSeatIds={displayOccupied}
          animateOccupancy={isRealizing && !realization.reducedMotion}
        />
      </div>

      <div className="mt-2">
        <Timeline currentPeriod={snapshot.period} livePeriod={livePeriod} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-8 border-t border-line pt-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <StrategySelector
            strategy={strategy}
            onChange={handleStrategyChange}
            disabled={isRealizing}
          />
          {strategy === "fixed" ? (
            <FareSelector
              period={snapshot.period}
              selectedFare={(snapshot.selectedFare ?? DEFAULT_FARE) as Fare}
              onChange={handleFareChange}
              disabled={isRealizing || liveSoldOut}
            />
          ) : null}
          <SimulatorModelStatus
            strategy={strategy}
            status={demandModel.status}
            error={pricingError ?? demandModel.error}
            optimizedFare={strategy === "optimized" ? snapshot.selectedFare : null}
            soldOut={strategy === "optimized" && (liveSoldOut || (snapshot.selectedFare === null && remaining === 0 && snapshot.mlPredictedMean !== null))}
            immediateExpectedRevenue={snapshot.immediateExpectedRevenue}
            futureValue={snapshot.futureValue}
            totalValue={snapshot.totalValue}
          />
        </div>
        <DemandPanel
          period={snapshot.period}
          trueMarketMean={shownDemand.trueMarketMean}
          mlPredictedMean={shownDemand.mlPredictedMean}
          selectedFare={shownDemand.selectedFare}
          soldOut={shownDemand.soldOut}
          fareKind={shownDemand.fareKind}
          realizedBookings={shownDemand.realizedBookings}
          sampling={sampling}
          showMlMean={shownDemand.showMlMean}
        />
      </div>
    </div>
  );
}
