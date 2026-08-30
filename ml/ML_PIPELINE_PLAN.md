# Smart Waste Management — ML Pipeline Plan (Next Steps)

This is the working plan for turning `waste_bin_dataset.csv` into the prediction system described in the project architecture: **XGBoost → Bin Optimization → Route Optimization**. It covers feature engineering, the exact features/targets, which model does what, and how prediction actually happens at inference time.

---

## 1. Overview of the modeling stack

We are **not** building one model. We're building three, each solving a different sub-problem, feeding into each other:

| # | Model | Type | Solves |
|---|---|---|---|
| 1 | **Fill-% Forecaster** | XGBoost/LightGBM regression | "How full will bin X be in 6h / 12h / 24h?" |
| 2 | **Overflow Classifier** | XGBoost/LightGBM classification | "What's the probability bin X overflows before next collection?" |
| 3 | **Bin Behavior Clusters** | K-Means / hierarchical clustering | "Which bins behave alike?" → feeds bin placement/capacity decisions and gives Model 1 & 2 a useful categorical feature |

Route optimization (OR-Tools) is a downstream *optimizer*, not a learned model — it consumes Model 2's overflow-risk scores as priority weights. That's out of scope for this doc but noted in §7 for continuity.

We are treating this as a **tabular time-series problem solved with lag/rolling features + gradient boosting**, not a sequence model (LSTM/Transformer). Reasoning in §4.

---

## 2. Recap: what we already have

From `waste_bin_dataset.csv` (112,574 rows, 154 bins, 2023-06-01 → 2025-05-31):

- **Targets already computed:** `target_fill_percentage_next_day` (regression), `target_overflow_risk_next_day` (binary classification)
- **Raw features available:** calendar (`date`, `day_of_week`, `month`, `season`, `is_holiday`, `holiday_name`, `is_festival`, `festival_name`, `event_type`, `event_multiplier`), zone/bin static attributes (`zone_type`, `bin_capacity_liters`, `waste_type`, `has_iot_sensor`, `population_density_per_sqkm`, `nearby_restaurants_count`, `nearby_markets_count`, `distance_to_nearest_bin_m`), weather (`rainfall_mm`, `temperature_c`, `humidity_percent`), dynamic state (`previous_fill_percentage`, `previous_waste_kg`, `days_since_last_collection`, `footfall_estimate`)

That covers the brief's requested input list almost exactly. What's missing is **engineered temporal structure** — the raw table only carries a 1-day lookback (`previous_fill_percentage`), and a real forecaster needs more history than that.

---

## 3. Feature engineering plan

### 3.1 Lag features (per `bin_id`, sorted by `date`)
The single highest-value addition. For each bin's time series, compute:

| Feature | Window | Why |
|---|---|---|
| `fill_pct_lag_1d`, `lag_2d`, `lag_3d`, `lag_7d` | 1/2/3/7 days back | Short-term momentum + weekly seasonality (we already have lag_1d as `previous_fill_percentage`) |
| `waste_kg_lag_1d` ... `lag_7d` | same | Same logic for inflow volume |
| `rolling_mean_fill_pct_3d`, `_7d`, `_14d` | trailing window, `min_periods=1` | Smoothed trend, robust to single noisy sensor reading |
| `rolling_std_fill_pct_7d` | trailing 7d | Volatility — a bin that swings wildly is a different risk profile than one that fills steadily |
| `rolling_max_fill_pct_7d` | trailing 7d | "How close to overflow has this bin gotten recently?" |
| `waste_kg_rolling_mean_7d` / `_14d` | trailing window | Smoothed generation rate, less noisy than a single day |
| `days_since_last_overflow` | expanding, reset on overflow | Recency of last incident — bins that recently overflowed are structurally more likely to again (undersized/under-serviced) |
| `collection_frequency_14d` | count of `collection_occurred=True` in trailing 14d | Actual servicing rate vs the bin's nominal schedule |
| `fill_rate_per_day` | `(fill_pct_lag_0 - fill_pct_lag_1) ` | Instantaneous fill velocity — is it accelerating? |
| `fill_acceleration` | difference of `fill_rate_per_day` over 2 consecutive days | Second-derivative — catches ramping-up bins (e.g. heading into a festival) before they cross 85% |

All lag/rolling features **must be computed strictly on past data per bin** (`groupby("bin_id").shift()` / `.rolling()`) to avoid leakage — this is the #1 mistake to guard against in review.

### 3.2 Calendar / cyclical features
- `dow_sin`, `dow_cos` and `month_sin`, `month_cos` (sine/cosine encode day-of-week and month) instead of raw integers — lets tree splits capture "Friday is close to Saturday" and "December is close to January" without one-hot blowing up dimensionality.
- `days_to_next_holiday`, `days_since_last_holiday` — bins often start filling up *before* a festival (pre-festival shopping/cooking), not just on the day itself. `is_festival` alone misses that lead-in effect.
- `is_festival_eve` (1-2 days before a festival start) — explicit flag for the anticipatory spike.

### 3.3 Interaction / domain features
- `capacity_utilization_ratio` = `previous_fill_percentage / 100` × `bin_capacity_liters` → absolute litres currently in the bin, not just percentage (a 90%-full 120L bin and a 90%-full 1100L bin are very different operational situations).
- `waste_per_capita_proxy` = `waste_generated_kg / population_density_per_sqkm` — normalizes generation by local density, useful for spotting under-served *dense* areas.
- `footfall_per_restaurant` = `footfall_estimate / (nearby_restaurants_count + 1)` — a market-vs-purely-residential discriminator that's more informative than either raw count alone.
- `rain_x_zone_outdoor` = `rainfall_mm × (zone_type in {market, tourist})` — makes the known interaction (rain matters more for outdoor zones) explicit for the model rather than relying on tree splits to rediscover it.
- `is_weekend × zone_type` — same idea; weekend effect direction actually flips between institutional and commercial zones, worth an explicit interaction term if a linear/logistic baseline is tried alongside XGBoost.

### 3.4 Cluster-derived feature (from Model 3, see §4.3)
- `bin_cluster_id` — categorical output of the clustering model, added back as an input feature to Models 1 & 2. A cluster label like "high-turnover market bin" carries more signal in one column than making the trees re-derive the same grouping from six separate raw columns every time.

### 3.5 Encoding categorical features
- **Low-cardinality** (`zone_type`, `waste_type`, `season`, `event_type`, `day_of_week`): one-hot encode, or leave as native categoricals if using LightGBM/XGBoost's categorical support (`enable_categorical=True`) — avoids the dimensionality hit of one-hot for tree models.
- **High-cardinality** (`zone_id`, `bin_id`): target-encode (mean target per bin, computed only on training folds to avoid leakage) or leave as a grouping key excluded from the feature matrix but used for the lag/rolling computations in §3.1.
- **Boolean** (`is_holiday`, `is_festival`, `has_iot_sensor`, `overflow_occurred`, `collection_scheduled`): pass through as 0/1.

### 3.6 Missing-value handling
- Weather gaps (~2%): forward-fill within `zone_id` sorted by date (same-day city-wide weather is usually valid to carry forward one day).
- Fill-percentage gaps (~13% overall, concentrated in non-IoT bins): **do not drop these rows** — they're informative (non-IoT bins are a real population you want the model to handle). Two options, pick based on model:
  - XGBoost/LightGBM: leave as `NaN`, both handle missing values natively via learned split directions.
  - If a non-tree baseline is tried: forward-fill + add a companion `is_imputed_fill_pct` flag so the model can discount stale readings.
- Add `sensor_staleness_days` = days since the bin's last **non-null** fill reading — turns "missingness" itself into a usable feature instead of just noise to patch over.

---

## 4. Why gradient boosting + lag features instead of a sequence model

This is a deliberate choice worth being able to defend in the demo/judging Q&A:

1. **Data volume per series is small.** Each bin has ~730 daily observations — enough for tree-based models with engineered lags, not enough to train an LSTM/Transformer from scratch without heavy regularization or transfer learning.
2. **Heterogeneous, mostly-tabular drivers.** Weather, holidays, zone type, and static bin attributes are exactly the kind of structured, mixed-type features gradient boosting excels at; sequence models add complexity without a matching accuracy gain here.
3. **Interpretability matters for a municipal deployment.** SHAP values on an XGBoost model can show a city official *why* a specific bin is flagged (e.g. "70% of this prediction is driven by upcoming Ganesh Chaturthi + high previous_fill_percentage") — much harder to extract from a neural sequence model.
4. **Training/iteration speed.** XGBoost trains on 112K rows in seconds on a laptop; that matters for a hackathon iteration loop.
5. **The "time series" nature is handled via feature engineering, not model architecture** — lag features, rolling stats, and cyclical calendar encodings (§3.1–3.2) let a standard regressor implicitly learn temporal patterns without needing a recurrent architecture. This is a well-established alternative to classical time-series models (ARIMA/Prophet/LSTM) for panel data with many parallel short series, which is exactly our situation (154 parallel bin-level series).

If time permits, a **Prophet or SARIMA baseline per zone** (not per bin — too few observations per individual bin for classical TS models) is worth running purely as a sanity-check comparison, not as the production model.

---

## 5. Feature list — final matrix (summary)

**Targets:**
- `target_fill_percentage_next_day` — regression (Model 1)
- `target_overflow_risk_next_day` — binary classification (Model 2)
- *(Stretch goal, same mechanism)*: recompute additional horizons — `target_fill_percentage_3day_avg` or shift by more rows if the data is resampled to sub-daily granularity — to genuinely produce the brief's "6h / 12h / 24h" multi-horizon output. At daily granularity as currently generated, the single next-day target is the natural unit; multi-horizon framing is a presentation/UX layer on top (see §7).

**Feature groups fed into Models 1 & 2:**

| Group | Example columns |
|---|---|
| Static bin/zone attributes | `zone_type`, `bin_capacity_liters`, `waste_type`, `has_iot_sensor`, `population_density_per_sqkm`, `nearby_restaurants_count`, `nearby_markets_count`, `distance_to_nearest_bin_m` |
| Calendar | `dow_sin/cos`, `month_sin/cos`, `is_holiday`, `is_festival`, `event_type`, `event_multiplier`, `days_to_next_holiday`, `is_festival_eve` |
| Weather | `rainfall_mm`, `temperature_c`, `humidity_percent`, `rain_x_zone_outdoor` |
| Current state | `previous_fill_percentage`, `previous_waste_kg`, `days_since_last_collection`, `capacity_utilization_ratio` |
| Lag/rolling (engineered, §3.1) | `fill_pct_lag_{1,2,3,7}d`, `rolling_mean/std/max_fill_pct_{3,7,14}d`, `waste_kg_lag/rolling`, `fill_rate_per_day`, `fill_acceleration`, `days_since_last_overflow`, `collection_frequency_14d` |
| Footfall/demand | `footfall_estimate`, `footfall_per_restaurant`, `waste_per_capita_proxy` |
| Cluster label | `bin_cluster_id` (from Model 3) |

Excluded from the feature matrix (used only for joins/grouping, not as predictive inputs): `bin_id`, `zone_id`, `date`, `latitude`/`longitude` (unless doing a spatial-lag feature, a stretch goal — see §8).

---

## 6. Model specs

### 6.1 Model 1 — Fill-% Forecaster (regression)
- **Algorithm:** XGBoost (`XGBRegressor`) or LightGBM (`LGBMRegressor`), objective `reg:squarederror`.
- **Target:** `target_fill_percentage_next_day`.
- **Metrics:** MAE and RMSE (primary — directly interpretable as "percentage points off"); R² as secondary.
- **Baseline to beat:** naive persistence (`predicted = previous_fill_percentage`) — if the model can't beat this, something's wrong with the feature set.
- **Hyperparameters to tune** (via time-series-aware CV, not random k-fold — see §6.4): `max_depth` (4–8), `learning_rate` (0.02–0.1), `n_estimators` (300–1000 with early stopping), `subsample`/`colsample_bytree` (0.7–0.9), `min_child_weight`.

### 6.2 Model 2 — Overflow Risk Classifier
- **Algorithm:** XGBoost/LightGBM classifier, objective `binary:logistic`.
- **Target:** `target_overflow_risk_next_day`.
- **Class imbalance (10.2% positive):** use `scale_pos_weight ≈ (negative_count/positive_count) ≈ 8.8`, or focal-loss variants if available; avoid naive oversampling that duplicates rows across the train/val boundary.
- **Metrics:** PR-AUC (primary, since the positive class is rare — ROC-AUC can look misleadingly good under imbalance), Recall at a fixed Precision threshold (city ops care more about catching real overflow risk than avoiding false alarms, so bias threshold selection toward recall), F1, and a confusion matrix at the deployed decision threshold.
- **Threshold selection:** don't use the default 0.5 cutoff — pick the probability threshold on the validation set that hits a target recall (e.g. "catch 85% of actual overflows") and report the resulting precision/false-alarm rate, since that's the real operational trade-off a city would tune.
- **Output framing for the demo:** report `predict_proba` directly as the "Overflow risk: 87%" style output shown in the project brief, not just the thresholded 0/1 label.

### 6.3 Model 3 — Bin Behavior Clustering
- **Purpose:** two uses — (a) feed `bin_cluster_id` back into Models 1 & 2 as a feature, (b) directly support the **Bin Placement & Capacity** demand-score step in the architecture (a bin that clusters with "chronically-overflowing market bins" is a strong candidate for a capacity increase regardless of what the regression says for tomorrow).
- **Algorithm:** K-Means (simple, fast, easy to explain in a demo) on **per-bin aggregated features**, not the raw daily rows:
  - `avg_fill_pct`, `std_fill_pct`, `avg_waste_kg_per_day`, `overflow_rate` (% of days overflowing), `avg_days_between_collections`, `festival_sensitivity` (ratio of mean fill% on festival days vs non-festival days), `weekend_sensitivity` (same idea for weekends), `rain_sensitivity`.
- **k selection:** elbow method + silhouette score, expect roughly 4-6 clusters to be interpretable (e.g. "high-volume market bins," "steady low-density residential," "event-spiky tourist/institutional," "under-capacity chronic overflow bins").
- **Alternative worth trying:** DBSCAN or hierarchical clustering if K-Means clusters look unbalanced (one giant cluster + several tiny ones) — DBSCAN naturally flags outlier bins (persistent overflow cases) as noise points, which is itself a useful signal.
- **Validation:** since there's no ground-truth label, judge clusters qualitatively (do market-zone bins land together? do known chronic-overflow bins separate out?) plus silhouette score as the quantitative check.

### 6.4 Validation strategy (all models)
**Never random k-fold on this data** — it's per-bin time series, and random shuffling leaks future state into training via the lag features. Use:
- **Walk-forward / expanding-window CV**: e.g. train on 2023-06→2024-02, validate on 2024-03; train on 2023-06→2024-03, validate on 2024-04; etc. — mimics how the model will actually be retrained and used in production.
- **Final holdout**: chronological split as already specified in the dataset's data dictionary (train through 2024-11-30, validate through 2025-02-28, test on the final 3 months) — touch the test set exactly once, at the end.

---

## 7. How prediction actually happens at inference time

1. **Nightly/hourly batch job** pulls each bin's latest sensor reading (or last-known + `sensor_staleness_days` if non-IoT), current weather forecast (or latest observed), and calendar context for the prediction date.
2. Recompute the same lag/rolling features (§3.1) using the bin's real historical log — this must use the *exact same feature engineering code* as training (a shared feature-pipeline function, not duplicated logic) to avoid train/serve skew.
3. Model 1 outputs a next-day fill-% point estimate; Model 2 outputs an overflow probability. For the "6h/12h" style multi-horizon display in the demo, either (a) train separate horizon-specific models if sub-daily data is later collected, or (b) interpolate between "current reading" and "predicted next-day value" for the 6h/12h display bars, which is an honest simplification to state explicitly in the demo narrative.
4. Model 2's overflow probability becomes the **priority weight** OR-Tools uses when solving which trucks visit which bins in what order — high-risk bins get scheduled earlier in the route.
5. `bin_cluster_id` feeds the separate (non-ML, geospatial-scoring) **Bin Demand Score** formula from the architecture doc for placement/capacity recommendations.

---

## 8. Stretch goals (if time remains)

- **Spatial-lag features**: average fill-% of the 3 nearest bins (using `latitude`/`longitude` + `distance_to_nearest_bin_m`) — captures neighborhood-level demand spillover (e.g. one bin overflowing pushes litter to the next-nearest bin).
- **SHAP explainability dashboard**: per-prediction SHAP waterfall so a judge/demo can click a bin and see *why* it's flagged.
- **Multi-horizon regression** by resampling to 6-hour granularity if more compute/time is available, to match the brief's literal "6h/12h/24h" output format instead of daily.
- **Event-multiplier sub-model**: rather than hard-coding festival/weekend multipliers as in the synthetic generator, learn them from `event_multiplier`'s realized effect on `waste_generated_kg` as a small separate regression — turns the "Event Spike Model" in the architecture doc from a lookup table into a learned component.

---

## 9. Checklist — order of execution

1. [ ] Load `waste_bin_dataset.csv`, drop rows with null targets (154 rows).
2. [ ] Build the shared feature-engineering function (lag/rolling/cyclical/interaction features, §3) — write once, reuse for train and inference.
3. [ ] Chronological train/val/test split (§6.4).
4. [ ] Train Model 3 (clustering) on training-period per-bin aggregates; assign `bin_cluster_id` to all rows (train/val/test) using cluster centers fit on train only.
5. [ ] Train Model 1 (regression) with early stopping on validation; evaluate MAE/RMSE vs naive-persistence baseline.
6. [ ] Train Model 2 (classification) with `scale_pos_weight`; tune decision threshold on validation for target recall; evaluate PR-AUC on test.
7. [ ] Run SHAP on both models for the top features — sanity-check that `previous_fill_percentage`, `event_multiplier`, and `rolling_mean_fill_pct_7d` dominate (if they don't, something's off).
8. [ ] Wire Model 2's output into the OR-Tools route-priority weights for the routing demo.
9. [ ] Package a small inference script that takes "today's state" for all bins and outputs tomorrow's fill-% + overflow-risk table (the exact "Bin 102 / Current 62% / Predicted 78%" style output from the brief).
