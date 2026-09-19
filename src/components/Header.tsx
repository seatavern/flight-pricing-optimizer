import { FLIGHT } from "@/lib/constants";

export function Header() {
  return (
    <header className="flex items-baseline justify-between gap-6">
      <div className="flex items-baseline gap-4">
        <p className="text-[13px] font-semibold tracking-[0.18em] text-navy">
          FLIGHT OPTIMIZER
        </p>
        <p className="text-[15px] font-normal text-muted">Flight Simulator</p>
      </div>
      <div className="flex items-baseline gap-6 text-[13px] tracking-wide">
        <span className="font-semibold text-navy">{FLIGHT.code}</span>
        <span className="text-navy">
          {FLIGHT.origin} <span className="text-muted">→</span> {FLIGHT.destination}
        </span>
        <span className="text-muted">{FLIGHT.capacity} seats</span>
      </div>
    </header>
  );
}
