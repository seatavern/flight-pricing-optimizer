"""Read-only checks for the frontend, API and startup-trained model."""
import argparse
import json
import time
import urllib.error
import urllib.request


def check(base_url: str, timeout: int = 900) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            with urllib.request.urlopen(base_url + "/health", timeout=15) as response:
                assert json.load(response).get("status") == "ok", "API unhealthy"
            with urllib.request.urlopen(base_url + "/model/status", timeout=15) as response:
                assert json.load(response).get("status") == "ready", "Model not ready"
            with urllib.request.urlopen(base_url + "/", timeout=15) as response:
                assert response.status == 200, "Frontend unavailable"
                assert "text/html" in response.headers.get("Content-Type", ""), "Expected HTML"
                assert b"<html" in response.read().lower(), "Missing frontend HTML"
            print("Frontend, API and trained model checks passed.", flush=True)
            return
        except (urllib.error.URLError, TimeoutError, AssertionError, ValueError) as exc:
            if time.monotonic() >= deadline:
                raise RuntimeError("Application did not become ready in time") from exc
            time.sleep(5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    check(args.url.rstrip("/"), args.timeout)
