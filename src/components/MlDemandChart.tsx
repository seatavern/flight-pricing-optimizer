import { poissonCappedPmfs, poissonSupportMax } from "@/lib/poisson";

type MlDemandChartProps = {
  predictedMean: number;
  remainingSeats: number;
  periodLabel: string;
};

export function MlDemandChart({
  predictedMean,
  remainingSeats,
  periodLabel,
}: MlDemandChartProps) {
  const unconstrainedMax = poissonSupportMax(predictedMean);
  const binds = remainingSeats >= 0 && unconstrainedMax > remainingSeats;
  const maxK = binds ? remainingSeats : Math.max(unconstrainedMax, 8);
  const pmf =
    remainingSeats <= 0
      ? [1]
      : binds
        ? poissonCappedPmfs(predictedMean, remainingSeats)
        : poissonCappedPmfs(predictedMean, maxK).slice(0, maxK + 1);
  const peak = Math.max(...pmf, 0);
  const yMax = Math.max(0.12, Math.ceil(peak * 20) / 20);
  const width = 640;
  const height = 168;
  const pad = { top: 18, right: 8, bottom: 36, left: 42 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / Math.max(pmf.length, 1);
  const barW = slot * 0.8;
  const ticks = yMax <= 0.12 ? [0, 0.05, 0.1] : [0, yMax / 2, yMax];
  const yAt = (p: number) => pad.top + innerH - (p / yMax) * innerH;
  const xAt = (k: number) => pad.left + k * slot + slot / 2;
  const tickStep = maxK <= 18 ? 2 : maxK <= 36 ? 4 : maxK <= 60 ? 5 : 10;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-1 h-auto w-full font-sans"
      role="img"
      aria-label={`ML predicted Poisson demand during ${periodLabel}`}
    >
      <text
        x={width - pad.right}
        y={12}
        textAnchor="end"
        fill="currentColor"
        className="text-muted-2"
        fontSize="9"
        letterSpacing="1.2"
      >
        {binds ? "Q = MIN(D, REMAINING SEATS)" : "D ~ POISSON(ML MEAN)"}
      </text>
      {ticks.map((tick) => (
        <text
          key={tick}
          x={pad.left - 8}
          y={yAt(tick) + 3}
          textAnchor="end"
          fill="currentColor"
          className="text-muted"
          fontSize="10"
        >
          {`${Math.round(tick * 100)}%`}
        </text>
      ))}
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={yAt(0)}
        y2={yAt(0)}
        stroke="#cfd8e1"
        strokeWidth="1"
      />
      {pmf.map((probability, k) => {
        const barH = Math.max((probability / yMax) * innerH, 0);
        const x = pad.left + k * slot + (slot - barW) / 2;
        const isTail = binds && k === remainingSeats;
        return (
          <rect
            key={k}
            x={x}
            y={yAt(0) - barH}
            width={barW}
            height={barH}
            fill={isTail ? "#c4a14a" : "#1b3a57"}
          />
        );
      })}
      {Array.from({ length: Math.floor(maxK / tickStep) + 1 }, (_, i) => i * tickStep).map((k) => (
        <text
          key={`tick-${k}`}
          x={xAt(k)}
          y={height - 18}
          textAnchor="middle"
          fill="currentColor"
          className="text-muted"
          fontSize="10"
        >
          {k}
        </text>
      ))}
      <text
        x={pad.left + innerW / 2}
        y={height - 4}
        textAnchor="middle"
        fill="currentColor"
        className="text-muted"
        fontSize="11"
      >
        {binds ? `Bookings Q during ${periodLabel}` : `Latent demand D during ${periodLabel}`}
      </text>
    </svg>
  );
}
