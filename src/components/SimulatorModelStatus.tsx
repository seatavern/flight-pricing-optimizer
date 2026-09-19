import Link from "next/link";
import type { PricingStrategy } from "@/lib/types";
import type { ModelStatus } from "@/lib/modelApi";

type SimulatorModelStatusProps = {
  strategy: PricingStrategy;
  status: ModelStatus;
  error: string | null;
  optimizedFare?: number | null;
  immediateExpectedRevenue?: number | null;
  futureValue?: number | null;
  totalValue?: number | null;
};

function formatInt(value: number): string {
  const digits = String(Math.abs(value));
  const parts: string[] = [];
  for (let index = digits.length; index > 0; index -= 3) {
    parts.unshift(digits.slice(Math.max(0, index - 3), index));
  }
  return parts.join(",");
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

export function SimulatorModelStatus({
  strategy,
  status,
  error,
  optimizedFare = null,
  immediateExpectedRevenue = null,
  futureValue = null,
  totalValue = null,
}: SimulatorModelStatusProps) {
  const showOptimizedDetails = strategy === "optimized" && status.status === "ready";
  const showDemandModelBox = strategy !== "fixed";
  if (!showOptimizedDetails && !showDemandModelBox && !error) return null;

  return (
    <div className="mt-4">
      {showOptimizedDetails ? (
        <div className="mb-4 max-w-xs">
          <p className="text-[24px] font-medium leading-none tabular-nums text-navy">
            {optimizedFare === null ? "—" : `$${optimizedFare}`}
          </p>
          <p className="mt-1.5 text-[10px] font-medium tracking-[0.14em] text-muted">
            OPTIMIZED FARE
          </p>
          <dl className="mt-2 space-y-0.5 text-[12px] leading-5 text-navy">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">Immediate expected revenue</dt>
              <dd className="tabular-nums">{formatMoney(immediateExpectedRevenue)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">Future value</dt>
              <dd className="tabular-nums">{formatMoney(futureValue)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">Total expected value</dt>
              <dd className="tabular-nums">{formatMoney(totalValue)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {showDemandModelBox ? (
        <div className="border border-line bg-panel px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted">DEMAND MODEL</p>
          {status.status === "ready" ? (
            <>
              <p className="mt-2 text-[13px] text-navy">HistGradientBoosting</p>
              <p className="text-[13px] tabular-nums text-navy">
                {formatInt(status.n_flights)} flights
              </p>
              <p className="text-[13px] tabular-nums text-navy">
                {formatInt(status.n_observations)} observations (10 periods per flight)
              </p>
              <p className="mt-1 text-[11px] font-medium tracking-[0.14em] text-muted">Ready</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] font-medium text-navy">NO ACTIVE DEMAND MODEL</p>
              <p className="mt-1 text-[12px] leading-5 text-muted">
                Train a model in Model Lab to use Myopic or Optimized pricing.
              </p>
              <Link
                href="/model-lab"
                className="mt-2 inline-block text-[11px] font-semibold tracking-[0.14em] text-navy hover:text-navy-deep"
              >
                OPEN MODEL LAB
              </Link>
            </>
          )}
        </div>
      ) : null}
      {error ? <p className="mt-2 max-w-xl text-[12px] leading-4 text-navy">{error}</p> : null}
    </div>
  );
}
