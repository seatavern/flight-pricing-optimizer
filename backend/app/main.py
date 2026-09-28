from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from app.demand_model import (
    TRAIN_SEED,
    TRAINING_SIZES,
    get_active_status,
    public_training_payload,
    train_demand_model,
)
from app.decision import decision_payload
from app.market import FARES, N_PERIODS
from app.model_diagnostics import diagnostic_payload
from app.myopic import DemandModelNotTrainedError, myopic_decision, myopic_payload
from app.optimized import optimized_decision, optimized_payload
from app.policy_map import policy_map_payload

ALLOWED_TRAINING_FLIGHTS = Literal[100, 1000, 5000, 10000]


class TrainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    n_flights: ALLOWED_TRAINING_FLIGHTS


class ModelReadyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ready"]
    n_flights: int
    n_observations: int
    mae: float
    rmse: float
    training_time_seconds: float


class ModelNotTrainedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["not_trained"]


class MyopicRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: int = Field(ge=0, le=N_PERIODS - 1)
    cumulative_bookings: int = Field(ge=0, le=100)


class MyopicCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fare: int
    predicted_mu: float
    expected_sales: float
    expected_revenue: float


class MyopicResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selected_fare: int
    predicted_mu: float
    expected_sales: float
    expected_revenue: float
    candidates: list[MyopicCandidate]


class OptimizedRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: int = Field(ge=0, le=N_PERIODS - 1)
    cumulative_bookings: int = Field(ge=0, le=100)


class OptimizedCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fare: int
    predicted_mu: float
    expected_sales: float
    immediate_expected_revenue: float
    future_value: float
    total_value: float


class OptimizedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selected_fare: int
    predicted_mu: float
    expected_sales: float
    immediate_expected_revenue: float
    future_value: float
    total_value: float
    candidates: list[OptimizedCandidate]


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    train_demand_model(10_000, TRAIN_SEED)
    yield


app = FastAPI(title="Flight Optimizer API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/model/status", response_model=ModelReadyResponse | ModelNotTrainedResponse)
def model_status() -> dict[str, float | int | str]:
    return get_active_status()


@app.post("/model/train", response_model=ModelReadyResponse)
def train_model(body: TrainRequest) -> dict[str, float | int | str]:
    if body.n_flights not in TRAINING_SIZES:
        raise ValueError("n_flights is not an allowed training size")
    result = train_demand_model(body.n_flights, TRAIN_SEED)
    return public_training_payload(result)


@app.post("/pricing/myopic", response_model=MyopicResponse)
def pricing_myopic(body: MyopicRequest) -> dict[str, object]:
    try:
        decision = myopic_decision(body.period, body.cumulative_bookings)
    except DemandModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail="Demand model is not trained") from exc
    return myopic_payload(decision)


@app.post("/pricing/optimized", response_model=OptimizedResponse)
def pricing_optimized(body: OptimizedRequest) -> dict[str, object]:
    try:
        decision = optimized_decision(body.period, body.cumulative_bookings)
    except DemandModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail="Demand model is not trained") from exc
    return optimized_payload(decision)


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: int = Field(ge=0, le=N_PERIODS - 1)
    remaining_capacity: int = Field(ge=0, le=100)


class DecisionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: int
    remaining_capacity: int
    cumulative_bookings: int
    myopic_selected_fare: int
    myopic_immediate_expected_revenue: float
    myopic_continuation_value: float
    myopic_total_policy_value: float
    optimized_selected_fare: int
    optimized_immediate_expected_revenue: float
    optimized_continuation_value: float
    optimized_total_policy_value: float
    candidates: list[OptimizedCandidate]


@app.post("/pricing/decision", response_model=DecisionResponse)
def pricing_decision(body: DecisionRequest) -> dict[str, object]:
    try:
        return decision_payload(body.period, body.remaining_capacity)
    except DemandModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail="Demand model is not trained") from exc


class PolicyMapState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: int
    remaining_capacity: int
    myopic_fare: int
    optimized_fare: int
    fare_difference: int


class PolicyMapResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    states: list[PolicyMapState]


@app.get("/pricing/policy-map", response_model=PolicyMapResponse)
def pricing_policy_map() -> dict[str, object]:
    try:
        return policy_map_payload()
    except DemandModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail="Demand model is not trained") from exc


class DiagnosticRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["fare", "bookings", "surface"]
    period: int = Field(ge=0, le=N_PERIODS - 1)
    fare: int | None = None
    cumulative_bookings: int | None = Field(default=None, ge=0, le=100)


class DiagnosticPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fare: int | None = None
    cumulative_bookings: int | None = None
    predicted_mu: float


class DiagnosticResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["fare", "bookings", "surface"]
    period: int
    fare: int | None = None
    cumulative_bookings: int | None = None
    points: list[DiagnosticPoint] | None = None
    cells: list[DiagnosticPoint] | None = None


@app.post("/model/diagnostics", response_model=DiagnosticResponse, response_model_exclude_none=True)
def model_diagnostics(body: DiagnosticRequest) -> dict[str, object]:
    if body.kind == "bookings" and body.fare not in FARES.tolist():
        raise HTTPException(status_code=422, detail="fare must be on the nine-fare grid")
    try:
        return diagnostic_payload(
            body.kind,
            body.period,
            fare=body.fare,
            cumulative_bookings=body.cumulative_bookings,
        )
    except DemandModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail="Demand model is not trained") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
