"use client";

import { FLIGHT } from "@/lib/constants";

type HeaderProps = {
  marketStrength: number;
  strengthPending?: boolean;
  onRandomizeStrength: () => void;
};

export function Header({
  marketStrength,
  strengthPending = false,
  onRandomizeStrength,
}: HeaderProps) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <div className="flex items-baseline gap-4">
        <p className="text-[13px] font-semibold tracking-[0.18em] text-navy">
          FLIGHT OPTIMIZER
        </p>
        <p className="text-[15px] font-normal text-muted">Flight Simulator</p>
      </div>
      <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 text-[13px] tracking-wide">
        <span className="font-semibold text-navy">{FLIGHT.code}</span>
        <span className="text-navy">
          {FLIGHT.origin} <span className="text-muted">→</span> {FLIGHT.destination}
        </span>
        <span className="text-muted">{FLIGHT.capacity} seats</span>
        <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-muted">
            MARKET STRENGTH
          </span>
          <span className="font-medium tabular-nums text-navy">{marketStrength.toFixed(2)}</span>
          <button
            type="button"
            onClick={onRandomizeStrength}
            title="Randomize market strength"
            aria-label="Randomize market strength"
            className="inline-flex translate-y-[1px] items-center text-muted transition-colors hover:text-navy"
          >
            <RandomizeIcon />
          </button>
          {strengthPending ? (
            <span className="text-[10px] font-medium tracking-[0.12em] text-gold">Pending reset</span>
          ) : null}
        </span>
      </div>
    </header>
  );
}

function RandomizeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M13.1 8.2a5.1 5.1 0 1 1-1.35-3.45" strokeLinecap="round" />
      <path d="M11.1 2.7h2.5V5.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
