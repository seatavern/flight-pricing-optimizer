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
import { sampleHiddenStrength, trueMarketMean, uiPeriodToModelIndex } from "@/lib/market";
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

let activeStrength: number | null = null;
let allowClientStrength = false;
const strengthListeners = new Set<() => void>();

function subscribeStrength(listener: () => void) {
  strengthListeners.add(listener);
  return () => {
    strengthListeners.delete(listener);
  };
}

function getActiveStrength() {
  return allowClientStrength ? activeStrength : null;
}

function getServerStrength() {
  return null;
}

function beginFlight() {
  allowClientStrength = true;
  activeStrength = sampleHiddenStrength();
  strengthListeners.forEach((listener) => listener());
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

function samplePeriodDemand(mu: number) {
  return samplePoisson(mu, Math.random());
}

export function FlightSimulator() {
  const [strategy, setStrategy] = useState<PricingStrategy>("fixed");
  const strength = useSyncExternalStore(subscribeStrength, getActiveStrength, getServerStrength);
  const [history, setHistory] = useState<PeriodSnapshot[]>(() => [emptySnapshot("fixed")]);
  const [viewIndex, setViewIndex] = useState(0);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [realization, setRealization] = useState<PeriodRealization | null>(null);
  const realizingRef = useRef(false);
  const demandModel = useDemandModel();

  useEffect(() => {
    allowClientStrength = true;
    if (activeStrength === null) {
      beginFlight();
      return;
    }
    strengthListeners.forEach((listener) => listener());
  }, []);

  const snapshot = history[viewIndex] ?? emptySnapshot(strategy);
  const latestIndex = history.length - 1;
  const isAtLiveEdge = viewIndex === latestIndex;
  const { seatsSold, remaining, loadFactor } = flightMetrics(snapshot);
  const modelIndex = uiPeriodToModelIndex(snapshot.period);
  const modelReady = demandModel.status.status === "ready";
  const liveTrueMean =
    modelIndex === null || strength === null || snapshot.selectedFare === null
      ? null
      : trueMarketMean(snapshot.selectedFare, modelIndex, strength);
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
    snapshot.selectedFare !== null;

  const needsLiveDecision =
    (strategy === "myopic" || strategy === "optimized") &&
    modelReady &&
    isAtLiveEdge &&
    snapshot.period > 0 &&
    snapshot.selectedFare === null &&
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
        const trueMu =
          strength === null ? null : trueMarketMean(decision.selected_fare, modelIndex, strength);
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
          if (!live || live.selectedFare !== null || live.period !== snapshot.period) {
            return current;
          }
          return [
            ...current.slice(0, -1),
            {
              ...live,
              selectedFare: decision.selected_fare,
              fareKind: strategy,
              mlPredictedMean: decision.predicted_mu,
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
  }, [needsLiveDecision, strategy, modelIndex, seatsSold, snapshot.period, strength]);

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
    if (!canSimulate || realizingRef.current || snapshot.selectedFare === null) return;
    const fare = snapshot.selectedFare;
    const mu = displayTrueMean;
    if (mu === null) return;

    const demand = samplePeriodDemand(mu);
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

  function handleReset() {
    if (realizingRef.current) return;
    realizingRef.current = false;
    setRealization(null);
    setStrategy("fixed");
    setPricingError(null);
    beginFlight();
    setHistory([emptySnapshot("fixed")]);
    setViewIndex(0);
  }

  function handleStrategyChange(next: PricingStrategy) {
    if (next === strategy || realizingRef.current) return;
    setRealization(null);
    setStrategy(next);
    setPricingError(null);
    beginFlight();
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

  return (
    <div className="min-h-full bg-page px-6 py-3 lg:px-10 lg:py-3.5">
      <Header />

      <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between xl:gap-8">
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
          selectedFare={snapshot.selectedFare}
          fareLabel={fareMetricLabel(snapshot.fareKind)}
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

      <div className="mt-3">
        <Aircraft
          occupiedSeatIds={displayOccupied}
          animateOccupancy={isRealizing && !realization.reducedMotion}
        />
      </div>

      <div className="mt-3">
        <Timeline currentPeriod={snapshot.period} livePeriod={livePeriod} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-8 border-t border-line pt-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
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
              disabled={isRealizing}
            />
          ) : null}
          <SimulatorModelStatus
            strategy={strategy}
            status={demandModel.status}
            error={pricingError ?? demandModel.error}
            optimizedFare={strategy === "optimized" ? snapshot.selectedFare : null}
            immediateExpectedRevenue={snapshot.immediateExpectedRevenue}
            futureValue={snapshot.futureValue}
            totalValue={snapshot.totalValue}
          />
        </div>
        <DemandPanel
          period={snapshot.period}
          trueMarketMean={displayTrueMean}
          mlPredictedMean={snapshot.mlPredictedMean}
          selectedFare={snapshot.selectedFare}
          fareKind={snapshot.fareKind}
          realizedBookings={displayRealized}
          sampling={sampling}
          showMlMean={(snapshot.fareKind === "myopic" || snapshot.fareKind === "optimized") && modelReady}
        />
      </div>
    </div>
  );
}
