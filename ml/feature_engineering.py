"""Shared feature-engineering pipeline for the Smart Waste Management ML models.

Every notebook (01-04) imports from here instead of duplicating logic, so training
and (eventually) inference share the exact same feature computation -- see
ML_PIPELINE_PLAN.md Section 7, step 2 ("this must use the *exact same feature
engineering code* as training ... to avoid train/serve skew").

Section references below point at ML_PIPELINE_PLAN.md.
"""
import numpy as np
import pandas as pd

RAW_PATH = "waste_bin_dataset.csv"
CLUSTER_MAPPING_PATH = "bin_cluster_mapping.csv"

TARGET_REGRESSION = "target_fill_percentage_next_day"
TARGET_CLASSIFICATION = "target_overflow_risk_next_day"

OUTDOOR_ZONE_TYPES = {"market", "tourist"}
WEEKEND_DAYS = {"Saturday", "Sunday"}

# Native low-cardinality categoricals (Section 3.5) -- cast to pandas "category"
# dtype so XGBoost's enable_categorical=True can split on them natively instead
# of blowing up dimensionality with one-hot encoding.
BASE_CATEGORICAL_COLUMNS = ["zone_type", "waste_type", "season", "event_type", "day_of_week"]

# Columns that are identifiers / free-text / raw targets -- never fed to a model
# directly (Section 3.5 / Section 5 "Excluded from the feature matrix").
NON_FEATURE_COLUMNS = [
    "bin_id", "zone_id", "zone_name", "date",
    "latitude", "longitude", "holiday_name", "festival_name",
    TARGET_REGRESSION, TARGET_CLASSIFICATION,
]

_SENTINEL_DAYS = 999  # "no such event has ever happened yet for this bin"


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_raw(path: str = RAW_PATH) -> pd.DataFrame:
    """Load the raw simulated dataset, sorted per-bin by date (required for
    every lag/rolling computation in build_features to be positionally correct)."""
    df = pd.read_csv(path, parse_dates=["date"])
    # target_overflow_risk_next_day is read as object because NaN forces pandas
    # off the bool dtype -- coerce to a clean float 0/1/NaN classification target.
    df[TARGET_CLASSIFICATION] = df[TARGET_CLASSIFICATION].map({True: 1.0, False: 0.0, "True": 1.0, "False": 0.0})
    df = df.sort_values(["bin_id", "date"]).reset_index(drop=True)
    return df


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _grouped_shift(df: pd.DataFrame, col: str, periods: int, id_col: str = "bin_id") -> pd.Series:
    return df.groupby(id_col)[col].shift(periods)


def _grouped_rolling(df: pd.DataFrame, col: str, window: int, stat: str, id_col: str = "bin_id") -> pd.Series:
    g = df.groupby(id_col)[col].rolling(window, min_periods=1)
    out = getattr(g, stat)()
    return out.reset_index(level=0, drop=True)


def _days_since_last_flag(df: pd.DataFrame, flag: pd.Series, id_col: str = "bin_id", date_col: str = "date") -> pd.Series:
    """Vectorized 'days since this boolean flag was last True', inclusive of
    today (0 if flag is True today). NaT (never happened yet for this bin) is
    left as NaN for the caller to fill with a sentinel."""
    flag_date = df[date_col].where(flag.astype(bool))
    last_flag_date = flag_date.groupby(df[id_col]).ffill()
    return (df[date_col] - last_flag_date).dt.days


def _build_calendar(df: pd.DataFrame) -> pd.DataFrame:
    """Date-level (not bin-level) holiday/festival distances -- computed once on
    the unique calendar and merged back, since every bin shares the same calendar."""
    cal = df[["date", "is_holiday", "is_festival"]].drop_duplicates("date").sort_values("date").reset_index(drop=True)
    all_dates = cal["date"].to_numpy()
    holiday_dates = np.sort(cal.loc[cal["is_holiday"], "date"].to_numpy())
    festival_dates = np.sort(cal.loc[cal["is_festival"], "date"].to_numpy())

    def dist_to_next(dates, event_dates):
        if len(event_dates) == 0:
            return np.full(len(dates), np.nan)
        idx = np.searchsorted(event_dates, dates, side="left")
        has_next = idx < len(event_dates)
        next_d = event_dates[np.clip(idx, 0, len(event_dates) - 1)]
        days = (next_d - dates) / np.timedelta64(1, "D")
        return np.where(has_next, days, np.nan)

    def dist_since_last(dates, event_dates):
        if len(event_dates) == 0:
            return np.full(len(dates), np.nan)
        idx = np.searchsorted(event_dates, dates, side="right") - 1
        has_prev = idx >= 0
        prev_d = event_dates[np.clip(idx, 0, len(event_dates) - 1)]
        days = (dates - prev_d) / np.timedelta64(1, "D")
        return np.where(has_prev, days, np.nan)

    days_to_next_festival = dist_to_next(all_dates, festival_dates)
    cal["days_to_next_holiday"] = dist_to_next(all_dates, holiday_dates)
    cal["days_since_last_holiday"] = dist_since_last(all_dates, holiday_dates)
    cal["is_festival_eve"] = np.isin(days_to_next_festival, [1, 2]).astype(int)
    return cal[["date", "days_to_next_holiday", "days_since_last_holiday", "is_festival_eve"]]


def _ffill_weather_within_zone(df: pd.DataFrame) -> pd.DataFrame:
    """Section 3.6: weather gaps are whole-city-day outages, so forward-fill
    per zone_id sorted by date rather than per bin (avoids order-dependency
    on the bin_id/date sort the rest of the pipeline relies on)."""
    weather_cols = ["rainfall_mm", "temperature_c", "humidity_percent"]
    weather = (
        df[["zone_id", "date"] + weather_cols]
        .drop_duplicates(["zone_id", "date"])
        .sort_values(["zone_id", "date"])
    )
    weather[weather_cols] = weather.groupby("zone_id")[weather_cols].transform(lambda s: s.ffill())
    df = df.drop(columns=weather_cols).merge(weather, on=["zone_id", "date"], how="left")
    return df


# ---------------------------------------------------------------------------
# Main feature pipeline (Section 3)
# ---------------------------------------------------------------------------

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Expand the raw per-bin-per-day table with lag/rolling/cyclical/interaction
    features. All lag/rolling features are computed strictly on
    groupby('bin_id') + shift()/rolling() so nothing from a later date leaks
    backwards (Section 3.1's #1 review concern).

    Note on "current state": every column already in a given row (day d) --
    including fill_percentage_end_of_day, waste_generated_kg, overflow_occurred,
    collection_occurred -- is fully known by the time the nightly batch job runs
    for day d (Section 7, step 1) and is chronologically *before* the target
    (day d+1's fill state), so it is legitimate signal, not leakage. Only the
    two target columns themselves are excluded (see NON_FEATURE_COLUMNS).
    """
    df = df.sort_values(["bin_id", "date"]).reset_index(drop=True)
    df = _ffill_weather_within_zone(df)
    df = df.sort_values(["bin_id", "date"]).reset_index(drop=True)

    # --- 3.1 Lag features -------------------------------------------------
    for n in (1, 2, 3, 7):
        df[f"fill_pct_lag_{n}d"] = _grouped_shift(df, "fill_percentage_end_of_day", n)
        df[f"waste_kg_lag_{n}d"] = _grouped_shift(df, "waste_generated_kg", n)

    for n in (3, 7, 14):
        df[f"rolling_mean_fill_pct_{n}d"] = _grouped_rolling(df, "fill_percentage_end_of_day", n, "mean")
    df["rolling_std_fill_pct_7d"] = _grouped_rolling(df, "fill_percentage_end_of_day", 7, "std")
    df["rolling_max_fill_pct_7d"] = _grouped_rolling(df, "fill_percentage_end_of_day", 7, "max")
    for n in (7, 14):
        df[f"waste_kg_rolling_mean_{n}d"] = _grouped_rolling(df, "waste_generated_kg", n, "mean")

    df["days_since_last_overflow"] = _days_since_last_flag(df, df["overflow_occurred"]).fillna(_SENTINEL_DAYS)
    df["sensor_staleness_days"] = _days_since_last_flag(df, df["fill_percentage_end_of_day"].notna()).fillna(_SENTINEL_DAYS)

    df["_collection_int"] = df["collection_occurred"].astype(int)
    df["collection_frequency_14d"] = _grouped_rolling(df, "_collection_int", 14, "sum")
    df = df.drop(columns="_collection_int")

    df["fill_rate_per_day"] = df["fill_percentage_end_of_day"] - df["fill_pct_lag_1d"]
    df["fill_acceleration"] = df.groupby("bin_id")["fill_rate_per_day"].diff()

    # --- 3.2 Calendar / cyclical features ----------------------------------
    dow_num = df["date"].dt.dayofweek
    df["dow_sin"] = np.sin(2 * np.pi * dow_num / 7)
    df["dow_cos"] = np.cos(2 * np.pi * dow_num / 7)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["is_weekend"] = df["day_of_week"].isin(WEEKEND_DAYS).astype(int)

    calendar = _build_calendar(df)
    df = df.merge(calendar, on="date", how="left")
    df["days_to_next_holiday"] = df["days_to_next_holiday"].fillna(_SENTINEL_DAYS)
    df["days_since_last_holiday"] = df["days_since_last_holiday"].fillna(_SENTINEL_DAYS)

    # --- 3.3 Interaction / domain features ---------------------------------
    df["capacity_utilization_ratio"] = (df["previous_fill_percentage"] / 100) * df["bin_capacity_liters"]
    df["waste_per_capita_proxy"] = df["waste_generated_kg"] / df["population_density_per_sqkm"]
    df["footfall_per_restaurant"] = df["footfall_estimate"] / (df["nearby_restaurants_count"] + 1)
    df["rain_x_zone_outdoor"] = df["rainfall_mm"] * df["zone_type"].isin(OUTDOOR_ZONE_TYPES).astype(int)

    df = df.sort_values(["bin_id", "date"]).reset_index(drop=True)
    return df


# ---------------------------------------------------------------------------
# Per-bin aggregates for clustering (Section 6.3)
# ---------------------------------------------------------------------------

def build_bin_aggregates(df: pd.DataFrame) -> pd.DataFrame:
    """Collapse the daily panel to one row per bin -- the input to Model 3
    (K-Means). Works on either the raw frame or the build_features() output,
    since it only touches raw columns that exist in both."""
    is_weekend = df["day_of_week"].isin(WEEKEND_DAYS)
    is_rain_day = df["rainfall_mm"].fillna(0) > 5

    def _ratio(numer_mask, denom_mask, values):
        numer = values[numer_mask].mean()
        denom = values[denom_mask].mean()
        if pd.isna(denom) or denom == 0:
            return 1.0
        return numer / denom

    rows = []
    for bin_id, g in df.groupby("bin_id"):
        fill = g["fill_percentage_before_collection"]
        gw = is_weekend.loc[g.index]
        gr = is_rain_day.loc[g.index]
        gf = g["is_festival"].astype(bool)

        collections = g.loc[g["collection_occurred"], "days_since_last_collection"]

        rows.append({
            "bin_id": bin_id,
            "zone_id": g["zone_id"].iloc[0],
            "zone_name": g["zone_name"].iloc[0],
            "zone_type": g["zone_type"].iloc[0],
            "bin_capacity_liters": g["bin_capacity_liters"].iloc[0],
            "avg_fill_pct": fill.mean(),
            "std_fill_pct": fill.std(),
            "avg_waste_kg_per_day": g["waste_generated_kg"].mean(),
            "overflow_rate": g["overflow_occurred"].mean(),
            "avg_days_between_collections": collections.mean() if len(collections) else g["days_since_last_collection"].mean(),
            "festival_sensitivity": _ratio(gf, ~gf, fill),
            "weekend_sensitivity": _ratio(gw, ~gw, fill),
            "rain_sensitivity": _ratio(gr, ~gr, fill),
        })

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Cluster label merge (Section 3.4) -- consumed by Notebooks 03 & 04
# ---------------------------------------------------------------------------

def merge_cluster_labels(df: pd.DataFrame, path: str = CLUSTER_MAPPING_PATH) -> pd.DataFrame:
    """Merge only bin_cluster_id (the model feature). cluster_label (the
    human-readable name from Notebook 02) is left out of this join -- it's
    fully redundant with bin_cluster_id and, being a free-text string, would
    otherwise need its own categorical casting just to sit unused in X."""
    mapping = pd.read_csv(path, usecols=["bin_id", "bin_cluster_id"])
    mapping["bin_cluster_id"] = mapping["bin_cluster_id"].astype(str)
    return df.merge(mapping, on="bin_id", how="left")


# ---------------------------------------------------------------------------
# Categorical casting (must run on the FULL frame, before splitting)
# ---------------------------------------------------------------------------

def cast_categorical_columns(df: pd.DataFrame, extra_categorical=None) -> pd.DataFrame:
    """Cast low-cardinality columns to pandas 'category' dtype for XGBoost's
    native categorical support.

    Must be called on the full dataframe *before* chronological_split(), not
    separately per split. A category dtype's `.categories` list is fixed at
    cast time; casting after splitting risks train/val/test (or a later demo
    sample) ending up with different category levels for the same column,
    which XGBoost will treat inconsistently at predict time.
    """
    df = df.copy()
    cols = list(BASE_CATEGORICAL_COLUMNS) + list(extra_categorical or [])
    for col in cols:
        if col in df.columns:
            df[col] = df[col].astype("category")
    return df


# ---------------------------------------------------------------------------
# Chronological split (Section 6.4 / DATA_DICTIONARY.md Section 5)
# ---------------------------------------------------------------------------

def chronological_split(df: pd.DataFrame, train_end: str = "2024-11-30", val_end: str = "2025-02-28"):
    train_end = pd.Timestamp(train_end)
    val_end = pd.Timestamp(val_end)
    train = df[df["date"] <= train_end].reset_index(drop=True)
    val = df[(df["date"] > train_end) & (df["date"] <= val_end)].reset_index(drop=True)
    test = df[df["date"] > val_end].reset_index(drop=True)
    return train, val, test


# ---------------------------------------------------------------------------
# Model-ready X / y / meta frame
# ---------------------------------------------------------------------------

def get_model_frame(df: pd.DataFrame, target: str, extra_categorical=None):
    """Drop rows with a null target, then split into (X, y, meta) where X
    excludes identifiers/leakage columns and both raw target columns, y is the
    requested target, and meta carries bin_id/date for reporting."""
    kept = df.dropna(subset=[target]).reset_index(drop=True)

    if extra_categorical:
        kept = cast_categorical_columns(kept, extra_categorical=extra_categorical)

    drop_cols = [c for c in NON_FEATURE_COLUMNS if c in kept.columns]
    X = kept.drop(columns=drop_cols)
    y = kept[target].astype(float)
    meta = kept[["bin_id", "date"]]
    return X, y, meta
