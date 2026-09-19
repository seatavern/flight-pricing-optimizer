import pytest
from fastapi.testclient import TestClient

from app.demand_model import HIDDEN_VARIABLES
from app.main import app
from app.market import FARES
from app.myopic import DemandModelNotTrainedError, myopic_decision
from app.poisson_expectation import expected_min_poisson


HIDDEN_KEYS = set(HIDDEN_VARIABLES) | {"model", "diagnostics", "latentDemand", "strength"}


def test_c_zero_expected_sales_are_zero() -> None:
    assert expected_min_poisson(8.0, 0) == 0.0


def test_mu_zero_expected_sales_are_zero() -> None:
    assert expected_min_poisson(0.0, 10) == 0.0
    assert expected_min_poisson(-1.0, 10) == 0.0


def test_large_capacity_matches_mean() -> None:
    mu = 4.5
    expected = expected_min_poisson(mu, 100)
    assert abs(expected - mu) < 1e-6


def test_small_capacity_never_exceeds_c() -> None:
    expected = expected_min_poisson(20.0, 3)
    assert 0.0 <= expected <= 3.0
    assert expected > 2.9


def test_expected_min_matches_pmf_definition() -> None:
    from scipy.stats import poisson

    mu = 6.25
    capacity = 5
    ks = range(capacity)
    brute = sum(k * float(poisson.pmf(k, mu)) for k in ks) + capacity * float(poisson.sf(capacity - 1, mu))
    assert abs(expected_min_poisson(mu, capacity) - brute) < 1e-9


def test_myopic_requires_trained_model() -> None:
    with pytest.raises(DemandModelNotTrainedError):
        myopic_decision(0, 0)


def test_myopic_api_requires_trained_model() -> None:
    client = TestClient(app)
    response = client.post("/pricing/myopic", json={"period": 0, "cumulative_bookings": 0})
    assert response.status_code == 409
    assert HIDDEN_KEYS.isdisjoint(response.json().keys())


def test_myopic_evaluates_all_fares_and_picks_max_revenue() -> None:
    client = TestClient(app)
    client.post("/model/train", json={"n_flights": 100})
    response = client.post("/pricing/myopic", json={"period": 0, "cumulative_bookings": 0})
    payload = response.json()
    assert response.status_code == 200
    fares = [row["fare"] for row in payload["candidates"]]
    assert fares == FARES.tolist()
    assert len(payload["candidates"]) == len(FARES)
    revenues = [row["expected_revenue"] for row in payload["candidates"]]
    winner = payload["candidates"][revenues.index(max(revenues))]
    assert payload["selected_fare"] == winner["fare"]
    assert payload["predicted_mu"] == winner["predicted_mu"]
    assert payload["expected_sales"] == winner["expected_sales"]
    assert payload["expected_revenue"] == winner["expected_revenue"]
    for row in payload["candidates"]:
        assert row["predicted_mu"] >= 0
        assert row["expected_sales"] >= 0
        assert row["expected_sales"] <= 100
        assert row["expected_revenue"] == row["fare"] * row["expected_sales"]
    assert HIDDEN_KEYS.isdisjoint(payload.keys())
    for row in payload["candidates"]:
        assert HIDDEN_KEYS.isdisjoint(row.keys())
        assert set(row.keys()) == {"fare", "predicted_mu", "expected_sales", "expected_revenue"}


def test_myopic_expected_sales_respect_remaining_capacity() -> None:
    client = TestClient(app)
    client.post("/model/train", json={"n_flights": 100})
    response = client.post("/pricing/myopic", json={"period": 7, "cumulative_bookings": 97})
    payload = response.json()
    assert response.status_code == 200
    for row in payload["candidates"]:
        assert row["expected_sales"] <= 3
