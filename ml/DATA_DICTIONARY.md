# Smart Waste Management Dataset — Data Dictionary & Methodology

**Files:** `waste_bin_dataset.csv` (main dataset), `bins_master.csv` (static bin/zone metadata for maps), `generate_waste_dataset.py` (generator, seed=42)

**Shape:** 112,574 rows × 39 columns · 154 bins across 12 zones · 2 years (2023-06-01 to 2025-05-31) · 25.3 MB

---

## 1. Why this represents the real-world problem

This models the exact system described in the project brief: predicting bin-level waste accumulation from timestamp, weather, events, footfall, and nearby-business density, feeding an XGBoost-style regressor. Rather than sampling each column independently, the generator runs a **day-by-day stateful simulation per bin**:

```
fill_level(t) = fill_level(t-1) + inflow(t)              [inflow driven by causal factors]
if scheduled_day OR fill% ≥ 85% (prob.) OR overflowing (prob.):
    truck empties bin  fill_level resets to a small residual
```

Because the state (`fill_level`) genuinely carries over from one day to the next, and collection genuinely resets it, the relationships in the table are *emergent*, not hard-coded per row — e.g. a bin's fill percentage today mechanically depends on how full it was yesterday and whether it got emptied, exactly like a real IoT-monitored bin.

Twelve zones are modelled on real Mangaluru (coastal Karnataka) neighbourhood archetypes — market, commercial, mixed-use, residential (high/low density), institutional (near NITK Surathkal), tourist (Panambur beach), and industrial — because zone type is the single strongest driver of waste-generation rate in real municipal data, and a mono-zone dataset would make the ML task trivially easy.

**Causal drivers built into the simulation** (matching the brief's requested features):
- **Zone type & bin capacity tier**  baseline inflow rate (market bins fill ~3× faster than low-density residential bins — verified above).
- **Day of week**  weekend multiplier that differs by zone type (commercial/market/tourist spike on weekends; institutional zones *drop* on weekends).
- **Weekly local market day ("santhe")**  1.5× multiplier on that zone's designated weekday.
- **Holidays** (fixed real dates: Republic Day, Independence Day, Gandhi Jayanti, Christmas, etc.) and **festivals** (approximate real dates for Ugadi, Eid, Ganesh Chaturthi, Navratri/Dasara, Diwali, Karavali Utsav across 2023–2025)  1.5–3.5× multipliers.
- **Rare major events** (concerts/sports/rallies, 4–10 per zone over 2 years)  2.5–3.5× spike, matching the brief's "major event = 3.0×" idea.
- **Monsoon-realistic weather**: rainfall is near-zero outside June–November and heavy (gamma-distributed, up to 100s of mm) in the June–September monsoon; temperature and humidity follow a coastal seasonal curve. Rain *suppresses* footfall/waste for outdoor-exposed zone types (market, tourist) more than indoor ones (residential).
- **Footfall** is simulated per bin (correlation with waste generation ≈ 0.47 — meaningfully related but not deterministic, as in reality).
- **Multiplicative noise** (~16% SD, log-normal-like) on every day's inflow, so no two otherwise-identical days produce identical numbers.
- **Physical overflow cap**: a bin can't hold more than 1.6× its rated capacity — beyond that, waste spills onto the street rather than "into" the bin, matching real overflow behaviour.

## 2. Column reference

| Column | Type | Range / Values | Description |
|---|---|---|---|
| `date` | date | 2023-06-01…2025-05-31 | Calendar date of the reading |
| `day_of_week` | categorical | Monday…Sunday | |
| `month` | int | 1–12 | |
| `season` | categorical | Winter / Summer / Monsoon / Post-Monsoon | Coastal-Karnataka season |
| `is_holiday` | bool | | National/fixed holiday flag |
| `holiday_name` | categorical (nullable) | e.g. "Independence Day" | Null on non-holidays |
| `is_festival` | bool | | Regional festival flag |
| `festival_name` | categorical (nullable) | e.g. "Diwali" | Null on non-festival days |
| `event_type` | categorical | none / holiday / weekly_market / festival / major_event | Dominant event driving that day |
| `event_multiplier` | float | ~0.5–3.8 | Combined multiplier actually applied to inflow that day |
| `zone_id` / `zone_name` / `zone_type` | categorical | Z01–Z12 | See §1 for zone archetypes |
| `bin_id` | categorical | BIN0001–BIN0154 | Unique bin identifier |
| `latitude` / `longitude` | float | Mangaluru region | Bin's geocoordinates (for map demos) |
| `bin_capacity_liters` | int | 120 / 240 / 660 / 1100 | Standard Indian municipal bin sizes |
| `waste_type` | categorical | wet_organic / mixed / dry_recyclable | Dominant waste stream for that bin |
| `has_iot_sensor` | bool | | Whether the bin has a working fill sensor (affects missingness, see §3) |
| `population_density_per_sqkm` | int | ~3,000–21,000 | Zone-level density with per-bin jitter |
| `nearby_restaurants_count` | int | 0–15 | Static count near the bin |
| `nearby_markets_count` | int | 0–5 | Static count near the bin |
| `distance_to_nearest_bin_m` | float | ~15–500 | Spatial density proxy |
| `footfall_estimate` | float (nullable) | 0–~5,000 | Estimated daily pedestrian count near the bin |
| `rainfall_mm` | float (nullable) | 0–~350 | Daily rainfall |
| `temperature_c` | float (nullable) | ~20–35 | Daily mean temperature |
| `humidity_percent` | float (nullable) | 45–99 | Daily mean relative humidity |
| `previous_fill_percentage` | float (nullable) | 0–~150 | Fill % at start of day (state carried from prior day) |
| `previous_waste_kg` | float | ≥0 | Waste generated the *previous* day |
| `days_since_last_collection` | float | ≥0 | Days elapsed since the bin was last emptied |
| `waste_generated_kg` | float | ≥0 | **Today's inflow** (kg added to the bin) |
| `fill_percentage_before_collection` | float (nullable) | 0–160 | Fill % after today's inflow, before any truck visit |
| `overflow_occurred` | bool | | True if `fill_percentage_before_collection` > 100 |
| `collection_scheduled` | bool | | Whether today was a routine scheduled collection day |
| `collection_occurred` | bool | | Whether a truck actually emptied the bin today |
| `waste_collected_kg` | float (nullable) | ≥0 | Weight removed if collected, else 0 |
| `fill_percentage_end_of_day` | float (nullable) | 0–~15 (post-collection) or = before-collection | State carried into tomorrow as `previous_fill_percentage` |
| `target_fill_percentage_next_day` | float (nullable) | 0–160 | **Regression target** — next day's `fill_percentage_end_of_day` for the same bin |
| `target_overflow_risk_next_day` | bool (nullable) | | **Classification target** — whether the bin overflows the following day |

Targets are `NaN` only on each bin's final day in the dataset (154 rows, i.e. 0.14%) since there's no "next day" to look up — drop these before training.

## 3. Missing data (intentional, realistic)

| Field group | Missing rate | Reason simulated |
|---|---|---|
| `rainfall_mm`, `temperature_c`, `humidity_percent` | ~1.9% | Weather API outages, applied to whole city-days |
| `footfall_estimate` | ~3.0% | Pedestrian-counter sensor faults |
| `previous_fill_percentage`, `fill_percentage_before_collection`, `fill_percentage_end_of_day` | ~1.5% on IoT bins, ~38% on non-IoT bins (~13.2% overall) | Non-IoT bins are only checked manually/intermittently, mirroring the real gap between sensor-equipped and legacy bins that motivates this project |
| `waste_collected_kg` | ~0.4% (of collection days) | Weighbridge/logging downtime |

`has_iot_sensor` is itself a feature, so a model can learn to trust readings differently by bin — this is a deliberately realistic complication, not noise to be thrown away.

## 4. Class balance

- `target_overflow_risk_next_day`: **10.2% positive / 89.8% negative** — realistic imbalance (overflow is the exception, not the norm); use `scale_pos_weight` (XGBoost) or stratified sampling/SMOTE if training a classifier on this target.
- `collection_occurred`: 40% True / 60% False.
- `event_type`: dominated by "none" (~80%), with "weekly_market" (~9%), "holiday" (~5%), "festival" (~5%), "major_event" (~0.3%) — long-tailed, as real event calendars are.

## 5. Recommended train / validation / test split

Because this is **time-series, bin-level data**, use a **chronological split per bin**, not a random row split (random splitting would leak tomorrow's fill level into training via lag features and inflate accuracy):

- **Train:** 2023-06-01  2024-11-30 (~18 months, ~70%)
- **Validation:** 2024-12-01  2025-02-28 (~15%)
- **Test:** 2025-03-01  2025-05-31 (~15%)

Alternatively, for a quick hackathon demo, an 80/10/10 chronological split by date works fine — just never shuffle rows across the boundary before splitting.

## 6. Preprocessing before training

1. **Drop rows with NaN target** (`target_fill_percentage_next_day` / `target_overflow_risk_next_day`) — 154 rows.
2. **Impute weather gaps** with forward-fill within date (or a same-season average) — don't drop rows for a 2% weather gap.
3. **Impute fill-percentage gaps**: for non-IoT bins, a common approach is to forward-fill the last known reading and add a `reading_stale_days` feature; leaving as NaN and letting XGBoost's native NaN-handling take over also works well and avoids inventing data.
4. **One-hot / target-encode** categoricals: `zone_type`, `waste_type`, `event_type`, `season`, `day_of_week`.
5. **Drop leakage-prone raw identifiers** (`bin_id`, `zone_id`, exact `date`) from the feature matrix, or encode them as embeddings/grouping keys only — keep `days_since_last_collection`, `month`, `dow` etc. as the temporal signal instead.
6. **Scale/normalize** is optional for tree models (XGBoost/LightGBM) but required if you also try a neural baseline.

## 7. Why this fits the intended model (XGBoost / LightGBM regression + classification)

- All features are tabular and exactly match the brief's requested input list (timestamp-derived fields, weather, event type, footfall, nearby restaurants/markets, population density, previous waste/fill, days since collection).
- The **regression target** (`target_fill_percentage_next_day`) directly supports the "predict bin fill % in next 6–24h" use case; the **classification target** (`target_overflow_risk_next_day`) directly supports the "overflow risk %" output shown in the brief's example.
- Feature–target relationships are non-linear and interaction-heavy (e.g. rain matters only for outdoor zones; weekends help commercial but hurt institutional zones) — the kind of structure gradient-boosted trees are specifically good at capturing, while the added noise and missingness keep the task from being trivially separable.
- The realistic class imbalance and missingness mean the same dataset can also be used to demo real hackathon talking points: handling imbalance, sensor gaps, and non-IoT legacy infrastructure — all of which are genuine constraints in Indian municipal deployments.

## 8. Regenerating the dataset

```bash
python generate_waste_dataset.py
```

Uses `numpy.random.default_rng(42)` throughout, so re-running produces an identical file. Change `SEED`, `START_DATE`/`END_DATE`, or the `ZONES`/`ZONE_TYPE_PARAMS` tables at the top of the script to scale up, add more cities, or adjust behaviour — the simulation logic itself doesn't need to change.
