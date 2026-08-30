"""
generate_waste_dataset.py
==========================
Reproducible generator for a synthetic-but-mechanistic municipal solid-waste
bin-fill dataset for a mid-sized Indian coastal city (modelled loosely on
Mangaluru, Karnataka), for the "AI-based Smart Waste Management" hackathon
project.

WHY THIS ISN'T "RANDOM DATA PADDING"
-------------------------------------
Instead of sampling every column independently from random(), this script
runs a day-by-day STATEFUL SIMULATION per bin:

    fill_level(t) = fill_level(t-1) + inflow(t) - collected(t)

`inflow(t)` is built from a small set of causal drivers (zone type, day of
week, season/monsoon, rainfall, festivals/holidays, local market days, rare
"major events", and multiplicative noise) the same way real municipal waste
generation is driven. Bins genuinely fill up over several days, occasionally
overflow, and get emptied on a schedule OR early if they run full - so the
correlations in the final table (e.g. "market-zone bins fill 3x faster on
festival weekends") emerge from the simulation mechanics rather than being
hard-coded per row.

Run:
    python generate_waste_dataset.py

Output:
    waste_bin_dataset.csv   (main dataset)
    bins_master.csv         (static bin metadata, useful for GIS/map demos)
"""

import numpy as np
import pandas as pd
from datetime import date, timedelta

# --------------------------------------------------------------------------
# 0. REPRODUCIBILITY
# --------------------------------------------------------------------------
SEED = 42
rng = np.random.default_rng(SEED)

# --------------------------------------------------------------------------
# 1. CITY ZONES  (modelled on real Mangaluru neighbourhoods / zone archetypes)
# --------------------------------------------------------------------------
# weekly_market_day: 0=Mon ... 6=Sun. -1 = no dedicated weekly "santhe" day.
ZONES = [
    dict(zone_id="Z01", zone_name="Hampankatta",   zone_type="market",          lat=12.8698, lon=74.8420, pop_density=19500, restaurants=48, markets=14, base_footfall=11000, weekly_market_day=2),
    dict(zone_id="Z02", zone_name="Bunder",         zone_type="market",          lat=12.8625, lon=74.8360, pop_density=16800, restaurants=30, markets=18, base_footfall=9500,  weekly_market_day=0),
    dict(zone_id="Z03", zone_name="Mangaladevi",    zone_type="mixed_use",       lat=12.8735, lon=74.8500, pop_density=14200, restaurants=22, markets=6,  base_footfall=6000,  weekly_market_day=-1),
    dict(zone_id="Z04", zone_name="Kadri",          zone_type="mixed_use",       lat=12.8785, lon=74.8460, pop_density=13500, restaurants=26, markets=5,  base_footfall=7200,  weekly_market_day=4),
    dict(zone_id="Z05", zone_name="Balmatta",       zone_type="commercial",      lat=12.8745, lon=74.8425, pop_density=15200, restaurants=35, markets=4,  base_footfall=8600,  weekly_market_day=-1),
    dict(zone_id="Z06", zone_name="Falnir",         zone_type="residential_high",lat=12.8770, lon=74.8390, pop_density=17800, restaurants=10, markets=2,  base_footfall=3200,  weekly_market_day=-1),
    dict(zone_id="Z07", zone_name="Kankanady",      zone_type="commercial",      lat=12.8650, lon=74.8490, pop_density=15900, restaurants=20, markets=3,  base_footfall=7800,  weekly_market_day=-1),
    dict(zone_id="Z08", zone_name="Surathkal",      zone_type="institutional",   lat=13.0100, lon=74.7940, pop_density=6200,  restaurants=18, markets=2,  base_footfall=5200,  weekly_market_day=-1),
    dict(zone_id="Z09", zone_name="Panambur",       zone_type="tourist",         lat=12.9490, lon=74.8060, pop_density=4100,  restaurants=15, markets=1,  base_footfall=4800,  weekly_market_day=-1),
    dict(zone_id="Z10", zone_name="Bejai",          zone_type="residential_low", lat=12.8850, lon=74.8560, pop_density=9200,  restaurants=8,  markets=1,  base_footfall=2100,  weekly_market_day=-1),
    dict(zone_id="Z11", zone_name="Derebail",       zone_type="residential_low", lat=12.9080, lon=74.8390, pop_density=7800,  restaurants=6,  markets=1,  base_footfall=1800,  weekly_market_day=-1),
    dict(zone_id="Z12", zone_name="Bikarnakatta",   zone_type="industrial",      lat=12.9230, lon=74.8670, pop_density=3600,  restaurants=5,  markets=1,  base_footfall=1500,  weekly_market_day=-1),
]

# Bins per zone_type, capacity mix (litres), collection/behaviour params.
ZONE_TYPE_PARAMS = {
    "market":           dict(n_bins=(18, 26), capacity_mix={120:0.05,240:0.15,660:0.45,1100:0.35}, sched_days=1, dyn_prob=0.85, iot_rate=0.75, weekend_factor=1.35, waste_type_mix={"wet_organic":0.55,"mixed":0.40,"dry_recyclable":0.05}),
    "commercial":       dict(n_bins=(12, 18), capacity_mix={120:0.10,240:0.30,660:0.45,1100:0.15}, sched_days=2, dyn_prob=0.80, iot_rate=0.70, weekend_factor=1.25, waste_type_mix={"wet_organic":0.20,"mixed":0.65,"dry_recyclable":0.15}),
    "mixed_use":        dict(n_bins=(10, 16), capacity_mix={120:0.20,240:0.40,660:0.30,1100:0.10}, sched_days=2, dyn_prob=0.75, iot_rate=0.60, weekend_factor=1.15, waste_type_mix={"wet_organic":0.30,"mixed":0.55,"dry_recyclable":0.15}),
    "residential_high": dict(n_bins=(10, 14), capacity_mix={120:0.35,240:0.45,660:0.20,1100:0.00}, sched_days=3, dyn_prob=0.65, iot_rate=0.45, weekend_factor=1.10, waste_type_mix={"wet_organic":0.35,"mixed":0.55,"dry_recyclable":0.10}),
    "residential_low":  dict(n_bins=(6, 10),  capacity_mix={120:0.55,240:0.35,660:0.10,1100:0.00}, sched_days=4, dyn_prob=0.55, iot_rate=0.30, weekend_factor=1.05, waste_type_mix={"wet_organic":0.30,"mixed":0.60,"dry_recyclable":0.10}),
    "institutional":    dict(n_bins=(8, 12),  capacity_mix={120:0.15,240:0.35,660:0.40,1100:0.10}, sched_days=2, dyn_prob=0.70, iot_rate=0.80, weekend_factor=0.55, waste_type_mix={"wet_organic":0.25,"mixed":0.55,"dry_recyclable":0.20}),
    "tourist":          dict(n_bins=(8, 12),  capacity_mix={120:0.10,240:0.30,660:0.45,1100:0.15}, sched_days=1, dyn_prob=0.80, iot_rate=0.55, weekend_factor=1.60, waste_type_mix={"wet_organic":0.15,"mixed":0.55,"dry_recyclable":0.30}),
    "industrial":       dict(n_bins=(5, 8),   capacity_mix={120:0.10,240:0.30,660:0.40,1100:0.20}, sched_days=3, dyn_prob=0.60, iot_rate=0.65, weekend_factor=0.70, waste_type_mix={"wet_organic":0.05,"mixed":0.55,"dry_recyclable":0.40}),
}

WASTE_DENSITY_KG_PER_L = {"wet_organic": 0.34, "mixed": 0.21, "dry_recyclable": 0.11}

# --------------------------------------------------------------------------
# 2. DATE RANGE  (2 full years -> captures monsoon cycle twice)
# --------------------------------------------------------------------------
START_DATE = date(2023, 6, 1)
END_DATE = date(2025, 5, 31)
DATES = pd.date_range(START_DATE, END_DATE, freq="D")
N_DAYS = len(DATES)

# --------------------------------------------------------------------------
# 3. NATIONAL / REGIONAL HOLIDAYS & FESTIVALS (approximate real dates)
# --------------------------------------------------------------------------
FIXED_HOLIDAYS = {  # (month, day): name -- repeats every year
    (1, 1): "New Year", (1, 26): "Republic Day", (4, 14): "Ambedkar Jayanti",
    (5, 1): "May Day", (8, 15): "Independence Day", (10, 2): "Gandhi Jayanti",
    (12, 25): "Christmas",
}
FESTIVAL_WINDOWS = {  # explicit dates per year - approx real festival dates
    "Ugadi":            ["2024-04-09", "2025-03-30"],
    "Eid al-Fitr":       ["2024-04-11", "2025-03-31"],
    "Ganesh Chaturthi":  ["2023-09-19", "2024-09-07"],
    "Navratri/Dasara":   [("2023-10-15", "2023-10-24"), ("2024-10-03", "2024-10-12"), ("2025-09-22", "2025-10-01")],
    "Diwali":            ["2023-11-12", "2024-10-31"],
    "Karavali Utsav":    [("2023-12-27", "2024-01-02"), ("2024-12-27", "2025-01-02")],
}

def build_calendar():
    holiday_name = pd.Series(index=DATES, dtype=object)
    is_festival = pd.Series(False, index=DATES)
    festival_name = pd.Series(index=DATES, dtype=object)

    for d in DATES:
        key = (d.month, d.day)
        if key in FIXED_HOLIDAYS:
            holiday_name.loc[d] = FIXED_HOLIDAYS[key]

    for fname, entries in FESTIVAL_WINDOWS.items():
        for e in entries:
            if isinstance(e, tuple):
                s, en = pd.Timestamp(e[0]), pd.Timestamp(e[1])
                mask = (DATES >= s) & (DATES <= en)
            else:
                s = pd.Timestamp(e)
                mask = (DATES >= s) & (DATES <= s + pd.Timedelta(days=1))
            is_festival.loc[mask] = True
            festival_name.loc[mask] = fname

    is_holiday = holiday_name.notna()

    # Season (coastal Karnataka climate)
    month = DATES.month
    season = np.select(
        [np.isin(month, [12, 1, 2]), np.isin(month, [3, 4, 5]),
         np.isin(month, [6, 7, 8, 9]), np.isin(month, [10, 11])],
        ["Winter", "Summer", "Monsoon", "Post-Monsoon"], default="Summer",
    )

    # Rainfall: heavy + frequent in monsoon (Jun-Sep), light showers post-monsoon, rare otherwise
    rainfall = np.zeros(N_DAYS)
    for i, m in enumerate(month):
        if m in (6, 7):                      # peak monsoon
            rainfall[i] = rng.gamma(shape=2.0, scale=45) if rng.random() < 0.85 else 0
        elif m in (8, 9):                     # monsoon tapering
            rainfall[i] = rng.gamma(shape=1.6, scale=30) if rng.random() < 0.65 else 0
        elif m in (10, 11):                   # post-monsoon showers
            rainfall[i] = rng.gamma(shape=1.2, scale=15) if rng.random() < 0.25 else 0
        else:                                  # dry season, rare stray showers
            rainfall[i] = rng.gamma(shape=1.0, scale=8) if rng.random() < 0.05 else 0
    rainfall = np.round(rainfall, 1)

    # Temperature: coastal, narrow band, slightly warmer Mar-May
    temp_base = np.select(
        [np.isin(month, [3, 4, 5]), np.isin(month, [12, 1])],
        [31.5, 25.5], default=28.5,
    )
    temperature = np.round(temp_base + rng.normal(0, 1.6, N_DAYS) - 0.05 * np.sqrt(rainfall), 1)

    # Humidity: high year-round, higher with rainfall
    humidity = np.clip(np.round(68 + 0.06 * rainfall + rng.normal(0, 4, N_DAYS)), 45, 99)

    cal = pd.DataFrame({
        "date": DATES, "day_of_week": DATES.day_name(), "dow_num": DATES.dayofweek,
        "month": month, "season": season,
        "is_holiday": is_holiday.values, "holiday_name": holiday_name.values,
        "is_festival": is_festival.values, "festival_name": festival_name.values,
        "rainfall_mm": rainfall, "temperature_c": temperature, "humidity_percent": humidity,
    })
    return cal

calendar = build_calendar()

# --------------------------------------------------------------------------
# 4. BUILD BIN MASTER TABLE
# --------------------------------------------------------------------------
bin_rows = []
bin_counter = 1
for z in ZONES:
    p = ZONE_TYPE_PARAMS[z["zone_type"]]
    n_bins = rng.integers(p["n_bins"][0], p["n_bins"][1] + 1)
    caps, probs = zip(*p["capacity_mix"].items())
    wt_types, wt_probs = zip(*p["waste_type_mix"].items())
    for _ in range(n_bins):
        capacity = int(rng.choice(caps, p=probs))
        waste_type = rng.choice(wt_types, p=wt_probs)
        has_iot = rng.random() < p["iot_rate"]
        # Baseline daily inflow (litres/day) scales with capacity tier & zone footfall share
        base_rate_l = capacity * rng.uniform(0.18, 0.34) * (1 + 0.15 * rng.standard_normal())
        base_rate_l = max(base_rate_l, capacity * 0.08)
        bin_rows.append(dict(
            bin_id=f"BIN{bin_counter:04d}", zone_id=z["zone_id"], zone_name=z["zone_name"],
            zone_type=z["zone_type"], latitude=round(z["lat"] + rng.uniform(-0.006, 0.006), 6),
            longitude=round(z["lon"] + rng.uniform(-0.006, 0.006), 6),
            bin_capacity_liters=capacity, waste_type=waste_type, has_iot_sensor=has_iot,
            population_density_per_sqkm=int(z["pop_density"] * rng.uniform(0.9, 1.1)),
            nearby_restaurants_count=max(0, int(round(z["restaurants"] * rng.uniform(0.7, 1.3) / max(n_bins/6,1)))),
            nearby_markets_count=max(0, int(round(z["markets"] * rng.uniform(0.7, 1.3) / max(n_bins/6,1)))),
            distance_to_nearest_bin_m=round(max(15, rng.normal(180 if z["zone_type"] in ("market","commercial") else 320, 60)), 1),
            base_rate_liters=base_rate_l, scheduled_interval_days=p["sched_days"],
            dynamic_collection_prob=p["dyn_prob"], weekend_factor=p["weekend_factor"],
            weekly_market_day=z["weekly_market_day"], base_footfall=z["base_footfall"] / n_bins,
        ))
        bin_counter += 1

bins_df = pd.DataFrame(bin_rows)
N_BINS = len(bins_df)
print(f"Generated {N_BINS} bins across {len(ZONES)} zones -> {N_BINS * N_DAYS:,} bin-day rows expected")

# --------------------------------------------------------------------------
# 5. RARE "MAJOR EVENT" CALENDAR (per zone) - concerts, sports, rallies etc.
# --------------------------------------------------------------------------
major_event_mask = np.zeros((N_DAYS, len(ZONES)), dtype=bool)
zone_idx = {z["zone_id"]: i for i, z in enumerate(ZONES)}
for i in range(len(ZONES)):
    n_events = rng.integers(4, 10)  # a handful of major events per zone over 2 years
    event_days = rng.choice(N_DAYS, size=n_events, replace=False)
    major_event_mask[event_days, i] = True

# --------------------------------------------------------------------------
# 6. STATEFUL DAY-BY-DAY SIMULATION (vectorised across all bins per day)
# --------------------------------------------------------------------------
zone_type_arr = bins_df["zone_type"].values
capacity_arr = bins_df["bin_capacity_liters"].values.astype(float)
base_rate_arr = bins_df["base_rate_liters"].values
sched_interval_arr = bins_df["scheduled_interval_days"].values
dyn_prob_arr = bins_df["dynamic_collection_prob"].values
weekend_factor_arr = bins_df["weekend_factor"].values
weekly_market_day_arr = bins_df["weekly_market_day"].values
density_arr = bins_df["waste_type"].map(WASTE_DENSITY_KG_PER_L).values
zone_col_idx = bins_df["zone_id"].map(zone_idx).values
base_footfall_arr = bins_df["base_footfall"].values
iot_arr = bins_df["has_iot_sensor"].values

# Zone-type outdoor-exposure factor: how much rain suppresses footfall/waste
RAIN_SENSITIVITY = {"market": 0.22, "tourist": 0.35, "commercial": 0.12, "mixed_use": 0.15,
                     "residential_high": 0.05, "residential_low": 0.05, "institutional": 0.08, "industrial": 0.03}
rain_sens_arr = bins_df["zone_type"].map(RAIN_SENSITIVITY).values

# preallocate state
fill_l = capacity_arr * rng.uniform(0.05, 0.30, N_BINS)
days_since_last = rng.integers(0, 3, N_BINS).astype(float)

# preallocate output arrays
total_rows = N_DAYS * N_BINS
out = {col: np.empty(total_rows, dtype=object) for col in [
    "date", "day_of_week", "month", "season", "is_holiday", "holiday_name",
    "is_festival", "festival_name", "event_type",
]}
out_num = {col: np.empty(total_rows, dtype=float) for col in [
    "event_multiplier", "rainfall_mm", "temperature_c", "humidity_percent",
    "footfall_estimate", "previous_fill_percentage", "previous_waste_kg",
    "days_since_last_collection", "waste_generated_kg",
    "fill_percentage_before_collection", "waste_collected_kg", "fill_percentage_end_of_day",
]}
out_bool = {col: np.empty(total_rows, dtype=bool) for col in [
    "overflow_occurred", "collection_scheduled", "collection_occurred",
]}
bin_id_col = np.empty(total_rows, dtype=object)

prev_waste_kg = np.zeros(N_BINS)  # yesterday's inflow, for "previous_waste_kg" feature

row_ptr = 0
for day_i in range(N_DAYS):
    crow = calendar.iloc[day_i]
    dow_num = crow["dow_num"]
    is_weekend = dow_num >= 5

    # --- weekly market day multiplier (zone-level, broadcast to bins) ---
    weekly_market_today = (weekly_market_day_arr == dow_num)

    # --- major event multiplier (zone-level, broadcast to bins) ---
    major_event_today = major_event_mask[day_i, zone_col_idx]

    # --- combined event_type / multiplier per bin ---
    event_multiplier = np.ones(N_BINS)
    event_type = np.full(N_BINS, "none", dtype=object)

    if crow["is_holiday"]:
        event_multiplier *= 0.85          # many holidays -> lower commercial/institutional activity, higher residential
        event_type[:] = "holiday"
    if weekly_market_today.any():
        event_multiplier[weekly_market_today] *= 1.5
        event_type[weekly_market_today] = "weekly_market"
    if crow["is_festival"]:
        event_multiplier *= 2.3
        event_type[:] = "festival"
    if major_event_today.any():
        event_multiplier[major_event_today] *= rng.uniform(2.5, 3.5)
        event_type[major_event_today] = "major_event"

    # weekend effect (zone-type specific, e.g. institutional drops on weekends)
    if is_weekend:
        event_multiplier *= weekend_factor_arr

    # --- weather effect ---
    rain = crow["rainfall_mm"]
    rain_indicator = min(rain / 40.0, 1.0)
    weather_factor = 1.0 - rain_sens_arr * rain_indicator
    heat_bonus = 1.0 + np.clip((crow["temperature_c"] - 30) * 0.01, 0, 0.08)  # more packaged drinks/litter in heat
    weather_factor = weather_factor * heat_bonus

    # --- multiplicative noise (unpredictable day-to-day variation) ---
    noise = np.clip(rng.normal(1.0, 0.16, N_BINS), 0.4, 2.2)

    # --- inflow ---
    daily_waste_liters = base_rate_arr * event_multiplier * weather_factor * noise
    waste_generated_kg = daily_waste_liters * density_arr

    previous_fill_pct = (fill_l / capacity_arr) * 100.0

    fill_l = fill_l + daily_waste_liters
    fill_l = np.minimum(fill_l, capacity_arr * 1.6)  # physical spillage cap: excess litters the street, not the bin
    fill_pct_before = (fill_l / capacity_arr) * 100.0
    overflow = fill_pct_before > 100.0

    scheduled = days_since_last >= sched_interval_arr
    dynamic_trigger = (fill_pct_before >= 85.0) & (rng.random(N_BINS) < dyn_prob_arr)
    overflow_response = overflow & (rng.random(N_BINS) < 0.90)
    collect_mask = scheduled | dynamic_trigger | overflow_response

    waste_collected_kg = np.where(collect_mask, fill_l * density_arr, 0.0)
    residual_frac = rng.uniform(0.03, 0.12, N_BINS)
    fill_l = np.where(collect_mask, fill_l * residual_frac, fill_l)
    days_since_last = np.where(collect_mask, 0.0, days_since_last + 1.0)
    fill_pct_end = (fill_l / capacity_arr) * 100.0

    footfall = np.maximum(0, np.round(base_footfall_arr * event_multiplier * weather_factor * rng.normal(1.0, 0.12, N_BINS)))

    sl = slice(row_ptr, row_ptr + N_BINS)
    out["date"][sl] = crow["date"].strftime("%Y-%m-%d")
    out["day_of_week"][sl] = crow["day_of_week"]
    out["month"][sl] = crow["month"]
    out["season"][sl] = crow["season"]
    out["is_holiday"][sl] = crow["is_holiday"]
    out["holiday_name"][sl] = crow["holiday_name"] if pd.notna(crow["holiday_name"]) else None
    out["is_festival"][sl] = crow["is_festival"]
    out["festival_name"][sl] = crow["festival_name"] if pd.notna(crow["festival_name"]) else None
    out["event_type"][sl] = event_type

    out_num["event_multiplier"][sl] = np.round(event_multiplier, 3)
    out_num["rainfall_mm"][sl] = rain
    out_num["temperature_c"][sl] = crow["temperature_c"]
    out_num["humidity_percent"][sl] = crow["humidity_percent"]
    out_num["footfall_estimate"][sl] = footfall
    out_num["previous_fill_percentage"][sl] = np.round(previous_fill_pct, 2)
    out_num["previous_waste_kg"][sl] = np.round(prev_waste_kg, 2)
    out_num["days_since_last_collection"][sl] = days_since_last  # post-update value (0 if collected today)
    out_num["waste_generated_kg"][sl] = np.round(waste_generated_kg, 2)
    out_num["fill_percentage_before_collection"][sl] = np.round(fill_pct_before, 2)
    out_num["waste_collected_kg"][sl] = np.round(waste_collected_kg, 2)
    out_num["fill_percentage_end_of_day"][sl] = np.round(fill_pct_end, 2)

    out_bool["overflow_occurred"][sl] = overflow
    out_bool["collection_scheduled"][sl] = scheduled
    out_bool["collection_occurred"][sl] = collect_mask

    bin_id_col[sl] = bins_df["bin_id"].values

    prev_waste_kg = waste_generated_kg
    row_ptr += N_BINS

# --------------------------------------------------------------------------
# 7. ASSEMBLE FINAL DATAFRAME
# --------------------------------------------------------------------------
df = pd.DataFrame({"bin_id": bin_id_col, **out, **out_num, **out_bool})
df = df.merge(
    bins_df[["bin_id", "zone_id", "zone_name", "zone_type", "latitude", "longitude",
             "bin_capacity_liters", "waste_type", "has_iot_sensor",
             "population_density_per_sqkm", "nearby_restaurants_count", "nearby_markets_count",
             "distance_to_nearest_bin_m"]],
    on="bin_id", how="left",
)

# Nicely order columns
col_order = [
    "date", "day_of_week", "month", "season", "is_holiday", "holiday_name",
    "is_festival", "festival_name", "event_type", "event_multiplier",
    "zone_id", "zone_name", "zone_type", "bin_id", "latitude", "longitude",
    "bin_capacity_liters", "waste_type", "has_iot_sensor",
    "population_density_per_sqkm", "nearby_restaurants_count", "nearby_markets_count",
    "distance_to_nearest_bin_m", "footfall_estimate",
    "rainfall_mm", "temperature_c", "humidity_percent",
    "previous_fill_percentage", "previous_waste_kg", "days_since_last_collection",
    "waste_generated_kg", "fill_percentage_before_collection", "overflow_occurred",
    "collection_scheduled", "collection_occurred", "waste_collected_kg",
    "fill_percentage_end_of_day",
]
df = df[col_order].sort_values(["bin_id", "date"]).reset_index(drop=True)

# --------------------------------------------------------------------------
# 8. TARGET VARIABLES (next-reading prediction, matching the ML use case)
# --------------------------------------------------------------------------
df["target_fill_percentage_next_day"] = df.groupby("bin_id")["fill_percentage_end_of_day"].shift(-1)
df["target_overflow_risk_next_day"] = df.groupby("bin_id")["overflow_occurred"].shift(-1)

# --------------------------------------------------------------------------
# 9. REALISTIC MISSING DATA (sensor gaps, non-IoT bins, weather API outages)
# --------------------------------------------------------------------------
n = len(df)

# Weather API gaps: ~2% of days, city-wide-ish (correlated across a given date's rows)
gap_dates = rng.choice(df["date"].unique(), size=max(1, int(0.02 * calendar.shape[0])), replace=False)
weather_gap_mask = df["date"].isin(gap_dates)
df.loc[weather_gap_mask, ["rainfall_mm", "temperature_c", "humidity_percent"]] = np.nan

# Footfall sensor gaps: 3% random
footfall_gap = rng.random(n) < 0.03
df.loc[footfall_gap, "footfall_estimate"] = np.nan

# Fill-percentage readings: IoT bins rarely miss (1.5%), non-IoT (manual log) bins miss a lot (38%)
iot_mask = df["has_iot_sensor"].values
miss_prob = np.where(iot_mask, 0.015, 0.38)
reading_gap = rng.random(n) < miss_prob
df.loc[reading_gap, ["previous_fill_percentage", "fill_percentage_before_collection", "fill_percentage_end_of_day"]] = np.nan

# A few administrative gaps in collected-weight logging (weighbridge downtime): 1%
admin_gap = rng.random(n) < 0.01
df.loc[admin_gap & (df["collection_occurred"]), "waste_collected_kg"] = np.nan

print("\nMissing value summary (%):")
print((df.isna().mean() * 100).round(2)[(df.isna().mean() * 100).round(2) > 0])

# --------------------------------------------------------------------------
# 10. SAVE
# --------------------------------------------------------------------------
df.to_csv("waste_bin_dataset.csv", index=False)
bins_df.drop(columns=["base_rate_liters", "scheduled_interval_days", "dynamic_collection_prob",
                       "weekend_factor", "weekly_market_day", "base_footfall"]).to_csv("bins_master.csv", index=False)

print(f"\nSaved waste_bin_dataset.csv: {df.shape[0]:,} rows x {df.shape[1]} columns")
print(f"Saved bins_master.csv: {bins_df.shape[0]} bins (static metadata)")
print("\nOverflow rate (class balance of target_overflow_risk_next_day):")
print(df["target_overflow_risk_next_day"].value_counts(normalize=True, dropna=True).round(4))
print("\nCollection-occurred rate:", round(df["collection_occurred"].mean(), 4))
