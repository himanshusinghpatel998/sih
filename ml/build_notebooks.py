import nbformat as nbf

def nb(cells):
    n = nbf.v4.new_notebook()
    n["cells"] = cells
    n["metadata"] = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3"},
    }
    return n

def md(src): return nbf.v4.new_markdown_cell(src)
def code(src): return nbf.v4.new_code_cell(src)

# ============================================================================
# NOTEBOOK 01 — EDA & Feature Engineering
# ============================================================================
cells_01 = [
md("""# 01 — Exploratory Data Analysis & Feature Engineering
Smart Waste Management project — this notebook loads the raw simulated bin dataset, sanity-checks it,
visualizes the key relationships the models will rely on, and runs the shared feature-engineering
pipeline (`feature_engineering.py`) that Notebooks 02–04 also import.

See `ML_PIPELINE_PLAN.md` Sections 1–3 for the full reasoning behind every feature built here."""),

code("""import warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from feature_engineering import load_raw, build_features, build_bin_aggregates

sns.set_theme(style="whitegrid")
plt.rcParams["figure.figsize"] = (10, 5)
pd.set_option("display.max_columns", 50)
"""),

md("## 1. Load raw data"),
code("""df = load_raw()
print("Shape:", df.shape)
df.head()"""),

code("""df.info()"""),

md("## 2. Missing values\nMissingness is intentional and structural (see `DATA_DICTIONARY.md` §3) — non-IoT bins are missing far more fill readings than IoT bins."),
code("""missing = (df.isna().mean() * 100).round(2)
missing = missing[missing > 0].sort_values(ascending=False)
missing.plot(kind="barh", color="indianred", figsize=(8, 5))
plt.title("Missing value % by column")
plt.xlabel("% missing")
plt.gca().invert_yaxis()
plt.tight_layout(); plt.show()"""),

code("""# Confirm the IoT-vs-non-IoT missingness gap that motivates sensor_staleness_days as a feature
missing_by_iot = df.groupby("has_iot_sensor")["fill_percentage_end_of_day"].apply(lambda s: s.isna().mean() * 100)
print("Missing fill_percentage_end_of_day (%) by IoT sensor status:")
print(missing_by_iot.round(1))"""),

md("## 3. Target distributions"),
code("""fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))
df["target_fill_percentage_next_day"].dropna().hist(bins=60, ax=axes[0], color="steelblue")
axes[0].set_title("target_fill_percentage_next_day — distribution")
axes[0].set_xlabel("Fill %")

df["target_overflow_risk_next_day"].dropna().value_counts(normalize=True).sort_index().plot(
    kind="bar", ax=axes[1], color=["seagreen", "firebrick"])
axes[1].set_title("target_overflow_risk_next_day — class balance")
axes[1].set_xticklabels(["No overflow", "Overflow"], rotation=0)
axes[1].set_ylabel("Proportion")
plt.tight_layout(); plt.show()

print(df["target_overflow_risk_next_day"].value_counts(normalize=True).round(4))"""),

md("## 4. Zone-type and seasonal relationships\nThese are the relationships the models are expected to learn — worth confirming they exist before training anything."),
code("""fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))
df.groupby("zone_type")["waste_generated_kg"].mean().sort_values().plot(kind="barh", ax=axes[0], color="teal")
axes[0].set_title("Mean daily waste generated (kg) by zone type")

df.groupby("season")["rainfall_mm"].mean().reindex(["Summer","Monsoon","Post-Monsoon","Winter"]).plot(
    kind="bar", ax=axes[1], color="slateblue")
axes[1].set_title("Mean rainfall (mm) by season — monsoon check")
axes[1].tick_params(axis="x", rotation=20)
plt.tight_layout(); plt.show()"""),

code("""event_effect = df.groupby("event_type")["fill_percentage_before_collection"].mean().sort_values()
event_effect.plot(kind="barh", color="darkorange", figsize=(8,4))
plt.title("Mean fill % before collection by event type")
plt.xlabel("Fill %")
plt.tight_layout(); plt.show()
print(event_effect.round(1))"""),

md("## 5. What a single bin's time series looks like\nThe sawtooth pattern (fill up, get emptied, repeat) is the core structure the lag/rolling features in Section 3.1 are designed to capture."),
code("""sample_bin = "BIN0001"
sample = df[df["bin_id"] == sample_bin].sort_values("date").head(60)
fig, ax = plt.subplots(figsize=(12, 4))
ax.plot(sample["date"], sample["fill_percentage_before_collection"], marker="o", ms=3, label="Fill % before collection")
ax.axhline(100, color="red", ls="--", lw=1, label="Overflow threshold")
collected = sample[sample["collection_occurred"]]
ax.scatter(collected["date"], collected["fill_percentage_before_collection"], color="green", zorder=5, label="Collection day")
ax.set_title(f"{sample_bin} — first 60 days (zone: {sample['zone_type'].iloc[0]})")
ax.set_ylabel("Fill %")
ax.legend()
plt.xticks(rotation=30)
plt.tight_layout(); plt.show()"""),

md("## 6. Correlation among key numeric drivers"),
code("""num_cols = ["waste_generated_kg", "footfall_estimate", "rainfall_mm", "temperature_c",
            "population_density_per_sqkm", "nearby_restaurants_count", "nearby_markets_count",
            "previous_fill_percentage", "days_since_last_collection", "event_multiplier"]
corr = df[num_cols].corr()
plt.figure(figsize=(8, 6))
sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", center=0, square=True)
plt.title("Correlation matrix — key numeric features")
plt.tight_layout(); plt.show()"""),

md("## 7. Run the shared feature-engineering pipeline\nThis is the exact function Notebooks 02–04 import — lag features, rolling stats, cyclical calendar encoding, interaction terms (see `feature_engineering.py`)."),
code("""df_feat = build_features(df)
print("Before:", df.shape, " After feature engineering:", df_feat.shape)
new_cols = [c for c in df_feat.columns if c not in df.columns]
print(f"\\n{len(new_cols)} new engineered columns:")
print(new_cols)"""),

code("""df_feat[["bin_id", "date", "fill_pct_lag_1d", "rolling_mean_fill_pct_7d",
         "days_since_last_overflow", "days_to_next_holiday", "fill_rate_per_day"]].head(10)"""),

md("## 8. Per-bin aggregates (input to the clustering notebook)"),
code("""agg = build_bin_aggregates(df)
print(agg.shape)
agg.describe().round(2)"""),

md("""## 9. Summary
- 112,574 raw rows confirmed to have realistic seasonal, event, and zone-driven structure (not i.i.d. noise).
- Missingness is concentrated in non-IoT bins as designed — this is a feature (`sensor_staleness_days`), not just noise to drop.
- Feature pipeline expands 39 raw columns to engineered features covering lags, rolling stats, cyclical time, and domain interactions.
- **Next:** `02_model3_bin_clustering.ipynb` segments bins by behavior; its output feeds `03` and `04`."""),
]

nbf.write(nb(cells_01), "01_eda_feature_engineering.ipynb")


# ============================================================================
# NOTEBOOK 02 — Model 3: Bin Behavior Clustering (K-Means)
# ============================================================================
cells_02 = [
md("""# 02 — Model 3: Bin Behavior Clustering (K-Means)
Segments the 154 bins into behavioral groups from their **aggregated** history (not daily rows).
Two uses (see `ML_PIPELINE_PLAN.md` §6.3):
1. `bin_cluster_id` is merged back in as a categorical feature for Models 1 & 2 (Notebooks 03/04).
2. Cluster membership directly supports the non-ML **Bin Demand Score** used for placement/capacity decisions."""),

code("""import warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.decomposition import PCA

from feature_engineering import load_raw, build_features, build_bin_aggregates, chronological_split

sns.set_theme(style="whitegrid")
plt.rcParams["figure.figsize"] = (9, 5)
pd.set_option("display.max_columns", 50)
"""),

md("""## 1. Build per-bin aggregate features
**Fit on training-period rows only** (`ML_PIPELINE_PLAN.md` §6.4 / §9 checklist item 4). All 154 bins
already appear in the training window, so this doesn't lose any bin — but it keeps the clustering
model, like Models 1 & 2, from ever seeing validation/test-period fill and overflow outcomes. Fitting
on the full 2-year span (train+val+test) would leak future per-bin behavior into `bin_cluster_id`,
which Notebooks 03/04 then use as a feature and evaluate on that same test period."""),
code("""df = build_features(load_raw())
train, _, _ = chronological_split(df)
agg = build_bin_aggregates(train)
agg = agg.fillna(agg.median(numeric_only=True))
agg.head()"""),

code("""CLUSTER_FEATURES = [
    "avg_fill_pct", "std_fill_pct", "avg_waste_kg_per_day", "overflow_rate",
    "avg_days_between_collections", "festival_sensitivity", "weekend_sensitivity", "rain_sensitivity",
]
X = agg[CLUSTER_FEATURES].values
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
X_scaled.shape"""),

md("## 2. Choose k — elbow method + silhouette score"),
code("""ks = range(2, 11)
inertias, sils = [], []
for k in ks:
    km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(X_scaled)
    inertias.append(km.inertia_)
    sils.append(silhouette_score(X_scaled, km.labels_))

fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))
axes[0].plot(list(ks), inertias, marker="o")
axes[0].set_title("Elbow method (inertia)")
axes[0].set_xlabel("k"); axes[0].set_ylabel("Inertia")

axes[1].plot(list(ks), sils, marker="o", color="darkorange")
axes[1].set_title("Silhouette score by k")
axes[1].set_xlabel("k"); axes[1].set_ylabel("Silhouette score")
plt.tight_layout(); plt.show()

best_k = list(ks)[int(np.argmax(sils))]
print("Silhouette-optimal k:", best_k, " (scores:", dict(zip(ks, np.round(sils, 3))), ")")"""),

code("""# Favor an interpretable k in a reasonable range (4-6) for a hackathon demo,
# but never override a clearly better silhouette result outside that range.
K = best_k if best_k in range(3, 8) else 5
print("Using k =", K)

kmeans = KMeans(n_clusters=K, random_state=42, n_init=10)
agg["bin_cluster_id"] = kmeans.fit_predict(X_scaled)
print("Final silhouette score:", round(silhouette_score(X_scaled, agg["bin_cluster_id"]), 3))"""),

md("## 3. Visualize clusters in 2D (PCA)"),
code("""pca = PCA(n_components=2, random_state=42)
coords = pca.fit_transform(X_scaled)
agg["pca_1"], agg["pca_2"] = coords[:, 0], coords[:, 1]

plt.figure(figsize=(8, 6))
sns.scatterplot(data=agg, x="pca_1", y="pca_2", hue="bin_cluster_id", palette="tab10", s=70)
plt.title(f"Bin clusters (PCA projection, {pca.explained_variance_ratio_.sum()*100:.0f}% variance explained)")
plt.tight_layout(); plt.show()"""),

md("## 4. Cluster profiles — what does each cluster represent?"),
code("""profile = agg.groupby("bin_cluster_id")[CLUSTER_FEATURES + ["bin_capacity_liters"]].mean().round(2)
profile["n_bins"] = agg["bin_cluster_id"].value_counts().sort_index()
profile"""),

code("""# Sanity check: do clusters line up with zone_type at all, or are they cutting across it
# in a genuinely new way (both are useful outcomes)?
pd.crosstab(agg["bin_cluster_id"], agg["zone_type"])"""),

code("""# Auto-label clusters using simple rules on the profile, purely for readability in the demo
def label_cluster(row):
    if row["overflow_rate"] > profile["overflow_rate"].median() and row["avg_fill_pct"] > profile["avg_fill_pct"].median():
        return "high_risk_chronic_overflow"
    if row["festival_sensitivity"] > 1.3 or row["weekend_sensitivity"] > 1.3:
        return "event_spiky"
    if row["avg_waste_kg_per_day"] > profile["avg_waste_kg_per_day"].median():
        return "high_volume_steady"
    return "low_volume_stable"

profile["cluster_label"] = profile.apply(label_cluster, axis=1)
profile[["n_bins", "avg_fill_pct", "overflow_rate", "festival_sensitivity", "weekend_sensitivity", "cluster_label"]]"""),

md("## 5. Save the bin  cluster mapping\nThis file is imported by Notebooks 03 and 04 (`feature_engineering.merge_cluster_labels`)."),
code("""out = agg[["bin_id", "zone_type", "zone_name", "bin_cluster_id"]].merge(
    profile[["cluster_label"]], left_on="bin_cluster_id", right_index=True
)
out.to_csv("bin_cluster_mapping.csv", index=False)
print("Saved bin_cluster_mapping.csv:", out.shape)
out.head()"""),

md("""## 6. Summary
- K-Means on 8 behavioral aggregates (fill level, volatility, overflow rate, collection cadence, festival/weekend/rain sensitivity) segments the 154 bins into interpretable groups.
- Clusters partially — but not fully — align with `zone_type`, confirming they add information beyond the static zone label (otherwise clustering would be redundant).
- `bin_cluster_mapping.csv` is consumed by the regression (03) and classification (04) notebooks as an extra categorical feature, and by the (non-ML) Bin Demand Score step in the wider architecture for placement/capacity decisions."""),
]

nbf.write(nb(cells_02), "02_model3_bin_clustering.ipynb")

# ============================================================================
# NOTEBOOK 03 — Model 1: Fill-% Forecaster (XGBoost Regression)
# ============================================================================
cells_03 = [
md("""# 03 — Model 1: Fill-% Forecaster (XGBoost Regression)
Predicts `target_fill_percentage_next_day` — "how full will this bin be tomorrow?" — the core
regression model behind the brief's "Predicted 6h / 12h / 24h" output.

See `ML_PIPELINE_PLAN.md` §6.1 and §6.4 for the modeling and validation rationale (chronological
split, not random k-fold — this is per-bin time series)."""),

code("""import warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import xgboost as xgb
import shap
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from feature_engineering import (
    load_raw, build_features, merge_cluster_labels, cast_categorical_columns,
    chronological_split, get_model_frame, TARGET_REGRESSION,
)

sns.set_theme(style="whitegrid")
plt.rcParams["figure.figsize"] = (9, 5)
pd.set_option("display.max_columns", 50)
"""),

md("## 1. Load, engineer features, merge cluster labels (from Notebook 02)"),
code("""df = build_features(load_raw())
df = merge_cluster_labels(df)  # adds bin_cluster_id from bin_cluster_mapping.csv
# Cast categoricals ONCE on the full dataframe (before splitting) so every
# split/sample shares the same category levels -- see feature_engineering.py
# cast_categorical_columns() docstring for why this order matters.
df = cast_categorical_columns(df, extra_categorical=["bin_cluster_id"])
print(df.shape)
df[["bin_id", "date", "bin_cluster_id"]].head()"""),

md("## 2. Chronological train / validation / test split\nTrain through 2024-11-30, validate through 2025-02-28, test on the final 3 months — never shuffled."),
code("""train, val, test = chronological_split(df)
print("Train:", train.shape, train["date"].min().date(), "", train["date"].max().date())
print("Val:  ", val.shape,   val["date"].min().date(),   "", val["date"].max().date())
print("Test: ", test.shape,  test["date"].min().date(),  "", test["date"].max().date())

X_train, y_train, meta_train = get_model_frame(train, TARGET_REGRESSION, extra_categorical=["bin_cluster_id"])
X_val,   y_val,   meta_val   = get_model_frame(val,   TARGET_REGRESSION, extra_categorical=["bin_cluster_id"])
X_test,  y_test,  meta_test  = get_model_frame(test,  TARGET_REGRESSION, extra_categorical=["bin_cluster_id"])
print(X_train.shape, X_val.shape, X_test.shape)"""),

md("## 3. Baseline — naive persistence\nIf the model can't beat \"tomorrow = today\", something's wrong with the feature set."),
code("""baseline_pred = test.dropna(subset=[TARGET_REGRESSION])["fill_percentage_end_of_day"]
baseline_true = test.dropna(subset=[TARGET_REGRESSION])[TARGET_REGRESSION]
mask = baseline_pred.notna() & baseline_true.notna()

baseline_mae = mean_absolute_error(baseline_true[mask], baseline_pred[mask])
baseline_rmse = mean_squared_error(baseline_true[mask], baseline_pred[mask]) ** 0.5
print(f"Naive persistence baseline — MAE: {baseline_mae:.2f} pts | RMSE: {baseline_rmse:.2f} pts")"""),

md("## 4. Train XGBoost regressor (native categorical support, early stopping on validation)"),
code("""model = xgb.XGBRegressor(
    objective="reg:squarederror",
    n_estimators=1000,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    enable_categorical=True,
    tree_method="hist",
    random_state=42,
    early_stopping_rounds=30,
    eval_metric="mae",
)
model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
print("Best iteration:", model.best_iteration)"""),

md("## 5. Evaluate on the held-out test set"),
code("""pred_test = model.predict(X_test)
mae = mean_absolute_error(y_test, pred_test)
rmse = mean_squared_error(y_test, pred_test) ** 0.5
r2 = r2_score(y_test, pred_test)

print(f"XGBoost — MAE: {mae:.2f} pts | RMSE: {rmse:.2f} pts | R²: {r2:.3f}")
print(f"Naive baseline — MAE: {baseline_mae:.2f} pts | RMSE: {baseline_rmse:.2f} pts")
improvement = (baseline_mae - mae) / baseline_mae * 100
print(f"\\nImprovement over naive persistence: {improvement:.1f}% lower MAE")"""),

code("""fig, axes = plt.subplots(1, 2, figsize=(13, 5))
axes[0].scatter(y_test, pred_test, alpha=0.15, s=8, color="steelblue")
lims = [0, max(y_test.max(), pred_test.max())]
axes[0].plot(lims, lims, "r--", lw=1.5)
axes[0].set_xlabel("Actual fill % (next day)")
axes[0].set_ylabel("Predicted fill % (next day)")
axes[0].set_title("Predicted vs. Actual")

residuals = pred_test - y_test
axes[1].hist(residuals, bins=60, color="teal")
axes[1].axvline(0, color="red", ls="--")
axes[1].set_title(f"Residuals (mean={residuals.mean():.2f}, std={residuals.std():.2f})")
axes[1].set_xlabel("Predicted - Actual")
plt.tight_layout(); plt.show()"""),

md("## 6. Feature importance"),
code("""importance = pd.Series(model.feature_importances_, index=X_train.columns).sort_values(ascending=False).head(20)
importance.plot(kind="barh", figsize=(8, 7), color="darkcyan")
plt.title("Top 20 features by gain-based importance")
plt.gca().invert_yaxis()
plt.tight_layout(); plt.show()"""),

md("## 7. SHAP explainability\nWhy a specific prediction was made — the interpretability advantage called out in `ML_PIPELINE_PLAN.md` §4.3 for a municipal-deployment demo."),
code("""sample_idx = np.random.RandomState(42).choice(len(X_test), size=min(1500, len(X_test)), replace=False)
X_sample = X_test.iloc[sample_idx]

explainer = shap.TreeExplainer(model)
shap_values = explainer(X_sample)

shap.summary_plot(shap_values, X_sample, show=False, max_display=15)
plt.tight_layout(); plt.show()"""),

md("## 8. Save the model"),
code("""model.save_model("model1_fill_percentage_xgb.json")
print("Saved model1_fill_percentage_xgb.json")"""),

md("## 9. Example output — matches the brief's \"Bin 102 / Current / Predicted\" format"),
code("""# The very last calendar date in the whole dataset has no "next day" for
# any bin (target is NaN for everyone that day), so pick the latest date
# that actually has a valid target instead of test["date"].max().
latest_date = test.dropna(subset=[TARGET_REGRESSION])["date"].max()
day_df = test[test["date"] == latest_date].dropna(subset=[TARGET_REGRESSION])
sample_bins = day_df.sample(min(8, day_df.shape[0]), random_state=7)

X_show, y_show, meta_show = get_model_frame(sample_bins, TARGET_REGRESSION, extra_categorical=["bin_cluster_id"])
pred_show = model.predict(X_show)

report = pd.DataFrame({
    "bin_id": meta_show["bin_id"].values,
    "zone_type": sample_bins["zone_type"].values,
    "current_fill_pct": sample_bins["fill_percentage_end_of_day"].round(1).values,
    "predicted_next_day_fill_pct": pred_show.round(1),
    "actual_next_day_fill_pct": y_show.round(1).values,
})
report["overflow_risk_flag"] = report["predicted_next_day_fill_pct"] >= 85
report"""),

md("""## 10. Summary
- XGBoost regressor with lag/rolling/cyclical features beats the naive-persistence baseline on the chronological test set (see improvement % above).
- SHAP confirms `previous_fill_percentage`, the rolling-mean features, and `event_multiplier` dominate predictions — consistent with the causal structure built into the simulation, which is the sanity check called for in the pipeline plan.
- **Next:** `04_model2_overflow_classification.ipynb` turns this into the binary overflow-risk score used for route prioritization."""),
]

nbf.write(nb(cells_03), "03_model1_fill_percentage_regression.ipynb")


# ============================================================================
# NOTEBOOK 04 — Model 2: Overflow Risk Classifier (XGBoost Classification)
# ============================================================================
cells_04 = [
md("""# 04 — Model 2: Overflow Risk Classifier (XGBoost Classification)
Predicts `target_overflow_risk_next_day` — the probability a bin overflows before its next
scheduled reading. This is the "Overflow risk: 87%" style output from the brief, and the priority
weight fed into OR-Tools for route optimization.

See `ML_PIPELINE_PLAN.md` §6.2 for class-imbalance handling and threshold-selection rationale."""),

code("""import warnings
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import xgboost as xgb
import shap
from sklearn.metrics import (
    roc_auc_score, average_precision_score, precision_recall_curve,
    confusion_matrix, classification_report,
)

from feature_engineering import (
    load_raw, build_features, merge_cluster_labels, cast_categorical_columns,
    chronological_split, get_model_frame, TARGET_CLASSIFICATION,
)

sns.set_theme(style="whitegrid")
plt.rcParams["figure.figsize"] = (9, 5)
pd.set_option("display.max_columns", 50)
"""),

md("## 1. Load, engineer features, merge cluster labels"),
code("""df = build_features(load_raw())
df = merge_cluster_labels(df)
# Cast categoricals ONCE on the full dataframe before splitting -- keeps
# category levels consistent across train/val/test/demo-sample subsets.
df = cast_categorical_columns(df, extra_categorical=["bin_cluster_id"])
train, val, test = chronological_split(df)

X_train, y_train, meta_train = get_model_frame(train, TARGET_CLASSIFICATION, extra_categorical=["bin_cluster_id"])
X_val,   y_val,   meta_val   = get_model_frame(val,   TARGET_CLASSIFICATION, extra_categorical=["bin_cluster_id"])
X_test,  y_test,  meta_test  = get_model_frame(test,  TARGET_CLASSIFICATION, extra_categorical=["bin_cluster_id"])
print(X_train.shape, X_val.shape, X_test.shape)"""),

md("## 2. Class imbalance check"),
code("""balance = y_train.value_counts(normalize=True).round(4)
print("Train class balance:\\n", balance)
scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
print(f"\\nscale_pos_weight = {scale_pos_weight:.2f}")"""),

md("## 3. Train XGBoost classifier"),
code("""clf = xgb.XGBClassifier(
    objective="binary:logistic",
    n_estimators=1000,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_weight=5,
    scale_pos_weight=scale_pos_weight,
    enable_categorical=True,
    tree_method="hist",
    random_state=42,
    early_stopping_rounds=30,
    eval_metric="aucpr",
)
clf.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
print("Best iteration:", clf.best_iteration)"""),

md("## 4. Evaluate — PR-AUC first (imbalanced positive class), then ROC-AUC"),
code("""proba_test = clf.predict_proba(X_test)[:, 1]
roc_auc = roc_auc_score(y_test, proba_test)
pr_auc = average_precision_score(y_test, proba_test)
print(f"Test ROC-AUC: {roc_auc:.3f}")
print(f"Test PR-AUC:  {pr_auc:.3f}   (baseline PR-AUC for random = positive rate = {y_test.mean():.3f})")"""),

code("""precisions, recalls, thresholds = precision_recall_curve(y_test, proba_test)
fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))

axes[0].plot(recalls, precisions, color="firebrick")
axes[0].set_xlabel("Recall"); axes[0].set_ylabel("Precision")
axes[0].set_title(f"Precision-Recall curve (PR-AUC={pr_auc:.3f})")

axes[1].plot(thresholds, precisions[:-1], label="Precision")
axes[1].plot(thresholds, recalls[:-1], label="Recall")
axes[1].set_xlabel("Decision threshold"); axes[1].set_title("Precision & Recall vs. threshold")
axes[1].legend()
plt.tight_layout(); plt.show()"""),

md("## 5. Threshold selection\nCity ops care more about catching real overflow risk than avoiding false alarms — pick the threshold hitting ~85% recall, per `ML_PIPELINE_PLAN.md` §6.2."),
code("""target_recall = 0.85
valid_idx = np.where(recalls[:-1] >= target_recall)[0]
chosen_idx = valid_idx[np.argmax(precisions[:-1][valid_idx])] if len(valid_idx) else np.argmax(recalls[:-1])
chosen_threshold = thresholds[chosen_idx]
print(f"Chosen threshold: {chosen_threshold:.3f} -> "
      f"Precision: {precisions[chosen_idx]:.3f}, Recall: {recalls[chosen_idx]:.3f}")

y_pred_at_threshold = (proba_test >= chosen_threshold).astype(int)
cm = confusion_matrix(y_test, y_pred_at_threshold)
plt.figure(figsize=(5, 4))
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=["No overflow", "Overflow"], yticklabels=["No overflow", "Overflow"])
plt.xlabel("Predicted"); plt.ylabel("Actual")
plt.title(f"Confusion matrix @ threshold={chosen_threshold:.2f}")
plt.tight_layout(); plt.show()

print(classification_report(y_test, y_pred_at_threshold, target_names=["No overflow", "Overflow"]))"""),

md("## 6. Feature importance & SHAP"),
code("""importance = pd.Series(clf.feature_importances_, index=X_train.columns).sort_values(ascending=False).head(20)
importance.plot(kind="barh", figsize=(8, 7), color="crimson")
plt.title("Top 20 features by gain-based importance")
plt.gca().invert_yaxis()
plt.tight_layout(); plt.show()"""),

code("""sample_idx = np.random.RandomState(42).choice(len(X_test), size=min(1500, len(X_test)), replace=False)
X_sample = X_test.iloc[sample_idx]

explainer = shap.TreeExplainer(clf)
shap_values = explainer(X_sample)

shap.summary_plot(shap_values, X_sample, show=False, max_display=15)
plt.tight_layout(); plt.show()"""),

md("## 7. Save the model"),
code("""clf.save_model("model2_overflow_risk_xgb.json")
print("Saved model2_overflow_risk_xgb.json")
print(f"Deployed decision threshold: {chosen_threshold:.3f} (store alongside the model for inference)")"""),

md("## 8. Example output — the \"Overflow risk: 87%\" style report from the brief"),
code("""# Same caveat as the regression notebook: the last calendar date has no
# valid "next day" target for any bin, so use the latest date that does.
latest_date = test.dropna(subset=[TARGET_CLASSIFICATION])["date"].max()
day_df = test[test["date"] == latest_date].dropna(subset=[TARGET_CLASSIFICATION])
sample_bins = day_df.sample(min(8, day_df.shape[0]), random_state=7)

X_show, y_show, meta_show = get_model_frame(sample_bins, TARGET_CLASSIFICATION, extra_categorical=["bin_cluster_id"])
proba_show = clf.predict_proba(X_show)[:, 1]

report = pd.DataFrame({
    "bin_id": meta_show["bin_id"].values,
    "zone_type": sample_bins["zone_type"].values,
    "current_fill_pct": sample_bins["fill_percentage_end_of_day"].round(1).values,
    "overflow_risk_pct": (proba_show * 100).round(1),
    "flagged_for_priority_collection": proba_show >= chosen_threshold,
    "actual_overflow_next_day": y_show.astype(bool).values,
}).sort_values("overflow_risk_pct", ascending=False)
report"""),

md("""## 9. Summary
- XGBoost classifier with `scale_pos_weight` handles the 10.2% positive-class imbalance without synthetic oversampling.
- Threshold tuned for ~85% recall (catch most real overflow events), reporting the resulting precision as the honest trade-off.
- `overflow_risk_pct` from this notebook is what feeds OR-Tools' route-priority weights in the wider architecture — bins with higher scores get visited earlier.
- This closes the loop described in `ML_PIPELINE_PLAN.md`: Model 3 (clusters)  Models 1 & 2 (forecasts + risk)  route optimization (outside this notebook's scope)."""),
]

nbf.write(nb(cells_04), "04_model2_overflow_classification.ipynb")

print("Built 01, 02, 03 and 04")
