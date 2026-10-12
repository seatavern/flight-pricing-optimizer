import { offeredFareLabel } from "@/lib/offeredFare";

type FlightMetricsProps = {
  period: number;
  seatsSold: string;
  remaining: string;
  loadFactor: string;
  revenue: string;
  selectedFare: number | null;
  soldOut?: boolean;
  fareLabel: string;
  seatsSoldDelta?: number | null;
  remainingDelta?: number | null;
  loadFactorDelta?: number | null;
  revenueDelta?: number | null;
};

function Metric({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="relative w-fit">
        <p className="text-[30px] font-medium leading-none tracking-tight tabular-nums text-navy">
          {value}
        </p>
        {accent ? (
          <p className="metric-delta absolute top-[0.4em] left-full ml-1.5 whitespace-nowrap text-[15px] font-medium tabular-nums text-gold">
            {accent}
          </p>
        ) : null}
      </div>
      <p className="mt-2 whitespace-nowrap text-[10px] font-medium tracking-[0.16em] text-muted">
        {label}
      </p>
    </div>
  );
}

function formatDelta(delta: number | null | undefined, money = false, suffix = "") {
  if (delta == null || delta === 0) return null;
  if (money) {
    return `${delta > 0 ? "+" : "-"}$${Math.abs(delta)}`;
  }
  return `${delta > 0 ? "+" : ""}${delta}${suffix}`;
}

export function FlightMetrics({
  period,
  seatsSold,
  remaining,
  loadFactor,
  revenue,
  selectedFare,
  soldOut = false,
  fareLabel,
  seatsSoldDelta = null,
  remainingDelta = null,
  loadFactorDelta = null,
  revenueDelta = null,
}: FlightMetricsProps) {
  const periodCopy =
    period === 0
      ? "Departure"
      : `${period} period${period === 1 ? "" : "s"} to departure`;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-12">
      <div className="w-[11.5rem] min-w-[11.5rem] shrink-0">
        <p className="text-[42px] font-medium leading-none tracking-tight tabular-nums text-navy">
          T-<span className="inline-block w-[2ch]">{period}</span>
        </p>
        <p className="mt-2 text-[13px] text-muted">{periodCopy}</p>
        <p className="mt-0.5 text-[12px] text-muted-2">
          {period === 0 ? "Flight departed" : "Current selling period"}
        </p>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 items-start gap-x-4 gap-y-4 pt-1 sm:grid-cols-3 xl:grid-cols-5">
        <Metric value={seatsSold} label="SEATS SOLD" accent={formatDelta(seatsSoldDelta)} />
        <Metric value={remaining} label="REMAINING" accent={formatDelta(remainingDelta)} />
        <Metric
          value={loadFactor}
          label="LOAD FACTOR"
          accent={formatDelta(loadFactorDelta, false, "%")}
        />
        <Metric
          value={revenue}
          label="REVENUE"
          accent={formatDelta(revenueDelta, true)}
        />
        <Metric
          value={offeredFareLabel(selectedFare, soldOut)}
          label={fareLabel}
        />
      </div>
    </div>
  );
}
