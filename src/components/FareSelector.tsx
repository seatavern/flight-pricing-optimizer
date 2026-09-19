import { FARES, type Fare } from "@/lib/constants";

type FareSelectorProps = {
  period: number;
  selectedFare: Fare;
  onChange: (fare: Fare) => void;
  disabled?: boolean;
};

export function FareSelector({ period, selectedFare, onChange, disabled = false }: FareSelectorProps) {
  return (
    <div className="mt-5">
      <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
        FARE FOR CURRENT PERIOD · {period === 0 ? "T-0" : `T-${period}`}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {FARES.map((fare) => {
          const selected = fare === selectedFare;
          return (
            <button
              key={fare}
              type="button"
              disabled={disabled}
              onClick={() => onChange(fare)}
              className={
                    selected
                      ? "min-w-[58px] bg-navy px-2.5 py-2 text-white disabled:cursor-not-allowed"
                      : "min-w-[58px] border border-line bg-panel px-2.5 py-2 text-navy transition-colors hover:border-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              <span className="block text-[15px] font-medium tabular-nums">${fare}</span>
              {selected ? (
                <span className="mt-0.5 block text-[8px] font-semibold tracking-[0.18em] text-white/80">
                  FIXED
                </span>
              ) : (
                <span className="mt-0.5 block text-[8px] tracking-[0.18em] text-transparent">
                  FIXED
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 max-w-xl text-[13px] leading-5 text-muted">
        Select the fixed fare for the flight.
      </p>
    </div>
  );
}
