import {
  finalSyntheticEvaluation,
  type EvaluationStrategy,
} from "@/lib/finalSyntheticEvaluation";

const evalData = finalSyntheticEvaluation;
const NAVY = "#1b3a57";
const GOLD = "#c4a14a";
const MUTED = "#8b9aab";
const LINE = "#e6edf2";

function formatInt(value: number): string {
  const digits = String(Math.abs(Math.round(value)));
  const parts: string[] = [];
  for (let index = digits.length; index > 0; index -= 3) {
    parts.unshift(digits.slice(Math.max(0, index - 3), index));
  }
  return parts.join(",");
}

function money(value: number, signed = false): string {
  const rounded = Math.round(value);
  const abs = formatInt(rounded);
  if (rounded < 0) return `-$${abs}`;
  if (signed && rounded > 0) return `+$${abs}`;
  return `$${abs}`;
}

function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

function loadPct(value: number): string {
  return pct(100 * value, 1);
}

function strategyColor(kind: EvaluationStrategy["kind"]): string {
  if (kind === "optimized") return NAVY;
  if (kind === "myopic") return GOLD;
  return "#97b0c3";
}

export function SyntheticPolicyEvaluation() {
  const myopic = evalData.strategies.find((row) => row.kind === "myopic");
  const optimized = evalData.strategies.find((row) => row.kind === "optimized");
  const bestFixed = evalData.strategies
    .filter((row) => row.kind === "fixed")
    .reduce((best, row) => (row.meanRevenue > best.meanRevenue ? row : best));
  if (!myopic || !optimized) return null;
  const myopicFifty = evalData.fareUsage[0]?.myopic ?? 0;

  return (
    <section className="mt-5 border border-line bg-panel px-4 py-3">
      <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">
        SYNTHETIC POLICY EVALUATION
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        {formatInt(evalData.nFlights)} unseen synthetic flights · Evaluation seed{" "}
        {evalData.evaluationSeed}
      </p>
      <p className="mt-2 max-w-3xl text-[13px] leading-5 text-muted">
        Out-of-sample simulation using the frozen demand model and pricing policies.
      </p>

      <details className="mt-4 border border-line bg-page px-4 py-3">
        <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.16em] text-muted">
          EVALUATION SETUP
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] md:grid-cols-4">
          <Metric label="EVALUATION FLIGHTS" value={formatInt(evalData.nFlights)} />
          <Metric label="EVALUATION SEED" value={String(evalData.evaluationSeed)} />
          <Metric label="CAPACITY" value={String(evalData.capacity)} />
          <Metric label="SELLING PERIODS" value={String(evalData.nPeriods)} />
          <Metric label="FARE GRID" value="$50–$130 in $10 increments" />
          <Metric label="MODEL" value={evalData.modelName} />
          <Metric
            label="TRAINING"
            value={`${formatInt(evalData.trainingFlights)} flights · ${formatInt(evalData.trainingObservations)} obs · seed ${evalData.trainSeed}`}
          />
          <Metric
            label="HELD-OUT PREDICTION TEST"
            value={`${formatInt(evalData.testFlights)} flights · ${formatInt(evalData.testObservations)} obs · seed ${evalData.testSeed}`}
          />
        </dl>
        <ul className="mt-3 max-w-3xl space-y-1 text-[13px] leading-5 text-muted">
          <li>
            The same simulated flight conditions and random demand shocks are used across strategies,
            while demand still responds to the fare each strategy selects.
          </li>
          <li>
            Pricing policies never observe hidden market strength or true market mean. Hidden
            strength is simulator-only information.
          </li>
        </ul>
      </details>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <ResultCard
          label="MYOPIC"
          revenue={money(myopic.meanRevenue)}
          load={loadPct(myopic.meanLoadFactor)}
        />
        <ResultCard
          label="OPTIMIZED"
          revenue={money(optimized.meanRevenue)}
          load={loadPct(optimized.meanLoadFactor)}
        />
        <div className="border border-line bg-page px-4 py-3">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted">DIFFERENCE</p>
          <p className="mt-2 text-[22px] font-medium leading-none tabular-nums text-navy">
            {money(evalData.paired.mean, true)} / flight
          </p>
          <p className="mt-2 text-[15px] tabular-nums text-navy">{pct(evalData.paired.relativePct)}</p>
          <p className="mt-1 text-[12px] text-muted">Difference in mean revenue in this synthetic experiment</p>
          <p className="mt-2 text-[12px] tabular-nums text-navy">
            95% CI {money(evalData.paired.ci95[0], true)} to {money(evalData.paired.ci95[1], true)}
          </p>
        </div>
      </div>

      <div className="mt-4 border border-line bg-page px-4 py-3">
        <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
          WHY DOES MYOPIC STRUGGLE?
        </h3>
        <p className="mt-2 max-w-3xl text-[13px] leading-5 text-muted">
          Myopic pricing chooses the fare with the highest predicted revenue for the current period
          and ignores the future value of remaining seats. With $50 available, this often makes
          selling aggressively look attractive right now. Myopic selects $50 for {pct(myopicFifty)} of
          its pricing decisions. The optimized policy accounts for the opportunity cost of selling a
          seat today instead of keeping it available for later demand.
        </p>
        <p className="mt-3 text-center text-[12px] font-medium tracking-[0.08em] text-navy">
          GOOD DEMAND PREDICTION
          <span className="mt-1 block tracking-normal">+</span>
          MYOPIC OBJECTIVE
          <span className="mt-1 block font-sans tracking-normal" style={{ fontFamily: "Segoe UI, Arial, sans-serif" }}>
            ≠
          </span>
          GOOD LONG-HORIZON PRICING
        </p>
      </div>

      <div className="mt-5">
        <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
          MEAN REVENUE BY STRATEGY
        </h3>
        <RevenueBars strategies={evalData.strategies} />
        <p className="mt-2 max-w-3xl text-[13px] leading-5 text-muted">
          The strongest fixed-fare result in this evaluation was {bestFixed.name} at{" "}
          {money(bestFixed.meanRevenue)}. Myopic earned {money(myopic.meanRevenue)} despite dynamically
          changing fares. Re-optimizing every period does not guarantee better full-horizon results
          when the objective itself ignores future opportunity cost.
        </p>
      </div>

      <div className="mt-5">
        <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">FARE USAGE</h3>
        <FareUsageChart rows={evalData.fareUsage} />
        <p className="mt-2 text-[13px] leading-5 text-muted">
          Myopic selected $50 in {pct(myopicFifty)} of pricing decisions.
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <div>
          <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
            MEAN REMAINING SEATS
          </h3>
          <ChartLegend />
          <LineSeries
            labels={[...evalData.inventory.labels]}
            myopic={evalData.inventory.myopic}
            optimized={evalData.inventory.optimized}
            yMax={100}
          />
          <p className="mt-2 text-[13px] leading-5 text-muted">
            Myopic sells inventory substantially earlier. Optimized preserves more capacity for later
            periods, when selling a remaining seat may be more valuable. Preserving inventory is not
            always better.
          </p>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
            MEAN SELECTED FARE
          </h3>
          <p className="mt-1 text-[12px] text-muted">
            MEAN FARE ACROSS ACTUAL EVALUATION TRAJECTORIES
          </p>
          <ChartLegend />
          <LineSeries
            labels={[...evalData.meanFareByPeriod.labels]}
            myopic={evalData.meanFareByPeriod.myopic}
            optimized={evalData.meanFareByPeriod.optimized}
            yMax={130}
            moneyTicks
          />
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
          WHEN DOES OPTIMIZATION HELP?
        </h3>
        <p className="mt-1 text-[12px] font-medium tracking-[0.08em] text-navy">
          HIDDEN SYNTHETIC MARKET STRENGTH
        </p>
        <p className="mt-1 text-[12px] text-muted">
          Evaluation diagnostic only — never observed by either pricing policy
        </p>
        <p className="mt-2 text-[11px] font-semibold tracking-[0.16em] text-muted">
          MEAN REVENUE BY STRENGTH BIN
        </p>
        <ChartLegend />
        <StrengthChart bins={evalData.strengthBins} />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="text-[10px] font-semibold tracking-[0.12em] text-muted">
                <th className="py-1">STRENGTH</th>
                <th className="py-1 text-right">N</th>
                <th className="py-1 text-right">MYOPIC REV</th>
                <th className="py-1 text-right">OPTIMIZED REV</th>
                <th className="py-1 text-right">DIFFERENCE</th>
              </tr>
            </thead>
            <tbody>
              {evalData.strengthBins.map((bin) => (
                <tr key={bin.group} className="border-t border-line text-navy">
                  <td className="py-1.5 tabular-nums">{bin.group}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatInt(bin.n)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(bin.myopicRevenue)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(bin.optimizedRevenue)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(bin.difference, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-5 text-muted">
          In the weakest synthetic markets, protecting inventory can leave seats unsold and Optimized
          performs slightly worse. As market strength increases, the opportunity cost of selling
          seats cheaply early becomes much larger.
        </p>
      </div>

      <div className="mt-4 border border-line bg-page px-4 py-3">
        <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
          HIGHER LOAD FACTOR <span className="font-sans" style={{ fontFamily: "Segoe UI, Arial, sans-serif" }}>≠</span>{" "}
          HIGHER REVENUE
        </h3>
        <p className="mt-2 text-[13px] text-navy">
          Myopic: {loadPct(myopic.meanLoadFactor)} load factor · {money(myopic.meanRevenue)} mean
          revenue
        </p>
        <p className="text-[13px] text-navy">
          Optimized: {loadPct(optimized.meanLoadFactor)} load factor · {money(optimized.meanRevenue)}{" "}
          mean revenue
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-5 text-muted">
          Filling more seats is not the objective. Revenue depends on both how many seats are sold
          and the fares at which they are sold.
        </p>
      </div>

      <details className="mt-4 border border-line bg-page px-4 py-3">
        <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.16em] text-muted">
          PAIRED COMPARISON DETAILS
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] md:grid-cols-4">
          <Metric label="MEAN DIFFERENCE" value={money(evalData.paired.mean, true)} />
          <Metric label="MEDIAN DIFFERENCE" value={money(evalData.paired.median, true)} />
          <Metric label="SD" value={money(evalData.paired.std)} />
          <Metric label="P5" value={money(evalData.paired.p5, true)} />
          <Metric label="P25" value={money(evalData.paired.p25, true)} />
          <Metric label="P75" value={money(evalData.paired.p75, true)} />
          <Metric label="P95" value={money(evalData.paired.p95, true)} />
          <Metric label="OPTIMIZED > MYOPIC" value={pct(evalData.paired.pctOptimizedGt, 2)} />
          <Metric label="EQUAL" value={pct(evalData.paired.pctEqual, 2)} />
          <Metric label="MYOPIC > OPTIMIZED" value={pct(evalData.paired.pctMyopicGt, 2)} />
          <Metric
            label="95% CI"
            value={`${money(evalData.paired.ci95[0], true)} to ${money(evalData.paired.ci95[1], true)}`}
          />
        </dl>
        <p className="mt-3 max-w-3xl text-[13px] leading-5 text-muted">
          Because every policy was evaluated on matched synthetic flights, uncertainty is calculated
          from flight-level Optimized − Myopic revenue differences.
        </p>
      </details>

      <div className="mt-4 border border-line bg-page px-4 py-3">
        <h3 className="text-[11px] font-semibold tracking-[0.16em] text-muted">
          WHAT THIS EXPERIMENT DEMONSTRATES
        </h3>
        <ul className="mt-2 max-w-3xl space-y-1 text-[13px] leading-5 text-muted">
          <li>ML estimates demand from the observable flight state and candidate fare.</li>
          <li>A pricing policy turns those demand predictions into pricing decisions.</li>
          <li>
            Myopic pricing maximizes immediate expected revenue, without considering future selling
            opportunities.
          </li>
          <li>Dynamic optimization also accounts for the future value of remaining seats.</li>
          <li>
            Good demand predictions do not guarantee good pricing decisions if the objective is too
            short-sighted.
          </li>
        </ul>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-navy">{value}</dd>
    </div>
  );
}

function ResultCard({ label, revenue, load }: { label: string; revenue: string; load: string }) {
  return (
    <div className="border border-line bg-page px-4 py-3">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 text-[22px] font-medium leading-none tabular-nums text-navy">{revenue}</p>
      <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">MEAN REVENUE</p>
      <p className="mt-3 text-[15px] tabular-nums text-navy">{load}</p>
      <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">MEAN LOAD FACTOR</p>
    </div>
  );
}

function RevenueBars({ strategies }: { strategies: readonly EvaluationStrategy[] }) {
  const width = 720;
  const rowH = 18;
  const pad = { top: 8, right: 56, bottom: 8, left: 92 };
  const height = pad.top + pad.bottom + strategies.length * rowH;
  const innerW = width - pad.left - pad.right;
  const maxRev = Math.max(...strategies.map((row) => row.meanRevenue));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full" role="img" aria-label="Mean revenue by strategy">
      {strategies.map((row, index) => {
        const y = pad.top + index * rowH;
        const barW = (row.meanRevenue / maxRev) * innerW;
        return (
          <g key={row.name}>
            <text x={pad.left - 8} y={y + 12} textAnchor="end" fill={MUTED} fontSize="10">
              {row.name}
            </text>
            <rect x={pad.left} y={y + 4} width={barW} height={10} fill={strategyColor(row.kind)} />
            <text x={pad.left + barW + 6} y={y + 12} fill={NAVY} fontSize="10">
              {money(row.meanRevenue)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function FareUsageChart({
  rows,
}: {
  rows: readonly { fare: number; myopic: number; optimized: number }[];
}) {
  const width = 720;
  const height = 200;
  const pad = { top: 18, right: 12, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const groupW = innerW / rows.length;
  const yMax = 80;
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH;

  return (
    <div className="mt-2">
      <ChartLegend />
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-auto w-full" role="img" aria-label="Fare usage">
        {[0, 25, 50, 75].map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke={LINE} />
            <text x={pad.left - 4} y={yAt(tick) + 3} textAnchor="end" fill={MUTED} fontSize="9">
              {tick}%
            </text>
          </g>
        ))}
        {rows.map((row, index) => {
          const x = pad.left + index * groupW;
          const barW = groupW * 0.32;
          return (
            <g key={row.fare}>
              <rect
                x={x + groupW * 0.14}
                y={yAt(row.myopic)}
                width={barW}
                height={Math.max(0, pad.top + innerH - yAt(row.myopic))}
                fill={GOLD}
              />
              <rect
                x={x + groupW * 0.5}
                y={yAt(row.optimized)}
                width={barW}
                height={Math.max(0, pad.top + innerH - yAt(row.optimized))}
                fill={NAVY}
              />
              <text x={x + groupW / 2} y={height - 8} textAnchor="middle" fill={MUTED} fontSize="10">
                ${row.fare}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChartLegend() {
  return (
    <p className="mt-1 text-[10px] tracking-[0.12em] text-muted">
      <span className="mr-3 inline-block">
        <span className="mr-1 inline-block h-2 w-2 align-middle" style={{ background: GOLD }} /> MYOPIC
      </span>
      <span className="inline-block">
        <span className="mr-1 inline-block h-2 w-2 align-middle" style={{ background: NAVY }} /> OPTIMIZED
      </span>
    </p>
  );
}

function LineSeries({
  labels,
  myopic,
  optimized,
  yMax,
  moneyTicks = false,
}: {
  labels: string[];
  myopic: readonly number[];
  optimized: readonly number[];
  yMax: number;
  moneyTicks?: boolean;
}) {
  const width = 720;
  const height = 176;
  const pad = { top: 12, right: 56, bottom: 32, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xAt = (index: number) => pad.left + (index / Math.max(labels.length - 1, 1)) * innerW;
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH;
  function path(values: readonly number[]): string {
    return values
      .map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`)
      .join(" ");
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full overflow-visible">
      {[0, yMax / 2, yMax].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke={LINE} />
          <text x={pad.left - 4} y={yAt(tick) + 3} textAnchor="end" fill={MUTED} fontSize="10">
            {moneyTicks ? `$${Math.round(tick)}` : String(Math.round(tick))}
          </text>
        </g>
      ))}
      <path d={path(myopic)} fill="none" stroke={GOLD} strokeWidth="1.5" />
      <path d={path(optimized)} fill="none" stroke={NAVY} strokeWidth="1.5" />
      {labels.map((label, index) => {
        const isFirst = index === 0;
        const isLast = index === labels.length - 1;
        return (
          <text
            key={label}
            x={xAt(index)}
            y={height - 8}
            textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
            fill={MUTED}
            fontSize="9"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function StrengthChart({
  bins,
}: {
  bins: readonly {
    group: string;
    myopicRevenue: number;
    optimizedRevenue: number;
  }[];
}) {
  const width = 720;
  const height = 168;
  const pad = { top: 12, right: 12, bottom: 28, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const rawMax = Math.max(...bins.flatMap((bin) => [bin.myopicRevenue, bin.optimizedRevenue]));
  const yMax = Math.max(1000, Math.ceil(rawMax / 1000) * 1000);
  const groupW = innerW / bins.length;
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH;
  const ticks = [0, yMax / 2, yMax];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full overflow-visible" role="img" aria-label="Mean revenue by hidden synthetic market strength">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke={LINE} />
          <text x={pad.left - 4} y={yAt(tick) + 3} textAnchor="end" fill={MUTED} fontSize="9">
            {money(tick)}
          </text>
        </g>
      ))}
      {bins.map((bin, index) => {
        const x = pad.left + index * groupW;
        const barW = groupW * 0.28;
        return (
          <g key={bin.group}>
            <rect
              x={x + groupW * 0.18}
              y={yAt(bin.myopicRevenue)}
              width={barW}
              height={Math.max(0, pad.top + innerH - yAt(bin.myopicRevenue))}
              fill={GOLD}
            />
            <rect
              x={x + groupW * 0.5}
              y={yAt(bin.optimizedRevenue)}
              width={barW}
              height={Math.max(0, pad.top + innerH - yAt(bin.optimizedRevenue))}
              fill={NAVY}
            />
            <text x={x + groupW / 2} y={height - 8} textAnchor="middle" fill={MUTED} fontSize="10">
              {bin.group}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
