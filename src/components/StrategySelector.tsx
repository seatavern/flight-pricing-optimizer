import type { PricingStrategy } from "@/lib/types";

type StrategySelectorProps = {
  strategy: PricingStrategy;
  onChange: (strategy: PricingStrategy) => void;
  disabled?: boolean;
};

const OPTIONS: Array<{
  id: PricingStrategy;
  label: string;
}> = [
  { id: "fixed", label: "FIXED FARE" },
  { id: "myopic", label: "MYOPIC" },
  { id: "optimized", label: "OPTIMIZED" },
];

export function StrategySelector({ strategy, onChange, disabled = false }: StrategySelectorProps) {
  return (
    <div>
      <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">
        PRICING STRATEGY
      </h2>
      <div className="mt-3 flex gap-2">
        {OPTIONS.map((option) => {
          const selected = option.id === strategy;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={
                selected
                  ? "flex min-w-[138px] items-center justify-center bg-navy px-5 py-2.5 text-[11px] font-semibold tracking-[0.16em] text-white disabled:cursor-not-allowed"
                  : "flex min-w-[138px] items-center justify-center border border-line bg-panel px-5 py-2.5 text-[11px] font-semibold tracking-[0.16em] text-navy transition-colors hover:border-navy/40 disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
