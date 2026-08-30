"""NagarAI ML service — thin FastAPI wrapper around ml/inference.py.

Runs the real trained XGBoost models (fill-% regression, overflow-risk
classification) instead of the Node backend's rule-based fallback. Node
calls this over HTTP and falls back to its own rule engine if this service
is unreachable (see nagarai/server/services/predictionEngine.js).
"""
import sys
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ML_DIR = Path(__file__).resolve().parent.parent / "ml"
sys.path.insert(0, str(ML_DIR))

import inference  # noqa: E402


def _sanitize(obj):
    """Recursively replace NaN/Infinity (not valid JSON) with None."""
    if isinstance(obj, float):
        return obj if obj == obj and obj not in (float("inf"), float("-inf")) else None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


app = FastAPI(title="NagarAI ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_started_at = time.time()


class BatchRequest(BaseModel):
    overrides: Optional[dict[str, float]] = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "uptimeSeconds": round(time.time() - _started_at, 1),
        "bins": len(inference.list_bin_ids()),
    }


@app.get("/predict/bin/{bin_id}")
def predict_bin(bin_id: str, current_fill: Optional[float] = None):
    try:
        return _sanitize(inference.predict_bin(bin_id, current_fill))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown bin_id: {bin_id}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/predict/batch")
def predict_batch(req: BatchRequest = BatchRequest()):
    return _sanitize({"predictions": inference.predict_all(req.overrides)})


@app.get("/bins")
def bins():
    return {"binIds": inference.list_bin_ids()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
