"use client";

import { useState } from "react";
import { LearnedDemand } from "@/components/LearnedDemand";
import { SyntheticPolicyEvaluation } from "@/components/SyntheticPolicyEvaluation";
import {
  DEFAULT_TRAINING_FLIGHTS,
  TEST_N_FLIGHTS,
  TEST_N_OBSERVATIONS,
  TEST_SEED,
  TRAIN_SEED,
  TRAINING_FLIGHT_OPTIONS,
  observationCount,
  trainDemandModel,
  type ModelStatusReady,
  type TrainingFlights,
} from "@/lib/modelApi";
import { useDemandModel } from "@/lib/useDemandModel";

type SessionRun = {
  n_flights: number;
  n_observations: number;
  mae: number;
  rmse: number;
  training_time_seconds: number;
};

let sessionRuns: SessionRun[] = [];

function formatInt(value: number): string {
  const digits = String(Math.abs(Math.round(value)));
  const parts: string[] = [];
  for (let index = digits.length; index > 0; index -= 3) {
    parts.unshift(digits.slice(Math.max(0, index - 3), index));
  }
  return parts.join(",");
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}

function formatTime(value: number): string {
  return `${value.toFixed(2)} s`;
}

function toRun(status: ModelStatusReady): SessionRun {
  return {
    n_flights: status.n_flights,
    n_observations: status.n_observations,
    mae: status.mae,
    rmse: status.rmse,
    training_time_seconds: status.training_time_seconds,
  };
}

export function ModelLab() {
  const demandModel = useDemandModel();
  const [nFlights, setNFlights] = useState<TrainingFlights>(DEFAULT_TRAINING_FLIGHTS);
  const [isTraining, setIsTraining] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionRun[]>(sessionRuns);
  const status = demandModel.status;

  async function handleTrain() {
    if (isTraining) return;
    setIsTraining(true);
    setTrainError(null);
    try {
      const next = await trainDemandModel(nFlights);
      demandModel.applyStatus(next);
      const run = toRun(next);
      sessionRuns = [...sessionRuns, run];
      setHistory(sessionRuns);
    } catch (caught: unknown) {
      setTrainError(caught instanceof Error ? caught.message : "Training failed.");
    } finally {
      setIsTraining(false);
    }
  }

  return (
    <div className="px-6 py-4 lg:px-10">
      <header className="flex items-baseline justify-between gap-6">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.18em] text-navy">FLIGHT OPTIMIZER</p>
          <p className="mt-0.5 text-[15px] text-muted">Model Lab</p>
        </div>
        <p className="text-[13px] text-muted">Active demand model for the pricing system</p>
      </header>

      <section className="mt-5 border border-line bg-panel px-4 py-3">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">ACTIVE MODEL</h2>
        {status.status === "ready" ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
            <Metric label="MODEL" value="HistGradientBoostingRegressor" />
            <Metric label="TRAINING FLIGHTS" value={formatInt(status.n_flights)} />
            <Metric label="TRAINING OBSERVATIONS" value={formatInt(status.n_observations)} />
            <Metric label="TEST OBSERVATIONS" value={formatInt(TEST_N_OBSERVATIONS)} />
            <Metric label="MAE" value={formatMetric(status.mae)} />
            <Metric label="RMSE" value={formatMetric(status.rmse)} />
            <Metric label="STATUS" value="Ready" />
            <Metric label="TRAINING TIME" value={formatTime(status.training_time_seconds)} />
            <Metric label="TRAIN SEED" value={String(TRAIN_SEED)} />
            <Metric label="TEST SEED" value={String(TEST_SEED)} />
          </dl>
        ) : (
          <p className="mt-3 text-[15px] font-medium text-navy">NO ACTIVE MODEL</p>
        )}
        <p className="mt-3 text-[12px] leading-5 text-muted">
          Model Lab trains the single active demand model used by Flight Simulator, Decision
          Explorer, and Policy Map. Seed is not a model feature.
        </p>
      </section>

      <section className="mt-4 border border-line bg-panel px-4 py-3">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">TRAIN MODEL</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TRAINING_FLIGHT_OPTIONS.map((option) => {
            const selected = option === nFlights;
            return (
              <button
                key={option}
                type="button"
                disabled={isTraining}
                onClick={() => setNFlights(option)}
                className={
                  selected
                    ? "min-w-[88px] bg-navy px-3 py-2 text-[13px] font-medium tabular-nums text-white disabled:cursor-not-allowed"
                    : "min-w-[88px] border border-line bg-page px-3 py-2 text-[13px] font-medium tabular-nums text-navy hover:border-navy/40 disabled:cursor-not-allowed"
                }
              >
                {formatInt(option)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] tabular-nums text-muted">
          {formatInt(nFlights)} flights → {formatInt(observationCount(nFlights))} observations
        </p>
        <button
          type="button"
          onClick={() => void handleTrain()}
          disabled={isTraining}
          className="mt-3 bg-navy px-3.5 py-2 text-[11px] font-semibold tracking-[0.12em] text-white hover:bg-navy-deep disabled:cursor-not-allowed disabled:bg-muted-2"
        >
          {isTraining ? "TRAINING..." : "TRAIN MODEL"}
        </button>
        {trainError ? <p className="mt-2 text-[12px] text-navy">{trainError}</p> : null}
      </section>

      <section className="mt-4 border border-line bg-panel px-4 py-3">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">MODEL PERFORMANCE</h2>
        <p className="mt-2 text-[11px] font-semibold tracking-[0.14em] text-muted">
          HELD-OUT TEST SET
        </p>
        <p className="mt-1 text-[13px] tabular-nums text-navy">
          {formatInt(TEST_N_FLIGHTS)} flights · {formatInt(TEST_N_OBSERVATIONS)} observations · seed{" "}
          {TEST_SEED}
        </p>
        {status.status === "ready" ? (
          <div className="mt-3 flex flex-wrap gap-10">
            <div>
              <p className="text-[26px] font-medium leading-none tabular-nums text-navy">
                {formatMetric(status.mae)}
              </p>
              <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">MAE</p>
            </div>
            <div>
              <p className="text-[26px] font-medium leading-none tabular-nums text-navy">
                {formatMetric(status.rmse)}
              </p>
              <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-muted">RMSE</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-muted">Train a model to see held-out test error.</p>
        )}
        <p className="mt-3 text-[13px] leading-5 text-muted">
          MAE and RMSE measure prediction error on synthetic flights not used for training.
        </p>
        {history.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="text-[10px] font-semibold tracking-[0.12em] text-muted">
                  <th className="py-1">TRAINING FLIGHTS</th>
                  <th className="py-1 text-right">OBSERVATIONS</th>
                  <th className="py-1 text-right">MAE</th>
                  <th className="py-1 text-right">RMSE</th>
                  <th className="py-1 text-right">TRAINING TIME</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run, index) => (
                  <tr key={`${run.n_flights}-${index}`} className="border-t border-line text-navy">
                    <td className="py-1.5 tabular-nums">{formatInt(run.n_flights)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatInt(run.n_observations)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatMetric(run.mae)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatMetric(run.rmse)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatTime(run.training_time_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {new Set(history.map((run) => run.n_flights)).size >= 2 ? (
          <LearningCurve runs={[...history].sort((a, b) => a.n_observations - b.n_observations)} />
        ) : null}
      </section>

      <LearnedDemand
        ready={status.status === "ready"}
        modelKey={
          status.status === "ready"
            ? `${status.n_flights}-${status.mae}-${status.training_time_seconds}`
            : "none"
        }
      />

      <section className="mt-5 border border-line bg-panel px-4 py-3">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted">TRAINING SETUP</h2>
        <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tracking-[0.08em] text-navy">
          <li>SIMULATE FLIGHTS</li>
          <li className="text-muted" aria-hidden="true">
            →
          </li>
          <li>RANDOMIZE FARES</li>
          <li className="text-muted" aria-hidden="true">
            →
          </li>
          <li>TRAIN DEMAND MODEL</li>
        </ol>
        <p className="mt-3 max-w-3xl text-[13px] leading-5 text-muted">
          Synthetic flights are generated with different underlying demand conditions. Fares are
          randomized during training to expose the model to different prices. The model learns only
          from information that would be observable when making a pricing decision.
        </p>
        <p className="mt-4 text-[10px] font-semibold tracking-[0.14em] text-muted">
          WHAT THE MODEL LEARNS
        </p>
        <p className="mt-2 text-[13px] font-medium text-navy">
          PERIOD + FARE + CUMULATIVE BOOKINGS → PREDICTED BOOKINGS
        </p>
        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted">INPUT FEATURES</p>
            <ul className="mt-2 space-y-1 text-[13px] text-navy">
              <li>
                PERIOD <span className="text-muted">Selling period T-10 … T-1</span>
              </li>
              <li>
                FARE <span className="text-muted">Candidate fare $50 … $130</span>
              </li>
              <li>
                CUMULATIVE BOOKINGS <span className="text-muted">Seats already sold</span>
              </li>
            </ul>
            <p className="mt-3 text-[10px] font-semibold tracking-[0.14em] text-muted">
              TRAINING TARGET
            </p>
            <p className="mt-2 text-[13px] text-navy">
              REALIZED BOOKINGS <span className="text-muted">Bookings observed during the period</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted">
              HIDDEN FROM THE MODEL
            </p>
            <ul className="mt-2 space-y-1 text-[13px] text-muted">
              <li>MARKET STRENGTH</li>
              <li>TRUE MARKET MEAN</li>
              <li>ELASTICITY</li>
              <li>REFERENCE FARE</li>
            </ul>
            <p className="mt-2 text-[13px] leading-5 text-muted">
              These variables determine the synthetic market but are never provided to the demand
              model.
            </p>
          </div>
        </div>
        <details className="mt-4 border border-line bg-page px-4 py-3">
          <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.16em] text-muted">
            HOW THE DEMAND MODEL WORKS
          </summary>
          <div className="mt-3 max-w-3xl text-[13px] leading-5 text-muted">
            <p>
              HistGradientBoostingRegressor is a tree-based supervised learning model. It predicts
              expected bookings:
            </p>
            <p className="mt-2 font-medium text-navy">μ̂ = f(period, fare, cumulative_bookings)</p>
            <p className="mt-2">
              The pricing system then assumes D ~ Poisson(μ̂). This converts the point prediction
              into a stochastic demand distribution used by Myopic expected-sales calculations and
              Bellman optimization.
            </p>
            <p className="mt-2">
              The Poisson assumption is part of the pricing model around the ML mean.
              HistGradientBoosting itself does not output a Poisson distribution.
            </p>
          </div>
        </details>
      </section>

      <SyntheticPolicyEvaluation />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-navy">{value}</dd>
    </div>
  );
}

function LearningCurve({ runs }: { runs: SessionRun[] }) {
  const width = 640;
  const height = 168;
  const pad = { top: 12, right: 12, bottom: 32, left: 42 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xs = runs.map((run) => run.n_observations);
  const ys = runs.flatMap((run) => [run.mae, run.rmse]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys, 0.1);
  const xAt = (value: number) => pad.left + ((value - xMin) / Math.max(xMax - xMin, 1)) * innerW;
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH;
  function path(key: "mae" | "rmse"): string {
    return runs
      .map((run, index) => `${index === 0 ? "M" : "L"} ${xAt(run.n_observations)} ${yAt(run[key])}`)
      .join(" ");
  }

  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted">TEST ERROR</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-auto w-full">
        <path d={path("mae")} fill="none" stroke="#1b3a57" strokeWidth="1.5" />
        <path d={path("rmse")} fill="none" stroke="#c4a14a" strokeWidth="1.5" />
        {runs.map((run, index) => (
          <g key={`${run.n_flights}-${index}`}>
            <circle cx={xAt(run.n_observations)} cy={yAt(run.mae)} r="3" fill="#1b3a57" />
            <circle cx={xAt(run.n_observations)} cy={yAt(run.rmse)} r="3" fill="#c4a14a" />
            <text
              x={xAt(run.n_observations)}
              y={height - 10}
              textAnchor="middle"
              fill="#8b9aab"
              fontSize="10"
            >
              {formatInt(run.n_observations)}
            </text>
          </g>
        ))}
      </svg>
      <p className="text-[10px] tracking-[0.12em] text-muted">
        TRAINING OBSERVATIONS · NAVY MAE · GOLD RMSE
      </p>
    </div>
  );
}
