from collections.abc import Iterator

import pytest

from app.demand_model import set_active_model


@pytest.fixture(autouse=True)
def reset_active_model() -> Iterator[None]:
    set_active_model(None)
    yield
    set_active_model(None)
