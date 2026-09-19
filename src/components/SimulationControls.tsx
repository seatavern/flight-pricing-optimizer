import { periodLabel } from "@/lib/constants";

type SimulationControlsProps = {
  period: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  canSimulate: boolean;
  canReset?: boolean;
  onPrevious: () => void;
  onSimulate: () => void;
  onNext: () => void;
  onReset: () => void;
};

export function SimulationControls({
  period,
  canGoPrevious,
  canGoNext,
  canSimulate,
  canReset = true,
  onPrevious,
  onSimulate,
  onNext,
  onReset,
}: SimulationControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-5 pt-1">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="text-[11px] font-medium tracking-[0.14em] text-muted transition-colors hover:text-navy disabled:cursor-not-allowed disabled:text-muted-2"
        >
          ‹‹ PREVIOUS
        </button>
        <button
          type="button"
          onClick={onSimulate}
          disabled={!canSimulate}
          className="grid bg-navy px-3.5 py-2 text-[11px] font-semibold tracking-[0.12em] text-white transition-colors hover:bg-navy-deep disabled:cursor-not-allowed disabled:bg-muted-2"
        >
          <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden="true">
            SIMULATE T-10
          </span>
          <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden="true">
            SIMULATE Departure
          </span>
          <span className="col-start-1 row-start-1 whitespace-nowrap tabular-nums">
            SIMULATE {periodLabel(period)}
          </span>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className="text-[11px] font-medium tracking-[0.14em] text-muted transition-colors hover:text-navy disabled:cursor-not-allowed disabled:text-muted-2"
        >
          NEXT ››
        </button>
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={!canReset}
        className="text-[11px] font-semibold tracking-[0.16em] text-navy transition-colors hover:text-navy-deep disabled:cursor-not-allowed disabled:text-muted-2"
      >
        RESET
      </button>
    </div>
  );
}
