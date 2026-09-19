import { API_BASE_URL } from "@/lib/config";

export const TRAINING_FLIGHT_OPTIONS = [100, 1000, 5000, 10000] as const;
export type TrainingFlights = (typeof TRAINING_FLIGHT_OPTIONS)[number];
export const DEFAULT_TRAINING_FLIGHTS: TrainingFlights = 10000;
export const TRAIN_SEED = 1;
export const TEST_SEED = 99;
export const TEST_N_FLIGHTS = 5000;
export const TEST_N_OBSERVATIONS = TEST_N_FLIGHTS * 10;

export type ModelStatusNotTrained = {
  status: "not_trained";
};

export type ModelStatusReady = {
  status: "ready";
  n_flights: number;
  n_observations: number;
  mae: number;
  rmse: number;
  training_time_seconds: number;
};

export type ModelStatus = ModelStatusNotTrained | ModelStatusReady;

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export class ModelApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelApiError";
  }
}

function readPublicReady(payload: Record<string, unknown>): ModelStatusReady {
  if (payload.status !== "ready") {
    throw new ModelApiError("Unexpected model response.");
  }
  const nFlights = payload.n_flights;
  const nObservations = payload.n_observations;
  const mae = payload.mae;
  const rmse = payload.rmse;
  const trainingTime = payload.training_time_seconds;
  if (
    typeof nFlights !== "number" ||
    typeof nObservations !== "number" ||
    typeof mae !== "number" ||
    typeof rmse !== "number" ||
    typeof trainingTime !== "number"
  ) {
    throw new ModelApiError("Model response was missing metrics.");
  }
  return {
    status: "ready",
    n_flights: nFlights,
    n_observations: nObservations,
    mae,
    rmse,
    training_time_seconds: trainingTime,
  };
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = (await response.json()) as unknown;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ModelApiError("Model response was not an object.");
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ModelApiError) throw error;
    throw new ModelApiError("Model response was not valid JSON.");
  }
}

export async function fetchModelStatus(): Promise<ModelStatus> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/model/status"), { cache: "no-store" });
  } catch {
    throw new ModelApiError("Cannot reach the training API.");
  }
  if (!response.ok) {
    throw new ModelApiError(`Model status failed (${response.status}).`);
  }
  const payload = await readJson(response);
  if (payload.status === "not_trained") {
    return { status: "not_trained" };
  }
  return readPublicReady(payload);
}

export async function trainDemandModel(nFlights: TrainingFlights): Promise<ModelStatusReady> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/model/train"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n_flights: nFlights }),
    });
  } catch {
    throw new ModelApiError("Cannot reach the training API.");
  }
  if (response.status === 422) {
    throw new ModelApiError("Unsupported training size.");
  }
  if (!response.ok) {
    throw new ModelApiError(`Training failed (${response.status}).`);
  }
  return readPublicReady(await readJson(response));
}

export function observationCount(nFlights: number): number {
  return nFlights * 10;
}

export type FareDiagnostic = {
  kind: "fare";
  period: number;
  cumulative_bookings: number;
  points: Array<{ fare: number; predicted_mu: number }>;
};

export type BookingsDiagnostic = {
  kind: "bookings";
  period: number;
  fare: number;
  points: Array<{ cumulative_bookings: number; predicted_mu: number }>;
};

export type SurfaceDiagnostic = {
  kind: "surface";
  period: number;
  cells: Array<{ fare: number; cumulative_bookings: number; predicted_mu: number }>;
};

async function postDiagnostic(
  body: Record<string, number | string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/model/diagnostics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ModelApiError("Cannot reach the training API.");
  }
  if (response.status === 409) {
    throw new ModelApiError("Demand model is not trained. Train a model in Model Lab.");
  }
  if (!response.ok) {
    throw new ModelApiError(`Model diagnostic failed (${response.status}).`);
  }
  return readJson(response);
}

function readPredicted(row: Record<string, unknown>): number {
  const value = row.predicted_mu;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ModelApiError("Diagnostic prediction was invalid.");
  }
  return value;
}

export async function fetchFareDiagnostic(
  period: number,
  cumulativeBookings: number,
  signal?: AbortSignal,
): Promise<FareDiagnostic> {
  const payload = await postDiagnostic(
    { kind: "fare", period, cumulative_bookings: cumulativeBookings },
    signal,
  );
  const pointsRaw = payload.points;
  if (!Array.isArray(pointsRaw) || pointsRaw.length !== 9) {
    throw new ModelApiError("Fare diagnostic was missing points.");
  }
  const points = pointsRaw.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ModelApiError("Fare diagnostic point was invalid.");
    }
    const record = row as Record<string, unknown>;
    if (typeof record.fare !== "number") {
      throw new ModelApiError("Fare diagnostic point was invalid.");
    }
    return { fare: record.fare, predicted_mu: readPredicted(record) };
  });
  return {
    kind: "fare",
    period,
    cumulative_bookings: cumulativeBookings,
    points,
  };
}

export async function fetchBookingsDiagnostic(
  period: number,
  fare: number,
  signal?: AbortSignal,
): Promise<BookingsDiagnostic> {
  const payload = await postDiagnostic({ kind: "bookings", period, fare }, signal);
  const pointsRaw = payload.points;
  if (!Array.isArray(pointsRaw) || pointsRaw.length !== 101) {
    throw new ModelApiError("Bookings diagnostic was missing points.");
  }
  const points = pointsRaw.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ModelApiError("Bookings diagnostic point was invalid.");
    }
    const record = row as Record<string, unknown>;
    if (typeof record.cumulative_bookings !== "number") {
      throw new ModelApiError("Bookings diagnostic point was invalid.");
    }
    return {
      cumulative_bookings: record.cumulative_bookings,
      predicted_mu: readPredicted(record),
    };
  });
  return { kind: "bookings", period, fare, points };
}

export async function fetchSurfaceDiagnostic(
  period: number,
  signal?: AbortSignal,
): Promise<SurfaceDiagnostic> {
  const payload = await postDiagnostic({ kind: "surface", period }, signal);
  const cellsRaw = payload.cells;
  if (!Array.isArray(cellsRaw) || cellsRaw.length !== 9 * 101) {
    throw new ModelApiError("Surface diagnostic was missing cells.");
  }
  const cells = cellsRaw.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ModelApiError("Surface diagnostic cell was invalid.");
    }
    const record = row as Record<string, unknown>;
    if (typeof record.fare !== "number" || typeof record.cumulative_bookings !== "number") {
      throw new ModelApiError("Surface diagnostic cell was invalid.");
    }
    return {
      fare: record.fare,
      cumulative_bookings: record.cumulative_bookings,
      predicted_mu: readPredicted(record),
    };
  });
  return { kind: "surface", period, cells };
}
