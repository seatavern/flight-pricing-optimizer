"use client";

import { useEffect, useMemo, useState } from "react";
import { FARES, type Fare } from "@/lib/constants";
import {
  fetchBookingsDiagnostic,
  fetchFareDiagnostic,
  fetchSurfaceDiagnostic,
  type BookingsDiagnostic,
  type FareDiagnostic,
  type SurfaceDiagnostic,
} from "@/lib/modelApi";

const UI_PERIODS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

function uiToIndex(uiPeriod: number): number {
  return 10 - uiPeriod;
}

function formatMu(value: number): string {
  return value.toFixed(2);
}

export function LearnedDemand({ ready, modelKey }: { ready: boolean; modelKey: string }) {
  const [uiPeriod, setUiPeriod] = useState(8);
  const [cumulative, setCumulative] = useState(52);
  const [fare, setFare] = useState<Fare>(50);
  const [fareDiag, setFareDiag] = useState<FareDiagnostic | null>(null);
  const [bookingsDiag, setBookingsDiag] = useState<BookingsDiagnostic | null>(null);
  const [surface, setSurface] = useState<SurfaceDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const period = uiToIndex(uiPeriod);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    fetchFareDiagnostic(period, cumulative, controller.signal)
      .then((next) => {
        setFareDiag(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Diagnostic lookup failed.");
      });
    return () => controller.abort();
  }, [cumulative, modelKey, period, ready]);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    fetchBookingsDiagnostic(period, fare, controller.signal)
      .then((next) => {
        setBookingsDiag(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Diagnostic lookup failed.");
      });
    return () => controller.abort();
  }, [fare, modelKey, period, ready]);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    fetchSurfaceDiagnostic(period, controller.signal)
      .then((next) => {
        setSurface(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Diagnostic lookup failed.");
      });
    return () => controller.abort();
  }, [modelKey, period, ready]);

  return (
    <section className="mt-5 border border-line bg-panel px-4 py-3">
      <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">LEARNED DEMAND</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-5 text-muted">
        These ML predictions are the demand estimates used by Myopic and Optimized pricing.
        Irregularities in the learned demand surface can therefore appear as boundaries or small
        bands in Policy Map. Bellman optimization, discrete capacity, stochastic demand, and the
        discrete fare grid also affect those boundaries.
      </p>
      {!ready ? (
        <p className="mt-3 text-[13px] text-navy">Train a model to inspect learned demand.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {UI_PERIODS.map((item) => {
              const selected = item === uiPeriod;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setUiPeriod(item)}
                  className={
                    selected
                      ? "min-w-[44px] bg-navy px-2 py-1.5 text-[12px] font-semibold tabular-nums text-white"
                      : "min-w-[44px] border border-line bg-page px-2 py-1.5 text-[12px] font-semibold tabular-nums text-navy hover:border-navy/40"
                  }
                >
                  T-{item}
                </button>
              );
            })}
          </div>
          {error ? <p className="mt-3 text-[13px] text-navy">{error}</p> : null}
          <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <FareResponseChart diagnostic={fareDiag} cumulative={cumulative} onCumulative={setCumulative} />
            <BookingsResponseChart diagnostic={bookingsDiag} fare={fare} onFare={setFare} />
          </div>
          <DemandSurface diagnostic={surface} />
        </>
      )}
    </section>
  );
}

function FareResponseChart({
  diagnostic,
  cumulative,
  onCumulative,
}: {
  diagnostic: FareDiagnostic | null;
  cumulative: number;
  onCumulative: (value: number) => void;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
        PREDICTED DEMAND VS FARE
      </h3>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <p className="text-[12px] text-muted">Cumulative bookings</p>
        <p className="text-[16px] font-medium tabular-nums text-navy">{cumulative}</p>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={cumulative}
        onChange={(event) => onCumulative(Number(event.target.value))}
        className="mt-1 h-1.5 w-full accent-navy"
        aria-label="Cumulative bookings"
      />
      <LineChart
        points={(diagnostic?.points ?? []).map((row) => ({ x: row.fare, y: row.predicted_mu, label: `$${row.fare}` }))}
        xLabel="FARE"
        yLabel="ML PREDICTED MEAN"
        xTicks={FARES.map((fare) => ({ value: fare, label: `$${fare}` }))}
      />
      <table className="mt-2 w-full text-left text-[12px]">
        <thead>
          <tr className="text-[10px] font-semibold tracking-[0.12em] text-muted">
            <th className="py-1">FARE</th>
            <th className="py-1 text-right">PREDICTED μ</th>
          </tr>
        </thead>
        <tbody>
          {(diagnostic?.points ?? []).map((row) => (
            <tr key={row.fare} className="border-t border-line/80 text-navy">
              <td className="py-1 tabular-nums">${row.fare}</td>
              <td className="py-1 text-right tabular-nums">{formatMu(row.predicted_mu)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] leading-5 text-muted">
        The model is not constrained to enforce a monotonic price response. HistGradientBoosting
        learns nonlinear relationships from the training data.
      </p>
    </div>
  );
}

function BookingsResponseChart({
  diagnostic,
  fare,
  onFare,
}: {
  diagnostic: BookingsDiagnostic | null;
  fare: Fare;
  onFare: (fare: Fare) => void;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
        PREDICTED DEMAND VS BOOKINGS
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FARES.map((item) => {
          const selected = item === fare;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={selected}
              onClick={() => onFare(item)}
              className={
                selected
                  ? "bg-navy px-2 py-1 text-[11px] font-semibold tabular-nums text-white"
                  : "border border-line bg-page px-2 py-1 text-[11px] font-semibold tabular-nums text-navy hover:border-navy/40"
              }
            >
              ${item}
            </button>
          );
        })}
      </div>
      <LineChart
        points={(diagnostic?.points ?? []).map((row) => ({
          x: row.cumulative_bookings,
          y: row.predicted_mu,
          label: String(row.cumulative_bookings),
        }))}
        xLabel="CUMULATIVE BOOKINGS"
        yLabel="ML PREDICTED MEAN"
        xTicks={[0, 25, 50, 75, 100].map((value) => ({ value, label: String(value) }))}
        showMarkers={false}
      />
      <p className="mt-2 text-[12px] leading-5 text-muted">
        Tree-based models can produce stepwise prediction surfaces because observations are
        partitioned into learned regions.
      </p>
    </div>
  );
}

function LineChart({
  points,
  xLabel,
  yLabel,
  xTicks,
  showMarkers = true,
}: {
  points: Array<{ x: number; y: number; label: string }>;
  xLabel: string;
  yLabel: string;
  xTicks: Array<{ value: number; label: string }>;
  showMarkers?: boolean;
}) {
  const width = 640;
  const height = 176;
  const pad = { top: 16, right: 10, bottom: 36, left: 42 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMax = Math.max(1, ...(ys.length ? ys : [1]));
  const xAt = (value: number) =>
    pad.left + ((value - xMin) / Math.max(xMax - xMin, 1)) * innerW;
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(point.x).toFixed(1)} ${yAt(point.y).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full" role="img" aria-label={yLabel}>
      {[0, yMax / 2, yMax].map((tick) => (
        <g key={tick}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yAt(tick)}
            y2={yAt(tick)}
            stroke="#e6edf2"
          />
          <text x={pad.left - 6} y={yAt(tick) + 3} textAnchor="end" fill="#8b9aab" fontSize="10">
            {tick.toFixed(1)}
          </text>
        </g>
      ))}
      {path ? <path d={path} fill="none" stroke="#1b3a57" strokeWidth="1.5" /> : null}
      {showMarkers
        ? points.map((point) => (
            <circle key={point.x} cx={xAt(point.x)} cy={yAt(point.y)} r="3.5" fill="#1b3a57">
              <title>{`${point.label}: ${formatMu(point.y)}`}</title>
            </circle>
          ))
        : null}
      {xTicks.map((tick) => (
        <text
          key={tick.value}
          x={xAt(tick.value)}
          y={height - 14}
          textAnchor="middle"
          fill="#8b9aab"
          fontSize="10"
        >
          {tick.label}
        </text>
      ))}
      <text x={pad.left + innerW / 2} y={height - 2} textAnchor="middle" fill="#8b9aab" fontSize="10">
        {xLabel}
      </text>
    </svg>
  );
}

function DemandSurface({ diagnostic }: { diagnostic: SurfaceDiagnostic | null }) {
  const values = diagnostic?.cells ?? [];
  const min = values.length ? Math.min(...values.map((cell) => cell.predicted_mu)) : 0;
  const max = values.length ? Math.max(...values.map((cell) => cell.predicted_mu)) : 1;

  return (
    <div className="mt-5">
      <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
        ML PREDICTED DEMAND
      </h3>
      <p className="mt-1 text-[12px] text-muted">
        Selected period · predicted μ at the nine fares and every cumulative-booking state
      </p>
      <SurfaceCanvas cells={values} min={min} max={max} />
    </div>
  );
}

function SurfaceCanvas({
  cells,
  min,
  max,
}: {
  cells: Array<{ fare: number; cumulative_bookings: number; predicted_mu: number }>;
  min: number;
  max: number;
}) {
  const [hover, setHover] = useState<{
    fare: number;
    sold: number;
    mu: number;
    x: number;
    y: number;
  } | null>(null);
  const lookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of cells) {
      map.set(`${cell.fare}:${cell.cumulative_bookings}`, cell.predicted_mu);
    }
    return map;
  }, [cells]);

  const cellW = 56;
  const cellH = 3;
  const padL = 28;
  const padT = 18;
  const width = padL + FARES.length * cellW;
  const height = padT + 101 * cellH + 8;

  function colorAt(sold: number, fare: number): string {
    const mu = lookup.get(`${fare}:${sold}`) ?? 0;
    const t = max === min ? 0.5 : (mu - min) / (max - min);
    return demandColor(t);
  }

  return (
    <div className="relative mt-2 overflow-x-auto">
      <svg
        width={width}
        height={height}
        className="block"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const col = Math.floor((x - padL) / cellW);
          const row = Math.floor((y - padT) / cellH);
          if (col < 0 || col >= FARES.length || row < 0 || row > 100) {
            setHover(null);
            return;
          }
          const fare = FARES[col];
          const sold = 100 - row;
          setHover({
            fare,
            sold,
            mu: lookup.get(`${fare}:${sold}`) ?? 0,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onMouseLeave={() => setHover(null)}
      >
        {FARES.map((fare, col) => (
          <text
            key={fare}
            x={padL + col * cellW + cellW / 2}
            y={12}
            textAnchor="middle"
            fill="#8b9aab"
            fontSize="10"
          >
            ${fare}
          </text>
        ))}
        {Array.from({ length: 101 }, (_, row) => {
          const sold = 100 - row;
          return FARES.map((fare, col) => (
            <rect
              key={`${fare}-${sold}`}
              x={padL + col * cellW}
              y={padT + row * cellH}
              width={cellW}
              height={cellH}
              fill={colorAt(sold, fare)}
            />
          ));
        })}
        {[0, 50, 100].map((sold) => (
          <text
            key={sold}
            x={padL - 4}
            y={padT + (100 - sold) * cellH + 3}
            textAnchor="end"
            fill="#8b9aab"
            fontSize="10"
          >
            {sold}
          </text>
        ))}
      </svg>
      {hover ? (
        <div
          className="pointer-events-none fixed z-20 border border-line bg-panel px-2 py-1 text-[12px] text-navy"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          ${hover.fare} · sold {hover.sold} · μ {formatMu(hover.mu)}
        </div>
      ) : null}
    </div>
  );
}

function demandColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const r = Math.round(231 + (27 - 231) * clamped);
  const g = Math.round(238 + (58 - 238) * clamped);
  const b = Math.round(244 + (87 - 244) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}
