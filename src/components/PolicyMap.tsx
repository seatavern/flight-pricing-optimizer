"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { UntrainedNotice } from "@/components/UntrainedNotice";
import { FARES, FLIGHT, type Fare } from "@/lib/constants";
import { fetchPolicyMap, type PolicyMapState } from "@/lib/pricingApi";

const PERIODS = 10;
const CAPACITY = FLIGHT.capacity;
const ROWS = CAPACITY + 1;
const PAD_LEFT = 52;
const PAD_RIGHT = 10;
const PAD_TOP = 8;
const PAD_BOTTOM = 28;
const CELL_HEIGHT = 6;
const VIEW_MODES = ["myopic", "optimized", "difference"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const FARE_COLORS: Record<Fare, string> = {
  50: "#e7eef4",
  60: "#d2dee8",
  70: "#b7c8d6",
  80: "#97b0c3",
  90: "#7596b0",
  100: "#577a97",
  110: "#3e5f7c",
  120: "#1b3a57",
  130: "#c4a14a",
};

type Hovered = {
  period: number;
  remaining: number;
  x: number;
  y: number;
};

function periodLabel(period: number): string {
  return `T-${10 - period}`;
}

function formatDifference(value: number): string {
  if (value === 0) return "SAME";
  return value > 0 ? `+$${value}` : `-$${Math.abs(value)}`;
}

function differenceColor(value: number): string {
  if (value === 0) return "#d5dde4";
  const steps = Math.min(8, Math.max(1, Math.round(Math.abs(value) / 10)));
  if (value > 0) {
    const mix = steps / 8;
    return mixColor("#9bb0c2", "#1b3a57", mix);
  }
  const mix = steps / 8;
  return mixColor("#e6d4a8", "#c4a14a", mix);
}

function mixColor(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex(
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function cellColor(mode: ViewMode, state: PolicyMapState): string {
  if (state.remaining_capacity === 0) return "#eef2f6";
  if (mode === "myopic") return FARE_COLORS[state.myopic_fare];
  if (mode === "optimized") return FARE_COLORS[state.optimized_fare];
  return differenceColor(state.fare_difference);
}

function lookup(states: PolicyMapState[], period: number, remaining: number): PolicyMapState | null {
  return states[period * ROWS + remaining] ?? null;
}

export function PolicyMap() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [states, setStates] = useState<PolicyMapState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("difference");
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [width, setWidth] = useState(880);

  useEffect(() => {
    const controller = new AbortController();
    fetchPolicyMap(controller.signal)
      .then((payload) => {
        const ordered = [...payload.states].sort((left, right) => {
          if (left.period !== right.period) return left.period - right.period;
          return left.remaining_capacity - right.remaining_capacity;
        });
        setStates(ordered);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setStates(null);
        setError(caught instanceof Error ? caught.message : "Policy map lookup failed.");
      });
    return () => controller.abort();
  }, []);

  const summary = useMemo(() => {
    if (!states) return null;
    const priced = states.filter((row) => row.remaining_capacity > 0);
    const disagree = priced.filter((row) => row.fare_difference !== 0);
    const higher = disagree.filter((row) => row.fare_difference > 0).length;
    const lower = disagree.filter((row) => row.fare_difference < 0).length;
    const avgAbs =
      disagree.length === 0
        ? 0
        : disagree.reduce((sum, row) => sum + Math.abs(row.fare_difference), 0) / disagree.length;
    return {
      total: priced.length,
      different: disagree.length,
      percent: (100 * disagree.length) / priced.length,
      higher,
      lower,
      avgAbs,
    };
  }, [states]);

  const layout = useMemo(() => {
    const innerWidth = Math.max(320, width - PAD_LEFT - PAD_RIGHT);
    const cellWidth = innerWidth / PERIODS;
    const innerHeight = ROWS * CELL_HEIGHT;
    return {
      cellWidth,
      cellHeight: CELL_HEIGHT,
      canvasWidth: width,
      canvasHeight: PAD_TOP + innerHeight + PAD_BOTTOM,
    };
  }, [width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });
    observer.observe(parent);
    setWidth(parent.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !states) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.canvasWidth * ratio);
    canvas.height = Math.round(layout.canvasHeight * ratio);
    canvas.style.width = `${layout.canvasWidth}px`;
    canvas.style.height = `${layout.canvasHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);

    for (const state of states) {
      const x = PAD_LEFT + state.period * layout.cellWidth;
      const y = PAD_TOP + (CAPACITY - state.remaining_capacity) * layout.cellHeight;
      context.fillStyle = cellColor(mode, state);
      context.fillRect(x, y, layout.cellWidth, layout.cellHeight);
      if (state.remaining_capacity === 0) {
        context.strokeStyle = "#cfd8e1";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, y + layout.cellHeight);
        context.lineTo(x + layout.cellWidth, y);
        context.stroke();
      }
    }

    context.strokeStyle = "#cfd8e1";
    context.lineWidth = 1;
    context.strokeRect(
      PAD_LEFT + 0.5,
      PAD_TOP + 0.5,
      PERIODS * layout.cellWidth,
      ROWS * layout.cellHeight,
    );

    context.fillStyle = "#8b9aab";
    context.font = "11px var(--font-source-sans), Source Sans 3, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    for (let period = 0; period < PERIODS; period += 1) {
      const x = PAD_LEFT + (period + 0.5) * layout.cellWidth;
      context.fillText(periodLabel(period), x, PAD_TOP + ROWS * layout.cellHeight + 8);
    }

    context.textAlign = "right";
    context.textBaseline = "middle";
    for (const remaining of [0, 25, 50, 75, 100]) {
      const y = PAD_TOP + (CAPACITY - remaining) * layout.cellHeight + layout.cellHeight / 2;
      context.fillText(String(remaining), PAD_LEFT - 8, y);
    }

    if (hovered) {
      const x = PAD_LEFT + hovered.period * layout.cellWidth;
      const y = PAD_TOP + (CAPACITY - hovered.remaining) * layout.cellHeight;
      context.strokeStyle = "#1b3a57";
      context.lineWidth = 1.5;
      context.strokeRect(x + 0.75, y + 0.75, layout.cellWidth - 1.5, layout.cellHeight - 1.5);
    }
  }, [hovered, layout, mode, states]);

  function eventToState(event: MouseEvent<HTMLCanvasElement>): PolicyMapState | null {
    if (!states) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const period = Math.floor((x - PAD_LEFT) / layout.cellWidth);
    const row = Math.floor((y - PAD_TOP) / layout.cellHeight);
    if (period < 0 || period >= PERIODS || row < 0 || row >= ROWS) return null;
    return lookup(states, period, CAPACITY - row);
  }

  const hoveredState =
    hovered && states ? lookup(states, hovered.period, hovered.remaining) : null;

  return (
    <div className="px-6 py-4 lg:px-10">
      <header className="flex items-baseline justify-between gap-6">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.18em] text-navy">FLIGHT OPTIMIZER</p>
          <p className="mt-0.5 text-[15px] text-muted">Policy Map</p>
        </div>
        <p className="text-[13px] text-muted">Selected fares across the state space</p>
      </header>

      <p className="mt-4 max-w-3xl text-[13px] leading-5 text-muted">
        The map shows the fare selected at every time/inventory state. Myopic selects the fare with
        the highest expected revenue in the current period. Optimized also accounts for the expected
        future value of remaining capacity.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {VIEW_MODES.map((item) => {
          const selected = item === mode;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={selected}
              onClick={() => setMode(item)}
              className={
                selected
                  ? "bg-navy px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white"
                  : "border border-line bg-panel px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-navy hover:border-navy/40"
              }
            >
              {item.toUpperCase()}
            </button>
          );
        })}
      </div>

      {summary ? (
        <section className="mt-4 grid grid-cols-2 gap-3 border border-line bg-panel px-4 py-3 md:grid-cols-4">
          <div>
            <p className="text-[22px] font-medium leading-none tabular-nums text-navy">
              {summary.different} / {summary.total}
            </p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">
              STATES WITH DIFFERENT FARES
            </p>
            <p className="mt-0.5 text-[12px] tabular-nums text-muted">{summary.percent.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[22px] font-medium leading-none tabular-nums text-navy">
              ${Math.round(summary.avgAbs)}
            </p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">
              AVERAGE ABSOLUTE FARE DIFFERENCE
            </p>
            <p className="mt-0.5 text-[12px] text-muted">disagreement states only</p>
          </div>
          <div>
            <p className="text-[22px] font-medium leading-none tabular-nums text-navy">{summary.higher}</p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">
              OPTIMIZED HIGHER
            </p>
          </div>
          <div>
            <p className="text-[22px] font-medium leading-none tabular-nums text-navy">{summary.lower}</p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">
              OPTIMIZED LOWER
            </p>
          </div>
        </section>
      ) : null}

      {error ? (
        <UntrainedNotice
          error={error}
          detail="A demand model must be trained in Model Lab before Policy Map can show Myopic and Optimized fares."
        />
      ) : null}

      {states ? (
        <section className="relative mt-4">
        <div className="mb-2 flex items-end justify-between gap-4">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted">REMAINING SEATS</p>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted">PERIOD</p>
        </div>
        <canvas
          ref={canvasRef}
          className={
            hovered && hovered.remaining > 0
              ? "block w-full cursor-pointer bg-panel"
              : "block w-full cursor-crosshair bg-panel"
          }
          onMouseMove={(event) => {
            const state = eventToState(event);
            if (!state) {
              setHovered(null);
              return;
            }
            setHovered({
              period: state.period,
              remaining: state.remaining_capacity,
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onMouseLeave={() => setHovered(null)}
          onClick={(event) => {
            const state = eventToState(event);
            if (!state || state.remaining_capacity === 0) return;
            router.push(`/decision-explorer?period=${state.period}&remaining=${state.remaining_capacity}`);
          }}
        />
        {hoveredState ? (
          <div
            className="pointer-events-none fixed z-20 border border-line bg-panel px-3 py-2 text-[12px] text-navy shadow-sm"
            style={{ left: hovered ? hovered.x + 12 : 0, top: hovered ? hovered.y + 12 : 0 }}
          >
            {hoveredState.remaining_capacity === 0 ? (
              <p className="font-semibold tracking-[0.12em] text-muted">SOLD OUT</p>
            ) : (
              <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
                <dt className="text-muted">PERIOD</dt>
                <dd className="tabular-nums">{periodLabel(hoveredState.period)}</dd>
                <dt className="text-muted">REMAINING</dt>
                <dd className="tabular-nums">{hoveredState.remaining_capacity} seats</dd>
                <dt className="text-muted">SOLD</dt>
                <dd className="tabular-nums">{CAPACITY - hoveredState.remaining_capacity} seats</dd>
                <dt className="text-muted">MYOPIC</dt>
                <dd className="tabular-nums">${hoveredState.myopic_fare}</dd>
                <dt className="text-muted">OPTIMIZED</dt>
                <dd className="tabular-nums">${hoveredState.optimized_fare}</dd>
                <dt className="text-muted">DIFFERENCE</dt>
                <dd className="tabular-nums">{formatDifference(hoveredState.fare_difference)}</dd>
              </dl>
            )}
          </div>
        ) : null}
      </section>
      ) : null}

      {states ? (
        <section className="mt-4 border border-line bg-panel px-4 py-3">
        {mode === "difference" ? (
          <div className="flex flex-wrap items-center gap-5">
            <LegendSwatch color="#d5dde4" label="SAME FARE" />
            <LegendSwatch color="#1b3a57" label="OPTIMIZED FARE HIGHER" />
            <LegendSwatch color="#c4a14a" label="OPTIMIZED FARE LOWER" />
            <LegendSwatch color="#eef2f6" label="SOLD OUT" hatched />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {FARES.map((fare) => (
              <LegendSwatch key={fare} color={FARE_COLORS[fare]} label={`$${fare}`} />
            ))}
            <LegendSwatch color="#eef2f6" label="SOLD OUT" hatched />
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  hatched = false,
}: {
  color: string;
  label: string;
  hatched?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-5 border border-line"
        style={{
          backgroundColor: color,
          backgroundImage: hatched
            ? "linear-gradient(135deg, transparent 40%, #cfd8e1 40%, #cfd8e1 50%, transparent 50%)"
            : undefined,
        }}
      />
      <span className="text-[10px] font-medium tracking-[0.12em] text-muted">{label}</span>
    </div>
  );
}
