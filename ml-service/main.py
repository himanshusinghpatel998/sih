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

# ml/routing/* prints emoji status lines at import/run time; Windows' default
# console codepage (cp1252) can't encode them and raises UnicodeEncodeError
# on first import. Force UTF-8 stdio so those prints degrade to '?' instead
# of crashing the service.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ML_DIR = Path(__file__).resolve().parent.parent / "ml"
sys.path.insert(0, str(ML_DIR))

import inference  # noqa: E402
import routing_service  # noqa: E402


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


# ─── Computer vision (Phase F) ────────────────────────────────────────────

@app.get("/detect/health")
def detect_health():
    from detector import _load_model

    _load_model()
    return {"status": "ok", "detector": "yolov8n"}


@app.post("/detect/frame")
async def detect_frame(file: UploadFile = File(...)):
    from detector import detect_image_bytes

    data = await file.read()
    try:
        return _sanitize(detect_image_bytes(data))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/detect/crowd")
async def detect_crowd(file: UploadFile = File(...)):
    from detector import detect_crowd_bytes

    data = await file.read()
    try:
        return _sanitize(detect_crowd_bytes(data))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Routing (demand scoring, OR-Tools optimization, worker assignment,
# bin recommendations, dynamic rerouting) — wraps ml/routing/* ────────────

@app.post("/routes/demand-scores")
def routes_demand_scores(payload: dict = Body(...)):
    try:
        return _sanitize({"scores": routing_service.demand_scores(payload.get("bins", []))})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/routes/optimize")
def routes_optimize(payload: dict = Body(...)):
    try:
        return _sanitize(routing_service.optimize_routes(payload.get("bins", []), payload.get("fleet")))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/routes/recommendations")
def routes_recommendations(payload: dict = Body(...)):
    try:
        return _sanitize(routing_service.recommendations(payload.get("bins", [])))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/routes/assign-workers")
def routes_assign_workers(payload: dict = Body(...)):
    try:
        return _sanitize(routing_service.assign_workers(payload.get("routes", {}), payload.get("workers")))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/routes/reroute/insert-bin")
def routes_reroute_insert(payload: dict = Body(...)):
    bin_id = payload.get("binId")
    if not bin_id:
        raise HTTPException(status_code=400, detail="binId is required")
    try:
        return _sanitize(routing_service.reroute_insert_bin(
            payload.get("routes", {}),
            payload.get("bins", []),
            bin_id,
            payload.get("scores"),
            payload.get("currentLocation"),
        ))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/routes/reroute/breakdown")
def routes_reroute_breakdown(payload: dict = Body(...)):
    vehicle_id = payload.get("vehicleId")
    if not vehicle_id:
        raise HTTPException(status_code=400, detail="vehicleId is required")
    try:
        return _sanitize(routing_service.reroute_breakdown(
            payload.get("routes", {}), payload.get("bins", []), vehicle_id
        ))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/routes/reroute/traffic")
def routes_reroute_traffic(payload: dict = Body(...)):
    vehicle_id = payload.get("vehicleId")
    if not vehicle_id:
        raise HTTPException(status_code=400, detail="vehicleId is required")
    try:
        return _sanitize(routing_service.reroute_traffic(
            payload.get("routes", {}),
            payload.get("bins", []),
            vehicle_id,
            payload.get("delayMinutes", 10),
            payload.get("affectedStops", []),
        ))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
