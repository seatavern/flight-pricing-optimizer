"use client";

import { useEffect, useRef } from "react";
import { CHART_MAX_BOOKINGS, periodLabel as formatPeriod } from "@/lib/constants";
import { poissonPmfs, poissonSupportMax } from "@/lib/poisson";

type DemandChartProps = {
  period: number;
  mu: number;
  mlPredictedMean?: number | null;
  realizedBookings: number | null;
  sampling?: boolean;
};

function xTickStep(maxK: number): number {
  if (maxK <= 18) return 2;
  if (maxK <= 36) return 4;
  if (maxK <= 60) return 5;
  return 10;
}

export function DemandChart({
  period,
  mu,
  mlPredictedMean = null,
  realizedBookings,
  sampling = false,
}: DemandChartProps) {
  const showMl = mlPredictedMean !== null && Number.isFinite(mlPredictedMean);
  const maxK = Math.max(
    CHART_MAX_BOOKINGS,
    poissonSupportMax(mu),
    showMl ? poissonSupportMax(mlPredictedMean) : 0,
    realizedBookings ?? 0,
  );
  const truePmf = poissonPmfs(mu, maxK);
  const mlPmf = showMl ? poissonPmfs(mlPredictedMean, maxK) : null;
  const peak = Math.max(...truePmf, ...(mlPmf ?? []), 0);
  const yMax = Math.max(0.12, Math.ceil(peak * 20) / 20);
  const width = 640;
  const height = showMl ? 178 : 168;
  const pad = { top: showMl ? 22 : 12, right: 8, bottom: 36, left: 42 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const barGap = 0.2;
  const slot = innerW / truePmf.length;
  const barW = slot * (1 - barGap);
  const ticks = yMax <= 0.12 ? [0, 0.05, 0.1] : [0, yMax / 2, yMax];
  const chartPeriod = formatPeriod(period);
  const tickStep = xTickStep(maxK);
  const yAt = (p: number) => pad.top + innerH - (p / yMax) * innerH;
  const xAt = (k: number) => pad.left + k * slot + slot / 2;
  const mlPoints = mlPmf
    ? mlPmf.map((probability, k) => `${xAt(k).toFixed(2)},${yAt(probability).toFixed(2)}`).join(" ")
    : "";
  const sweepRef = useRef<SVGRectElement | null>(null);

  useEffect(() => {
    const band = sweepRef.current;
    if (!sampling || !band) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      band.setAttribute("opacity", "0");
      return;
    }
    const start = performance.now();
    const duration = 450;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      band.setAttribute("x", String(pad.left + eased * innerW - 8));
      band.setAttribute("opacity", String(0.32 * (1 - t)));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    band.setAttribute("x", String(pad.left - 8));
    band.setAttribute("opacity", "0.32");
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sampling, pad.left, innerW]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-1 h-auto w-full overflow-hidden font-sans"
      role="img"
      aria-label={
        showMl
          ? `True market and ML predicted demand distributions during ${chartPeriod}`
          : `True market demand distribution with mean ${mu.toFixed(1)} bookings`
      }
    >
      <defs>
        <clipPath id="demand-plot-clip">
          <rect x={pad.left} y={pad.top} width={innerW} height={innerH} />
        </clipPath>
      </defs>
      {showMl ? (
        <g aria-hidden="true">
          <rect x={width - pad.right - 128} y={2} width={8} height={8} fill="#1b3a57" />
          <text
            x={width - pad.right - 116}
            y={10}
            fill="currentColor"
            className="text-muted"
            fontSize="9"
            letterSpacing="1.1"
          >
            TRUE MARKET
          </text>
          <line
            x1={width - pad.right - 128}
            x2={width - pad.right - 120}
            y1={18}
            y2={18}
            stroke="#c4a14a"
            strokeWidth="1.75"
          />
          <text
            x={width - pad.right - 116}
            y={21}
            fill="currentColor"
            className="text-muted"
            fontSize="9"
            letterSpacing="1.1"
          >
            ML PREDICTION
          </text>
        </g>
      ) : (
        <text
          x={width - pad.right}
          y={10}
          textAnchor="end"
          fill="currentColor"
          className="text-muted-2"
          fontSize="9"
          letterSpacing="1.2"
        >
          TRUE MARKET DISTRIBUTION
        </text>
      )}
      {ticks.map((tick) => {
        const y = yAt(tick);
        return (
          <text
            key={tick}
            x={pad.left - 8}
            y={y + 3}
            textAnchor="end"
            fill="currentColor"
            className="text-muted"
            fontSize="10"
          >
            {`${Math.round(tick * 100)}%`}
          </text>
        );
      })}

      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={yAt(0)}
        y2={yAt(0)}
        stroke="#cfd8e1"
        strokeWidth="1"
      />

      {truePmf.map((probability, k) => {
        const barH = Math.max((probability / yMax) * innerH, 0);
        const x = pad.left + k * slot + (slot - barW) / 2;
        const y = yAt(0) - barH;
        return (
          <rect
            key={k}
            x={x}
            y={y}
            width={barW}
            height={barH}
            fill={realizedBookings === k ? "#c4a14a" : "#1b3a57"}
          />
        );
      })}

      {sampling ? (
        <g clipPath="url(#demand-plot-clip)">
          <rect
            x={pad.left}
            y={pad.top}
            width={innerW}
            height={innerH}
            fill="#c4a14a"
            opacity="0.05"
          />
          <rect
            ref={sweepRef}
            x={pad.left - 8}
            y={pad.top}
            width="16"
            height={innerH}
            fill="#c4a14a"
            opacity="0.32"
          />
        </g>
      ) : null}

      {mlPmf ? (
        <polyline
          points={mlPoints}
          fill="none"
          stroke="#c4a14a"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {realizedBookings !== null && realizedBookings >= 0 && realizedBookings <= maxK ? (
        <circle
          cx={xAt(realizedBookings)}
          cy={yAt(0) + 5}
          r="3"
          fill="#c4a14a"
        />
      ) : null}

      {Array.from({ length: Math.floor(maxK / tickStep) + 1 }, (_, i) => i * tickStep).map((k) => (
        <text
          key={`tick-${k}`}
          x={xAt(k)}
          y={height - 18}
          textAnchor="middle"
          fill="currentColor"
          className="text-muted"
          fontSize="10"
        >
          {k}
        </text>
      ))}

      <text
        x={pad.left + innerW / 2}
        y={height - 4}
        textAnchor="middle"
        fill="currentColor"
        className="text-muted"
        fontSize="11"
      >
        {`Bookings during ${chartPeriod}`}
      </text>
    </svg>
  );
}
