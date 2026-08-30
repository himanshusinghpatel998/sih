"""routing_service.py — thin JSON-friendly wrapper around ml/routing.

ml/routing/* (demand_score, bin_recommendations, route_optimizer,
worker_assignment, dynamic_rerouting) was written against pandas DataFrames
loaded from static CSVs (bins_master.csv). This wrapper lets the FastAPI
routes in main.py feed it live bin/worker/route data from the Node backend
instead — the routing algorithms are reused as-is, only the data source
changes from "read a CSV" to "build a DataFrame from the request body".
"""
import json

import numpy as np
import pandas as pd

from routing.demand_score import calculate_all_demand_scores
from routing.bin_recommendations import generate_bin_recommendations, summarize_recommendations
from routing.route_optimizer import RouteOptimizer
from routing.worker_assignment import WorkerAssigner
from routing.dynamic_rerouting import DynamicRerouter


def _clean(obj):
    """Recursively convert numpy scalars (int64/float64/bool_) to native
    Python types so FastAPI's jsonable_encoder can serialize plain dicts
    that came out of pandas aggregation (summarize_recommendations, etc.)."""
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        val = float(obj)
        return val if val == val else None  # NaN -> null
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, float) and obj != obj:
        return None
    return obj


def _records(df: pd.DataFrame) -> list:
    # DataFrame.to_dict('records') leaves numpy scalars (int64/float64) in
    # place, which FastAPI's jsonable_encoder can't serialize. Round-tripping
    # through pandas' own JSON writer converts everything to plain Python
    # types first.
    return json.loads(df.to_json(orient="records"))


def _bins_df(bins: list) -> pd.DataFrame:
    df = pd.DataFrame(bins)
    if df.empty:
        raise ValueError("bins list is empty")
    if "bin_id" not in df.columns:
        raise ValueError("each bin needs a bin_id")
    return df


def demand_scores(bins: list) -> list:
    df = _bins_df(bins)
    scores_df = calculate_all_demand_scores(df)
    return _records(scores_df)


def optimize_routes(bins: list, fleet: list = None) -> dict:
    df = _bins_df(bins)
    scores_df = calculate_all_demand_scores(df)
    optimizer = RouteOptimizer(df, scores_df, fleet_data=fleet or None)
    return _clean(optimizer.optimize_routes())


def recommendations(bins: list) -> dict:
    df = _bins_df(bins)
    # generate_bin_recommendations() merges bins_df on these columns
    # unconditionally — fill in defaults for callers that don't send them
    # (live bin data won't have population_density_per_sqkm, for instance).
    for col, default in (
        ("latitude", 0.0),
        ("longitude", 0.0),
        ("population_density_per_sqkm", 0.0),
        ("nearby_restaurants_count", 0),
    ):
        if col not in df.columns:
            df[col] = default
    scores_df = calculate_all_demand_scores(df)
    recs_df = generate_bin_recommendations(scores_df, df)
    summary = summarize_recommendations(recs_df)
    return {"recommendations": _records(recs_df), "summary": _clean(summary)}


def assign_workers(routes_result: dict, workers: list = None) -> dict:
    workers_df = pd.DataFrame(workers) if workers else None
    assigner = WorkerAssigner(workers_df=workers_df, routes_result=routes_result or {"routes": []})
    return _clean(assigner.assign_workers())


def reroute_insert_bin(routes_result: dict, bins: list, bin_id: str, scores: list = None, current_location=None) -> dict:
    bins_df = _bins_df(bins)
    scores_df = pd.DataFrame(scores) if scores else None
    rerouter = DynamicRerouter(routes_result, bins_df, scores_df)
    loc = tuple(current_location) if current_location else None
    return _clean(rerouter.handle_new_high_risk_bin(bin_id, loc))


def reroute_breakdown(routes_result: dict, bins: list, vehicle_id: str) -> dict:
    bins_df = _bins_df(bins)
    routes_result = dict(routes_result or {})
    routes_result.setdefault("total_routes", len(routes_result.get("routes", [])))
    rerouter = DynamicRerouter(routes_result, bins_df)
    return _clean(rerouter.handle_vehicle_breakdown(vehicle_id))


def reroute_traffic(routes_result: dict, bins: list, vehicle_id: str, delay_minutes: int, affected_stops: list) -> dict:
    bins_df = _bins_df(bins)
    rerouter = DynamicRerouter(routes_result, bins_df)
    return _clean(rerouter.update_routes_with_traffic(vehicle_id, delay_minutes, affected_stops))
