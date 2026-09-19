"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MlDemandChart } from "@/components/MlDemandChart";
import { UntrainedNotice } from "@/components/UntrainedNotice";
import {
  DEFAULT_EXPLORER_PERIOD,
  DEFAULT_EXPLORER_REMAINING,
  FARES,
  FLIGHT,
  type Fare,
} from "@/lib/constants";
import { fetchExplorerDecision, type ExplorerCandidate, type ExplorerDecision } from "@/lib/pricingApi";

const SELLING_PERIODS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

function uiToIndex(uiPeriod: number): number {
  return 10 - uiPeriod;
}

function indexToUi(periodIndex: number): number {
  return 10 - periodIndex;
}

function formatInt(value: number): string {
  const digits = String(Math.abs(value));
  const parts: string[] = [];
  for (let index = digits.length; index > 0; index -= 3) {
    parts.unshift(digits.slice(Math.max(0, index - 3), index));
  }
  return parts.join(",");
}

function money(value: number, signed = false): string {
  const rounded = Math.round(value);
  const abs = formatInt(rounded);
  if (rounded < 0) return `-$${abs}`;
  if (signed && rounded > 0) return `+$${abs}`;
  return `$${abs}`;
}

function findFare(candidates: ExplorerCandidate[], fare: Fare): ExplorerCandidate | null {
  return candidates.find((row) => row.fare === fare) ?? null;
}

function parseBoundedInt(raw: string | null, min: number, max: number): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

export function DecisionExplorer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [periodIndex, setPeriodIndex] = useState(
    () => parseBoundedInt(searchParams.get("period"), 0, 9) ?? DEFAULT_EXPLORER_PERIOD,
  );
  const [remaining, setRemaining] = useState(
    () => parseBoundedInt(searchParams.get("remaining"), 0, 100) ?? DEFAULT_EXPLORER_REMAINING,
  );
  const [decision, setDecision] = useState<ExplorerDecision | null>(null);
  const [selectedFare, setSelectedFare] = useState<Fare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipUrlWrite = useRef(true);

  const seatsSold = FLIGHT.capacity - remaining;
  const uiPeriod = indexToUi(periodIndex);

  useEffect(() => {
    if (skipUrlWrite.current) {
      skipUrlWrite.current = false;
      return;
    }
    router.replace(`${pathname}?period=${periodIndex}&remaining=${remaining}`, { scroll: false });
  }, [pathname, periodIndex, remaining, router]);

  useEffect(() => {
    const controller = new AbortController();
    fetchExplorerDecision(periodIndex, remaining, controller.signal)
      .then((next) => {
        setDecision(next);
        setError(null);
        setSelectedFare((current) => current ?? next.optimized_selected_fare);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setDecision(null);
        setError(caught instanceof Error ? caught.message : "Decision lookup failed.");
      });
    return () => controller.abort();
  }, [periodIndex, remaining]);

  const myopicRow = decision ? findFare(decision.candidates, decision.myopic_selected_fare) : null;
  const optimizedRow = decision
    ? findFare(decision.candidates, decision.optimized_selected_fare)
    : null;
  const selectedRow =
    decision && selectedFare !== null ? findFare(decision.candidates, selectedFare) : null;
  const disagree =
    decision !== null && decision.myopic_selected_fare !== decision.optimized_selected_fare;
  const futureAllZero =
    decision !== null && decision.candidates.every((row) => Math.abs(row.future_value) < 1e-9);

  const actionTradeoff = useMemo(() => {
    if (!myopicRow || !optimizedRow) return null;
    return {
      immediate: optimizedRow.immediate_expected_revenue - myopicRow.immediate_expected_revenue,
      future: optimizedRow.future_value - myopicRow.future_value,
      total: optimizedRow.total_value - myopicRow.total_value,
    };
  }, [myopicRow, optimizedRow]);

  return (
    <div className="px-6 py-4 lg:px-10">
      <header className="flex items-baseline justify-between gap-6">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.18em] text-navy">FLIGHT OPTIMIZER</p>
          <p className="mt-0.5 text-[15px] text-muted">Decision Explorer</p>
        </div>
        <p className="text-[13px] text-muted">Model decision view · observable state only</p>
      </header>

      <section className="mt-5 grid grid-cols-1 gap-6 border-b border-line pb-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">PERIOD</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SELLING_PERIODS.map((period) => {
              const selected = period === uiPeriod;
              return (
                <button
                  key={period}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPeriodIndex(uiToIndex(period))}
                  className={
                    selected
                      ? "min-w-[44px] bg-navy px-2 py-1.5 text-[12px] font-semibold tabular-nums text-white"
                      : "min-w-[44px] border border-line bg-panel px-2 py-1.5 text-[12px] font-semibold tabular-nums text-navy hover:border-navy/40"
                  }
                >
                  T-{period}
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">
                REMAINING SEATS
              </h2>
              <p className="text-[22px] font-medium leading-none tabular-nums text-navy">{remaining}</p>
            </div>
            <input
              type="range"
              min={0}
              max={FLIGHT.capacity}
              value={remaining}
              onChange={(event) => setRemaining(Number(event.target.value))}
              className="mt-2 h-1.5 w-full accent-navy"
              aria-label="Remaining seats"
            />
          </div>
        </div>
        <div className="flex items-start gap-10 pt-1">
          <div>
            <p className="text-[30px] font-medium leading-none tabular-nums text-navy">T-{uiPeriod}</p>
            <p className="mt-2 text-[10px] font-medium tracking-[0.16em] text-muted">PERIOD</p>
          </div>
          <div>
            <p className="text-[30px] font-medium leading-none tabular-nums text-navy">{remaining}</p>
            <p className="mt-2 text-[10px] font-medium tracking-[0.16em] text-muted">REMAINING SEATS</p>
          </div>
          <div>
            <p className="text-[30px] font-medium leading-none tabular-nums text-navy">{seatsSold}</p>
            <p className="mt-2 text-[10px] font-medium tracking-[0.16em] text-muted">SEATS SOLD</p>
          </div>
        </div>
      </section>

      {error ? (
        <UntrainedNotice
          error={error}
          detail="A demand model must be trained in Model Lab before Myopic and Optimized decisions can be inspected."
        />
      ) : null}

      <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="border border-line bg-panel px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted">MYOPIC</p>
          <p className="mt-1 text-[30px] font-medium leading-none tabular-nums text-navy">
            {decision ? `$${decision.myopic_selected_fare}` : "—"}
          </p>
          <p className="mt-2 text-[13px] leading-5 text-muted">
            Maximizes expected revenue this period
          </p>
        </div>
        <div className="border border-line bg-panel px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted">OPTIMIZED</p>
          <p className="mt-1 text-[30px] font-medium leading-none tabular-nums text-navy">
            {decision ? `$${decision.optimized_selected_fare}` : "—"}
          </p>
          <p className="mt-2 text-[13px] leading-5 text-muted">
            Balances revenue now with the future value of remaining seats
          </p>
        </div>
      </section>

      {decision ? (
        <section className="mt-4 border border-line bg-panel px-4 py-3">
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">
            POLICY VALUE COMPARISON
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
            <PolicyValue
              title="MYOPIC POLICY"
              fare={decision.myopic_selected_fare}
              immediate={decision.myopic_immediate_expected_revenue}
              future={decision.myopic_continuation_value}
              total={decision.myopic_total_policy_value}
              futureLabel={"EXPECTED FUTURE REVENUE\nFOLLOWING MYOPIC"}
            />
            <PolicyValue
              title="OPTIMIZED POLICY"
              fare={decision.optimized_selected_fare}
              immediate={decision.optimized_immediate_expected_revenue}
              future={decision.optimized_continuation_value}
              total={decision.optimized_total_policy_value}
              futureLabel={"EXPECTED FUTURE REVENUE\nFOLLOWING OPTIMIZED"}
            />
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[26px] font-medium leading-none tabular-nums text-navy">
              {money(
                decision.optimized_total_policy_value - decision.myopic_total_policy_value,
                true,
              )}
            </p>
            <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
              EXPECTED VALUE OF OPTIMIZATION FROM THIS STATE
            </p>
            <p className="mt-2 max-w-3xl text-[13px] leading-5 text-muted">
              This compares following the Optimized policy versus following the Myopic policy from
              this state through departure.
            </p>
          </div>
          <p className="mt-3 max-w-3xl text-[12px] leading-5 text-muted">
            Future revenue is an expectation over possible inventory paths. The ML model supplies
            the predicted mean demand for the selected fare. Demand is modeled as D ~
            Poisson(predicted μ). Each possible booking outcome leads to a different number of
            remaining seats next period, and those future states are weighted by their
            probabilities. Myopic then again maximizes immediate expected revenue; Optimized
            follows the Bellman-optimal policy. These values are not a single simulated trajectory.
          </p>
        </section>
      ) : null}

      {disagree && actionTradeoff && myopicRow && optimizedRow ? (
        <section className="mt-4 border border-line bg-panel px-4 py-3">
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">
            CURRENT DECISION TRADE-OFF
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted">
            Why Bellman prefers ${optimizedRow.fare} over ${myopicRow.fare} at this current state,
            assuming optimal continuation afterward. This is not the full policy comparison above.
          </p>
          <div className="mt-3 flex flex-wrap gap-10">
            <div>
              <p className="text-[26px] font-medium leading-none tabular-nums text-navy">
                {money(actionTradeoff.immediate, true)}
              </p>
              <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
                REVENUE NOW CHANGE
              </p>
            </div>
            <div>
              <p className="text-[26px] font-medium leading-none tabular-nums text-navy">
                {money(actionTradeoff.future, true)}
              </p>
              <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
                FUTURE VALUE CHANGE
              </p>
            </div>
            <div>
              <p className="text-[26px] font-medium leading-none tabular-nums text-navy">
                {money(actionTradeoff.total, true)}
              </p>
              <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
                TOTAL BELLMAN VALUE CHANGE
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">CANDIDATE FARES</h2>
        <p className="mt-1 text-[12px] text-muted">
          Click a row to inspect the ML demand distribution. Revenue now, future value, and total
          value are the Bellman quantities compared when choosing the Optimized fare. Future value
          is the expected optimized value of remaining inventory after this period.
        </p>
        <div className="mt-3 overflow-x-auto border border-line bg-panel">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[10px] font-semibold tracking-[0.14em] text-muted">
                <th className="px-3 py-2">FARE</th>
                <th className="px-3 py-2 text-right">ML PREDICTED BOOKINGS</th>
                <th className="px-3 py-2 text-right">EXPECTED SALES</th>
                <th className="px-3 py-2 text-right">REVENUE NOW</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Expected optimized value of the inventory remaining after this period."
                >
                  FUTURE VALUE
                </th>
                <th className="px-3 py-2 text-right">TOTAL VALUE</th>
              </tr>
            </thead>
            <tbody>
              {FARES.map((fare) => {
                const row = decision?.candidates.find((candidate) => candidate.fare === fare);
                const isMyopic = decision?.myopic_selected_fare === fare;
                const isOptimized = decision?.optimized_selected_fare === fare;
                const isSelected = selectedFare === fare;
                let rowClass = "border-b border-line/80 text-navy hover:bg-page/80";
                if (isMyopic && isOptimized) {
                  rowClass = "border-b border-navy/20 bg-navy/10 text-navy";
                } else if (isOptimized) {
                  rowClass = "border-b border-navy/20 bg-navy/10 text-navy";
                } else if (isMyopic) {
                  rowClass = "border-b border-gold/40 bg-gold/10 text-navy";
                }
                if (isSelected) {
                  rowClass += " outline outline-1 outline-offset-[-1px] outline-navy/40";
                }
                return (
                  <tr
                    key={fare}
                    className={`${rowClass} cursor-pointer`}
                    onClick={() => setSelectedFare(fare)}
                  >
                    <td className="px-3 py-2">
                      <button type="button" className="text-left" onClick={() => setSelectedFare(fare)}>
                        <span className="font-medium tabular-nums">${fare}</span>
                        {isMyopic || isOptimized ? (
                          <span className="ml-2 text-[9px] font-semibold tracking-[0.14em] text-muted">
                            {isMyopic && isOptimized
                              ? "MYOPIC · OPTIMIZED"
                              : isMyopic
                                ? "MYOPIC CHOICE"
                                : "OPTIMIZED CHOICE"}
                          </span>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row ? row.predicted_mu.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row ? row.expected_sales.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row ? money(row.immediate_expected_revenue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row ? money(row.future_value) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {row ? money(row.total_value) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {futureAllZero ? (
          <p className="mt-2 text-[12px] text-muted">
            Future value is $0 for every fare, so both policies select the same fare.
          </p>
        ) : null}
      </section>

      <section className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)]">
        <div>
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">
            ML PREDICTED DEMAND
          </h2>
          <p className="mt-1 text-[13px] text-navy">
            D ~ Poisson({selectedRow ? selectedRow.predicted_mu.toFixed(1) : "—"})
            {selectedRow ? ` at $${selectedRow.fare}` : ""}
          </p>
          <div className="mt-2">
            <p className="text-[30px] font-medium leading-none tabular-nums text-navy">
              {selectedRow ? selectedRow.predicted_mu.toFixed(1) : "—"}
            </p>
            <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
              ML PREDICTED MEAN
            </p>
          </div>
          {selectedRow ? (
            <>
              <MlDemandChart
                predictedMean={selectedRow.predicted_mu}
                remainingSeats={remaining}
                periodLabel={`T-${uiPeriod}`}
              />
              {remaining > 0 && selectedRow.predicted_mu > 0 ? (
                <p className="mt-2 max-w-xl text-[12px] leading-5 text-muted">
                  Expected sales use Q = min(D, {remaining} remaining seats). Any Poisson mass at or
                  beyond {remaining} is counted as selling the last remaining seats, matching the
                  pricing calculation.
                </p>
              ) : remaining === 0 ? (
                <p className="mt-2 text-[12px] text-muted">
                  Remaining capacity is 0, so expected sales are 0 at every fare.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div>
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">MODEL INPUTS</h2>
          <p className="mt-2 max-w-sm text-[13px] leading-5 text-muted">
            The demand model predicts expected bookings for each candidate fare from the observable
            flight state.
          </p>
          <dl className="mt-4 space-y-2 text-[13px] text-navy">
            <div className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">Period</dt>
              <dd className="tabular-nums">T-{uiPeriod}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">Fare</dt>
              <dd className="tabular-nums">{selectedRow ? `$${selectedRow.fare}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-muted">Cumulative bookings</dt>
              <dd className="tabular-nums">{seatsSold}</dd>
            </div>
          </dl>
          <details className="mt-6 border border-line bg-panel px-4 py-3">
            <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.16em] text-muted">
              HOW MYOPIC PRICING WORKS
            </summary>
            <div className="mt-3 text-[13px] leading-5 text-navy">
              <p className="font-medium tabular-nums">
                p<sub>M</sub>(t,c) = argmax<sub>p</sub> p E[Q | t,c,p]
              </p>
              <ul className="mt-3 space-y-1 text-muted">
                <li>t = selling period</li>
                <li>c = remaining seats</li>
                <li>p = fare</li>
                <li>Q = bookings capped by remaining seats</li>
              </ul>
              <p className="mt-3 text-muted">
                Myopic evaluates all candidate fares and selects the fare with the highest expected
                revenue in the current period. It does not account for the future value of remaining
                seats when choosing the fare. At the next selling period, it repeats the same
                immediate-revenue optimization using the new state.
              </p>
            </div>
          </details>
          <details className="mt-3 border border-line bg-panel px-4 py-3">
            <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.16em] text-muted">
              HOW OPTIMIZED PRICING WORKS
            </summary>
            <div className="mt-3 text-[13px] leading-5 text-navy">
              <p className="font-medium tabular-nums">
                V<sup>*</sup>
                <sub>t</sub>(c) = max<sub>p</sub> E[pQ + V<sup>*</sup>
                <sub>t+1</sub>(c − Q)]
              </p>
              <ul className="mt-3 space-y-1 text-muted">
                <li>t = selling period</li>
                <li>c = remaining seats</li>
                <li>p = fare</li>
                <li>Q = bookings, capped by remaining seats</li>
              </ul>
              <p className="mt-3 text-muted">
                Optimized evaluates both expected revenue now and the expected future value of the
                remaining seats. The future value is probability-weighted over possible booking
                outcomes under the ML-predicted Poisson demand distribution.
              </p>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

function PolicyValue({
  title,
  fare,
  immediate,
  future,
  total,
  futureLabel,
}: {
  title: string;
  fare: number;
  immediate: number;
  future: number;
  total: number;
  futureLabel: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted">{title}</p>
      <p className="mt-1 text-[30px] font-medium leading-none tabular-nums text-navy">${fare}</p>
      <p className="mt-1 text-[12px] text-muted">selected fare</p>
      <dl className="mt-3 space-y-2 text-[13px] text-navy">
        <div>
          <dt className="text-[10px] font-medium tracking-[0.14em] text-muted">
            EXPECTED REVENUE NOW
          </dt>
          <dd className="mt-0.5 text-[18px] font-medium tabular-nums">{money(immediate)}</dd>
        </div>
        <div>
          <dt className="whitespace-pre-line text-[10px] font-medium tracking-[0.14em] text-muted">
            {futureLabel}
          </dt>
          <dd className="mt-0.5 text-[18px] font-medium tabular-nums">{money(future)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium tracking-[0.14em] text-muted">
            EXPECTED TOTAL REVENUE FROM THIS STATE
          </dt>
          <dd className="mt-0.5 text-[18px] font-medium tabular-nums">{money(total)}</dd>
        </div>
      </dl>
    </div>
  );
}
