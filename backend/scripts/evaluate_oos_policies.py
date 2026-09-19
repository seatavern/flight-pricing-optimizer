from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.policy_evaluation import EVALUATION_SEED, N_EVAL_FLIGHTS, evaluate_policies


def main() -> None:
    print("Running nine-fare paired policy evaluation (no live-API retrain)...", flush=True)
    result = evaluate_policies(N_EVAL_FLIGHTS, EVALUATION_SEED, require_standard_model=True)
    out_path = Path(r"C:\Users\joelm\AppData\Local\Temp\oos_policy_eval_nine_fare.json")
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"\nWrote {out_path}", flush=True)
    print(f"Runtime {result['runtime_seconds']:.1f}s", flush=True)


if __name__ == "__main__":
    main()
