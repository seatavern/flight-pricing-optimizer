import { API_BASE_URL } from "@/lib/config";
import { FARES, type Fare } from "@/lib/constants";
import { ModelApiError, readJson as readModelJson } from "@/lib/modelApi";

export type MyopicCandidate = {
  fare: Fare;
  predicted_mu: number;
  expected_sales: number;
  expected_revenue: number;
};

export type FarePrediction = {
  fare: Fare;
  predicted_mu: number;
};

export type MyopicDecision = {
  selected_fare: Fare | null;
  predicted_mu: number | null;
  expected_sales: number;
  expected_revenue: number;
  candidates: MyopicCandidate[];
};

export type OptimizedDecision = {
  selected_fare: Fare | null;
  predicted_mu: number | null;
  expected_sales: number;
  immediate_expected_revenue: number;
  future_value: number;
  total_value: number;
  candidates: FarePrediction[];
};

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function isFare(value: number): value is Fare {
  return (FARES as readonly number[]).includes(value);
}

function readOfferedFare(value: unknown, message: string): Fare | null {
  if (value === null) return null;
  if (typeof value === "number" && isFare(value)) return value;
  throw new ModelApiError(message);
}

function readOptionalMean(value: unknown, message: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new ModelApiError(message);
}

function readCandidate(payload: Record<string, unknown>): MyopicCandidate {
  const fare = payload.fare;
  const predictedMu = payload.predicted_mu;
  const expectedSales = payload.expected_sales;
  const expectedRevenue = payload.expected_revenue;
  if (
    typeof fare !== "number" ||
    !isFare(fare) ||
    typeof predictedMu !== "number" ||
    typeof expectedSales !== "number" ||
    typeof expectedRevenue !== "number"
  ) {
    throw new ModelApiError("Myopic candidate was invalid.");
  }
  return {
    fare,
    predicted_mu: predictedMu,
    expected_sales: expectedSales,
    expected_revenue: expectedRevenue,
  };
}

export async function fetchMyopicDecision(
  period: number,
  cumulativeBookings: number,
): Promise<MyopicDecision> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/pricing/myopic"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period,
        cumulative_bookings: cumulativeBookings,
      }),
    });
  } catch {
    throw new ModelApiError("Cannot reach the pricing API.");
  }
  if (response.status === 409) {
    throw new ModelApiError("Demand model is not trained. Train a model in Model Lab.");
  }
  if (!response.ok) {
    throw new ModelApiError(`Myopic pricing failed (${response.status}).`);
  }
  const payload = await readModelJson(response);
  const selectedFare = readOfferedFare(payload.selected_fare, "Myopic response was missing fields.");
  const predictedMu = readOptionalMean(payload.predicted_mu, "Myopic response was missing fields.");
  const expectedSales = payload.expected_sales;
  const expectedRevenue = payload.expected_revenue;
  const candidatesRaw = payload.candidates;
  if (
    (selectedFare === null) !== (predictedMu === null) ||
    typeof expectedSales !== "number" ||
    typeof expectedRevenue !== "number" ||
    !Array.isArray(candidatesRaw)
  ) {
    throw new ModelApiError("Myopic response was missing fields.");
  }
  const candidates = candidatesRaw.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ModelApiError("Myopic candidate was invalid.");
    }
    return readCandidate(row as Record<string, unknown>);
  });
  if (candidates.length !== FARES.length) {
    throw new ModelApiError("Myopic response did not include all fares.");
  }
  return {
    selected_fare: selectedFare,
    predicted_mu: predictedMu,
    expected_sales: expectedSales,
    expected_revenue: expectedRevenue,
    candidates,
  };
}

function readNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ModelApiError("Optimized response was missing fields.");
  }
  return value;
}

export async function fetchOptimizedDecision(
  period: number,
  cumulativeBookings: number,
): Promise<OptimizedDecision> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/pricing/optimized"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period,
        cumulative_bookings: cumulativeBookings,
      }),
    });
  } catch {
    throw new ModelApiError("Cannot reach the pricing API.");
  }
  if (response.status === 409) {
    throw new ModelApiError("Demand model is not trained. Train a model in Model Lab.");
  }
  if (!response.ok) {
    throw new ModelApiError(`Optimized pricing failed (${response.status}).`);
  }
  const payload = await readModelJson(response);
  const selectedFare = readOfferedFare(payload.selected_fare, "Optimized response was missing fields.");
  const predictedMu = readOptionalMean(payload.predicted_mu, "Optimized response was missing fields.");
  const candidatesRaw = payload.candidates;
  if ((selectedFare === null) !== (predictedMu === null) || !Array.isArray(candidatesRaw)) {
    throw new ModelApiError("Optimized response was missing fields.");
  }
  const candidates = candidatesRaw.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ModelApiError("Optimized candidate was invalid.");
    }
    const record = row as Record<string, unknown>;
    const fare = record.fare;
    const mean = record.predicted_mu;
    if (typeof fare !== "number" || !isFare(fare) || typeof mean !== "number" || !Number.isFinite(mean)) {
      throw new ModelApiError("Optimized candidate was invalid.");
    }
    return { fare, predicted_mu: mean };
  });
  return {
    selected_fare: selectedFare,
    predicted_mu: predictedMu,
    expected_sales: readNumber(payload, "expected_sales"),
    immediate_expected_revenue: readNumber(payload, "immediate_expected_revenue"),
    future_value: readNumber(payload, "future_value"),
    total_value: readNumber(payload, "total_value"),
    candidates,
  };
}

export type ExplorerCandidate = {
  fare: Fare;
  predicted_mu: number;
  expected_sales: number;
  immediate_expected_revenue: number;
  future_value: number;
  total_value: number;
};

export type ExplorerDecision = {
  period: number;
  remaining_capacity: number;
  cumulative_bookings: number;
  myopic_selected_fare: Fare | null;
  myopic_immediate_expected_revenue: number;
  myopic_continuation_value: number;
  myopic_total_policy_value: number;
  optimized_selected_fare: Fare | null;
  optimized_immediate_expected_revenue: number;
  optimized_continuation_value: number;
  optimized_total_policy_value: number;
  candidates: ExplorerCandidate[];
};

function readExplorerCandidate(payload: Record<string, unknown>): ExplorerCandidate {
  const fare = payload.fare;
  if (typeof fare !== "number" || !isFare(fare)) {
    throw new ModelApiError("Decision candidate was invalid.");
  }
  return {
    fare,
    predicted_mu: readNumber(payload, "predicted_mu"),
    expected_sales: readNumber(payload, "expected_sales"),
    immediate_expected_revenue: readNumber(payload, "immediate_expected_revenue"),
    future_value: readNumber(payload, "future_value"),
    total_value: readNumber(payload, "total_value"),
  };
}

export async function fetchExplorerDecision(
  period: number,
  remainingCapacity: number,
  signal?: AbortSignal,
): Promise<ExplorerDecision> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/pricing/decision"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period,
        remaining_capacity: remainingCapacity,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ModelApiError("Cannot reach the pricing API.");
  }
  if (response.status === 409) {
    throw new ModelApiError("Demand model is not trained. Train a model in Model Lab.");
  }
  if (!response.ok) {
    throw new ModelApiError(`Decision lookup failed (${response.status}).`);
  }
  const payload = await readModelJson(response);
  const myopicFare = readOfferedFare(payload.myopic_selected_fare, "Decision response was missing fields.");
  const optimizedFare = readOfferedFare(
    payload.optimized_selected_fare,
    "Decision response was missing fields.",
  );
  const candidatesRaw = payload.candidates;
  if (
    typeof payload.period !== "number" ||
    typeof payload.remaining_capacity !== "number" ||
    typeof payload.cumulative_bookings !== "number" ||
    !Array.isArray(candidatesRaw)
  ) {
    throw new ModelApiError("Decision response was missing fields.");
  }
  const candidates = candidatesRaw.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ModelApiError("Decision candidate was invalid.");
    }
    return readExplorerCandidate(row as Record<string, unknown>);
  });
  if (candidates.length !== FARES.length) {
    throw new ModelApiError("Decision response did not include all fares.");
  }
  return {
    period: payload.period,
    remaining_capacity: payload.remaining_capacity,
    cumulative_bookings: payload.cumulative_bookings,
    myopic_selected_fare: myopicFare,
    myopic_immediate_expected_revenue: readNumber(payload, "myopic_immediate_expected_revenue"),
    myopic_continuation_value: readNumber(payload, "myopic_continuation_value"),
    myopic_total_policy_value: readNumber(payload, "myopic_total_policy_value"),
    optimized_selected_fare: optimizedFare,
    optimized_immediate_expected_revenue: readNumber(payload, "optimized_immediate_expected_revenue"),
    optimized_continuation_value: readNumber(payload, "optimized_continuation_value"),
    optimized_total_policy_value: readNumber(payload, "optimized_total_policy_value"),
    candidates,
  };
}

export type PolicyMapState = {
  period: number;
  remaining_capacity: number;
  myopic_fare: Fare | null;
  optimized_fare: Fare | null;
  fare_difference: number | null;
};

export type PolicyMap = {
  states: PolicyMapState[];
};

function readPolicyMapState(payload: Record<string, unknown>): PolicyMapState {
  if (typeof payload.period !== "number" || typeof payload.remaining_capacity !== "number") {
    throw new ModelApiError("Policy map state was invalid.");
  }
  const myopicFare = readOfferedFare(payload.myopic_fare, "Policy map state was invalid.");
  const optimizedFare = readOfferedFare(payload.optimized_fare, "Policy map state was invalid.");
  const difference = payload.fare_difference;
  const soldOut = payload.remaining_capacity === 0;
  if (soldOut) {
    if (myopicFare !== null || optimizedFare !== null || difference !== null) {
      throw new ModelApiError("Policy map state was invalid.");
    }
    return {
      period: payload.period,
      remaining_capacity: 0,
      myopic_fare: null,
      optimized_fare: null,
      fare_difference: null,
    };
  }
  if (
    myopicFare === null ||
    optimizedFare === null ||
    typeof difference !== "number" ||
    difference !== optimizedFare - myopicFare
  ) {
    throw new ModelApiError("Policy map state was invalid.");
  }
  return {
    period: payload.period,
    remaining_capacity: payload.remaining_capacity,
    myopic_fare: myopicFare,
    optimized_fare: optimizedFare,
    fare_difference: difference,
  };
}

export async function fetchPolicyMap(signal?: AbortSignal): Promise<PolicyMap> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/pricing/policy-map"), { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ModelApiError("Cannot reach the pricing API.");
  }
  if (response.status === 409) {
    throw new ModelApiError("Demand model is not trained. Train a model in Model Lab.");
  }
  if (!response.ok) {
    throw new ModelApiError(`Policy map lookup failed (${response.status}).`);
  }
  const payload = await readModelJson(response);
  const statesRaw = payload.states;
  if (!Array.isArray(statesRaw)) {
    throw new ModelApiError("Policy map response was missing fields.");
  }
  const states = statesRaw.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ModelApiError("Policy map state was invalid.");
    }
    return readPolicyMapState(row as Record<string, unknown>);
  });
  if (states.length !== 10 * 101) {
    throw new ModelApiError("Policy map did not include the full state space.");
  }
  return { states };
}
