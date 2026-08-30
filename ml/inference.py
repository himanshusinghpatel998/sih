"""Inference-time bridge for the trained NagarAI waste models.

Reuses feature_engineering.py's exact training-time pipeline (per
ML_PIPELINE_PLAN.md Section 7: "this must use the *exact same feature
engineering code* as training ... to avoid train/serve skew").

Data source for history: waste_bin_dataset.csv already contains 2 years of
realistic, causally-simulated per-bin history for the same 154 bins in
bins_master.csv. Rather than requiring the live app to accumulate its own
30-day feature history before predictions are meaningful, we treat the
dataset's trailing window per bin as that bin's "real" history and predict
one day past the dataset's last known date. A live current-fill-percentage
reading (from Mongo/IoT) can optionally override the latest day's state to
nudge the projection with today's real signal.
"""
from __future__ import annotations

import functools
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import xgboost as xgb

from feature_engineering import (
    build_features,
    cast_categorical_columns,
    load_raw,
    merge_cluster_labels,
    NON_FEATURE_COLUMNS,
)

ML_DIR = Path(__file__).parent
MODEL1_PATH = ML_DIR / "model1_fill_percentage_xgb.json"
MODEL2_PATH = ML_DIR / "model2_overflow_risk_xgb.json"
HISTORY_WINDOW_DAYS = 30


@functools.lru_cache(maxsize=1)
def _load_history() -> pd.DataFrame:
    df = load_raw(str(ML_DIR / "waste_bin_dataset.csv"))
    df = merge_cluster_labels(df, str(ML_DIR / "bin_cluster_mapping.csv"))
    return df


@functools.lru_cache(maxsize=1)
def _load_boosters():
    m1 = xgb.Booster()
    m1.load_model(str(MODEL1_PATH))
    m2 = xgb.Booster()
    m2.load_model(str(MODEL2_PATH))
    return m1, m2


def list_bin_ids() -> list[str]:
    return sorted(_load_history()["bin_id"].unique().tolist())


def _bin_slice(bin_id: str) -> pd.DataFrame:
    hist = _load_history()
    g = hist[hist["bin_id"] == bin_id].sort_values("date")
    if g.empty:
        raise KeyError(f"Unknown bin_id: {bin_id}")
    return g.tail(HISTORY_WINDOW_DAYS).reset_index(drop=True)


def _next_day_row(last_row: pd.Series, current_fill_override: Optional[float]) -> dict:
    """Build tomorrow's raw (pre-feature-engineering) row from the last known
    day, optionally overridden by a live fill-percentage reading."""
    next_date = last_row["date"] + pd.Timedelta(days=1)
    row = last_row.to_dict()
    row["date"] = next_date
    row["day_of_week"] = next_date.day_name()
    row["month"] = next_date.month
    row["is_holiday"] = False
    row["holiday_name"] = None
    row["is_festival"] = False
    row["festival_name"] = None
    row["event_type"] = "none"
    row["event_multiplier"] = 1.0
    row["previous_fill_percentage"] = (
        current_fill_override if current_fill_override is not None else last_row["fill_percentage_end_of_day"]
    )
    row["previous_waste_kg"] = last_row["waste_generated_kg"]
    row["days_since_last_collection"] = (
        0 if last_row.get("collection_occurred") else last_row.get("days_since_last_collection", 0) + 1
    )
    # Unknown-yet outcome columns for the row being predicted -- present as
    # NaN/False so build_features' lag/rolling logic treats "today" as the
    # most recent *complete* day and the appended row as the forecast target.
    for col in (
        "waste_generated_kg", "fill_percentage_before_collection", "overflow_occurred",
        "collection_scheduled", "collection_occurred", "waste_collected_kg",
        "fill_percentage_end_of_day", "target_fill_percentage_next_day",
        "target_overflow_risk_next_day",
    ):
        row[col] = np.nan if col not in ("overflow_occurred", "collection_scheduled", "collection_occurred") else False
    return row


def predict_bin(bin_id: str, current_fill_override: Optional[float] = None) -> dict:
    g = _bin_slice(bin_id)
    last_row = g.iloc[-1]
    appended = pd.concat([g, pd.DataFrame([_next_day_row(last_row, current_fill_override)])], ignore_index=True)

    feats = build_features(appended)
    feats = cast_categorical_columns(feats, extra_categorical=["bin_cluster_id"])
    target_row = feats.iloc[[-1]]

    drop_cols = [c for c in NON_FEATURE_COLUMNS if c in target_row.columns]
    X = target_row.drop(columns=drop_cols)

    m1, m2 = _load_boosters()
    X1 = X.reindex(columns=m1.feature_names)
    X2 = X.reindex(columns=m2.feature_names)

    dmat1 = xgb.DMatrix(X1, enable_categorical=True)
    dmat2 = xgb.DMatrix(X2, enable_categorical=True)

    fill_pct_next_day = float(m1.predict(dmat1)[0])
    overflow_risk = float(m2.predict(dmat2)[0])
    if not np.isfinite(fill_pct_next_day):
        fill_pct_next_day = float(last_row["fill_percentage_end_of_day"] or 0)
    if not np.isfinite(overflow_risk):
        overflow_risk = 0.0

    current_fill = last_row["fill_percentage_end_of_day"]
    current_fill = float(current_fill) if pd.notna(current_fill) else 0.0
    if current_fill_override is not None:
        current_fill = float(current_fill_override)

    # Multi-horizon display: honest linear interpolation between the current
    # reading and the next-day point estimate (documented simplification --
    # models are daily-granularity; see ML_PIPELINE_PLAN.md Section 7.3).
    horizons = {}
    for label, frac in (("1h", 1 / 24), ("6h", 6 / 24), ("12h", 12 / 24), ("24h", 1.0)):
        horizons[label] = round(current_fill + (fill_pct_next_day - current_fill) * frac, 2)

    return {
        "binId": bin_id,
        "clusterId": str(target_row["bin_cluster_id"].iloc[0]) if "bin_cluster_id" in target_row else None,
        "currentFillPct": round(current_fill, 2),
        "fillPctNextDay": round(fill_pct_next_day, 2),
        "overflowRisk": round(overflow_risk, 4),
        "horizons": horizons,
        "modelVersion": "xgboost-v1",
        "asOfDate": str(last_row["date"].date()),
        "predictedDate": str((last_row["date"] + pd.Timedelta(days=1)).date()),
    }


def predict_all(overrides: Optional[dict[str, float]] = None) -> list[dict]:
    overrides = overrides or {}
    out = []
    for bin_id in list_bin_ids():
        try:
            out.append(predict_bin(bin_id, overrides.get(bin_id)))
        except Exception as exc:  # keep one bad bin from failing the whole batch
            out.append({"binId": bin_id, "error": str(exc)})
    return out


if __name__ == "__main__":
    import json
    import sys

    bid = sys.argv[1] if len(sys.argv) > 1 else list_bin_ids()[0]
    print(json.dumps(predict_bin(bid), indent=2, default=str))
