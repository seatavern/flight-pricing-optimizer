import { DemandChart } from "@/components/DemandChart";
import { periodLabel as formatPeriod } from "@/lib/constants";
import type { FareKind } from "@/lib/types";

type DemandPanelProps = {
  period: number;
  trueMarketMean: number | null;
  mlPredictedMean: number | null;
  selectedFare: number | null;
  fareKind: FareKind;
  realizedBookings: number | null;
  showMlMean: boolean;
  sampling?: boolean;
};

export function DemandPanel({
  period,
  trueMarketMean,
  mlPredictedMean,
  selectedFare,
  fareKind,
  realizedBookings,
  showMlMean,
  sampling = false,
}: DemandPanelProps) {
  const demandPeriod = formatPeriod(period);
  const fareLabel =
    fareKind === "myopic" ? "MYOPIC FARE" : fareKind === "optimized" ? "OPTIMIZED FARE" : "FIXED FARE";

  return (
    <section>
      <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">
        DEMAND DURING {demandPeriod}
      </h2>
      <p className="mt-1 text-[11px] leading-4 text-muted-2 whitespace-nowrap">
        Synthetic experiment: The true market process is hidden from the ML model. The model learns demand from observed bookings, fares, and flight state.
      </p>
      <div className="mt-2 grid grid-cols-3 items-start gap-4">
        <MeanBlock value={trueMarketMean} label="TRUE MARKET MEAN" />
        {showMlMean ? (
          <MeanBlock value={mlPredictedMean} label="ML PREDICTED MEAN" />
        ) : (
          <RealizedBookingsBlock realizedBookings={realizedBookings} sampling={sampling} />
        )}
        {showMlMean ? (
          <RealizedBookingsBlock realizedBookings={realizedBookings} sampling={sampling} />
        ) : (
          <div className="text-right">
            <p className="flex h-[30px] items-end justify-end">
              <span className="text-[30px] font-medium leading-none tabular-nums text-navy">
                {selectedFare === null ? "—" : `$${selectedFare}`}
              </span>
            </p>
            <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
              {fareLabel}
            </p>
          </div>
        )}
      </div>
      {trueMarketMean === null ? null : (
        <DemandChart
          period={period}
          mu={trueMarketMean}
          mlPredictedMean={showMlMean ? mlPredictedMean : null}
          realizedBookings={sampling ? null : realizedBookings}
          sampling={sampling}
        />
      )}
    </section>
  );
}

function RealizedBookingsBlock({
  realizedBookings,
  sampling,
}: {
  realizedBookings: number | null;
  sampling: boolean;
}) {
  return (
    <div>
      <p className="flex h-[30px] items-end">
        {sampling ? (
          <span className="text-[15px] font-semibold tracking-[0.14em] text-gold">SAMPLING…</span>
        ) : realizedBookings === null ? (
          <span className="text-[22px] font-medium leading-none text-gold">—</span>
        ) : (
          <span className="realized-appear text-[30px] font-medium leading-none tabular-nums text-gold">
            {realizedBookings}
          </span>
        )}
      </p>
      <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
        REALIZED BOOKINGS
      </p>
    </div>
  );
}

function MeanBlock({ value, label }: { value: number | null; label: string }) {
  return (
    <div>
      <p className="flex h-[30px] items-end">
        {value === null ? (
          <span className="text-[22px] font-medium leading-none text-navy">—</span>
        ) : (
          <span className="text-[30px] font-medium leading-none tabular-nums text-navy">
            {value.toFixed(1)}
          </span>
        )}
      </p>
      <p className="mt-2 text-[10px] font-medium tracking-[0.14em] text-muted">
        {label}
      </p>
    </div>
  );
}
