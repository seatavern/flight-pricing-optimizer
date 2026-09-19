import { periodLabel, TIMELINE_PERIODS } from "@/lib/constants";

type TimelineProps = {
  currentPeriod: number;
  livePeriod: number;
};

export function Timeline({ currentPeriod, livePeriod }: TimelineProps) {
  return (
    <ol className="flex items-start">
      {TIMELINE_PERIODS.map((period, index) => {
        const isCurrent = period === currentPeriod;
        const isCompleted = period > livePeriod;
        const isLast = index === TIMELINE_PERIODS.length - 1;

        return (
          <li key={period} className="flex min-w-0 flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center">
              <span
                className={
                  isCurrent
                    ? "h-[15px] w-[15px] rounded-full bg-navy"
                    : isCompleted
                      ? "mt-[2px] h-[11px] w-[11px] rounded-full bg-navy/50"
                      : "mt-[2px] h-[11px] w-[11px] rounded-full border border-muted-2 bg-page"
                }
              />
              <span
                className={
                  isCurrent
                    ? "mt-2 text-[11px] font-semibold tracking-wide text-navy"
                    : "mt-2 text-[11px] tracking-wide text-muted-2"
                }
              >
                {periodLabel(period)}
              </span>
            </div>
            {isLast ? null : <div className="mt-[7px] h-px min-w-4 flex-1 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}
