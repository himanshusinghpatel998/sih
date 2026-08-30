# NagarAI — Full Project Build Plan

Plan only — no code changed yet. Covers: (1) linking the real trained ML models into the live app, (2) finishing the backend, (3) rebuilding the frontend to be genuinely polished. Written after inspecting the actual repo state, not the README's aspirational status.

---

## 0. Current state — what's real vs. placeholder

The monorepo has **four** projects. Only one is the active target:

| Folder | Status | Verdict |
|---|---|---|
| `Garbage_Truck_Monitoring_System/` | Old Django prototype (CVRP routing, server-rendered templates) | Reference only — not touched |
| `WASTE_MANAGEMENT/SustainX-main/` | Earlier MERN version + ESP32 firmware | Historical baseline `nagarai/` was forked from — not touched |
| `ml/` | Real, properly-trained ML models (see below) | **Source of truth for prediction models** |
| `nagarai/` | Current React 19 + Vite client, Node/Express/Mongoose server | **The project we build** |

### `ml/` — what actually exists
- `waste_bin_dataset.csv` — 112,574 rows, 154 bins, 12 Mangaluru zones, 2 years, causally-simulated (not random noise).
- `feature_engineering.py` — shared, reusable pipeline: `load_raw`, `build_features` (lag/rolling/cyclical/interaction features), `build_bin_aggregates`, `merge_cluster_labels`, `chronological_split`, `get_model_frame`. **This is training-time code only — no inference-time "predict for bin X today" function exists yet.**
- `model1_fill_percentage_xgb.json` — trained XGBoost regressor (next-day fill %).
- `model2_overflow_risk_xgb.json` — trained XGBoost classifier (next-day overflow probability).
- `bin_cluster_mapping.csv` — K-Means cluster label per `bin_id` (Model 3 output, already computed, not re-run at inference).
- `bins_master.csv` — static per-bin metadata (zone, capacity, lat/long, density, nearby restaurants/markets) needed to build the live feature vector.
- No `requirements.txt` yet.

### `nagarai/server/` — what actually exists
Full Express REST API already covers auth, users, complaints, rewards, stats, store, orders, iot, notifications, **predictions, events, bins, routes, ml, incidents, tasks, simulate, sweeping**. Mongoose models exist for `Bin`, `Zone`, `Event`, `Vehicle`, `Worker`, `Route`, `WastePrediction`, `BinRecommendation`, `SweepingNeed`, `WasteIncident`, etc.

**The critical gap:** `services/predictionEngine.js` is 100% rule-based (hand-written multipliers for weekend/event/weather). `services/ml/trainer.js` has an `ML_ENGINE=xgboost|lightgbm` hook, but it `require('xgboost')`/`require('lightgbm')` **npm packages that don't wrap the real trained models** — it's a dead branch pointed at a completely different, much simpler 19-feature synthetic schema than the real `ml/` pipeline's ~40+ engineered features. **The real trained models are not connected to the app at all.** That's the "link the ML models" work.

Per the README, phases 7–9 are unbuilt: **What-If Simulator**, real **Sweeping** optimization, **CCTV** intelligence. `simulatorController.js` (38 lines) and `sweepingController.js` (26 lines) are stubs.

### `nagarai/client/` — what actually exists
Plain JS (no TypeScript), Vite, React 19, `react-router-dom` v7, `axios`, `leaflet`/`react-leaflet` for maps, one hand-written `style.css` (3,017 lines), custom `ThemeContext` (light/dark via `data-theme`, already working), custom `ToastContext`. No Tailwind, no component library. Four screens, all monolithic:

| Screen | Lines | Role |
|---|---|---|
| `pages/student/StudentDashboard.jsx` | 1,255 | Citizen: report issues, track complaints, find bins |
| `pages/collector/CollectorDashboard.jsx` | 1,177 | Worker: tasks, routes, before/after photo upload |
| `pages/admin/AdminDashboard.jsx` | 749 | Admin: users, complaints, rewards, store |
| `pages/admin/NagaraiCommandCenter.jsx` | 559 | The flagship predictive dashboard — map + predictions + events + routes |
| `pages/AuthPage.jsx` | 340 | Login/register |

This is the redesign surface. Everything works functionally; nothing is "sexy" yet — no motion, no design system, one giant CSS file, no charts (Command Center is map + numbers, no trend visualization).

---

## 1. Target architecture

```
sih_hackathon/
├── ml/                          # unchanged: notebooks, trained models, feature_engineering.py
│   ├── inference.py             # NEW — the missing piece, see §2
│   └── requirements.txt         # NEW
├── ml-service/                  # NEW — Python microservice wrapping the real models
│   ├── main.py                  # FastAPI app
│   ├── requirements.txt
│   └── Dockerfile               # optional, for deploy
└── nagarai/
    ├── server/                  # Express — calls ml-service over HTTP, unchanged data model
    └── client/                  # React 19 + TS + Tailwind + shadcn/ui (rebuilt)
```

Why a separate Python service instead of trying to run XGBoost inside Node: the trained models are XGBoost boosters produced by `feature_engineering.py`'s exact feature pipeline (lag/rolling windows, cyclical encodings, target-encoded categoricals, cluster labels). Re-implementing that in JS risks train/serve skew — the #1 failure mode the ML plan doc itself warns about. A thin FastAPI wrapper reuses the pipeline verbatim. Node stays the single source of truth for app state (Mongo) and just calls out for predictions, same pattern as calling any other internal API.

---

## 2. Workstream A — Link the real ML models

This is the foundational workstream; the redesigned Command Center dashboard is only as good as the data it shows.

1. **Write `ml/inference.py`** — the "package a small inference script" step the ML plan doc already calls out as outstanding (§7/§9 of `ML_PIPELINE_PLAN.md`). Given a live bin's current state (last known fill %, capacity, zone attributes, today's date/weather/event context) plus its recent history, reconstruct the same feature vector `build_features` produces at training time, then:
   - Load `model1_fill_percentage_xgb.json` → predict next-day fill %.
   - Load `model2_overflow_risk_xgb.json` → predict overflow probability.
   - Look up `bin_cluster_id` from `bin_cluster_mapping.csv`.
   - For the 1h/6h/12h/24h multi-horizon display the brief wants: interpolate between current reading and the next-day point estimate (documented, honest simplification — the models are daily-granularity; state this explicitly in the demo narrative, per the plan doc §7.3).
2. **Feature-history store**: the trained models need lag/rolling features (`fill_pct_lag_7d`, `rolling_mean_fill_pct_7d`, `days_since_last_overflow`, etc.), which requires a rolling history per bin — the live Mongo `Bin`/`BinData` collections currently only track current state. Add a lightweight daily snapshot job (a new `server/scripts/snapshotBinHistory.js` cron, or a `BinHistory` Mongo collection written once/day) so the feature pipeline always has real trailing history to compute from, not just today's reading.
3. **Bootstrap real bin metadata**: `seed.js` currently generates mock zones/bins. Import `bins_master.csv`'s real static attributes (zone_type, capacity, population density, nearby restaurants/markets, lat/long) into the seed so live bins carry the same columns the model was trained on — otherwise predictions run on features the model has never seen a realistic distribution for.
4. **Build `ml-service/` (FastAPI)**:
   - `GET /health`
   - `POST /predict/bin` — one bin's current state + history → `{ fill_pct_next_day, overflow_risk, cluster_id, cluster_label, horizons: {1h,6h,12h,24h} }`
   - `POST /predict/batch` — same, for all bins in one call (used by the Command Center's map refresh)
   - Loads both boosters once at startup, not per-request.
   - `requirements.txt`: `fastapi`, `uvicorn`, `xgboost`, `pandas`, `numpy`, `scikit-learn`.
5. **Wire Node to it**: add `predictBinWithRealModel` in `predictionEngine.js` (parallel to the existing `predictBinWithModel`), an `ML_ENGINE=xgboost-live` option, and `ML_SERVICE_URL` env var. `predictionController.js`'s `runPredictions` calls the service via `axios` when that mode is active, and **falls back to the existing rule-based engine if the service is unreachable** — never let a dead Python process break the demo.
6. **Keep the existing contract**: `WastePrediction` Mongo model and the `/api/predictions` routes stay the same shape the client already consumes — only the number-generation strategy changes underneath. This means the frontend rebuild (Workstream C) doesn't have to wait on this workstream to start on layout/design.
7. **Dev workflow**: add a root-level `concurrently` script (or three terminal tabs, documented in README) so `ml-service`, `server`, and `client` all start together. Note in `.env.example` that `ML_SERVICE_URL` defaults to `http://localhost:8000`.
8. **Stretch, if time remains** (from `ML_PIPELINE_PLAN.md` §8): SHAP per-prediction explainability endpoint (`GET /predict/bin/:id/explain`) — feeds a "why is this bin flagged" panel in the redesigned Command Center, a strong judge-facing feature.

---

## 3. Workstream B — Finish the backend

| Phase | What's missing | Plan |
|---|---|---|
| **7 — What-If Simulator** | `simulatorController.js` is a 38-line stub | Accept a scenario payload (`{ addTrucks, removeTrucks, addBins, festivalTomorrow, heavyRain }`), re-run `routeOptimizer.js`/`workforceOptimizer.js`/`predictionEngine.js` against the modified resource set, diff against baseline (overflow count, response time, distance/fuel), return a comparison object. No new ML needed — it's a parametrized re-run of existing optimizers. |
| **9 — Predictive Sweeping** | `sweepingController.js` is a 26-line stub, `SweepingNeed` model exists unused | Compute a **Road Dirt Accumulation Score** per zone from existing signals already in Mongo (footfall, nearby markets/restaurants, event calendar, weather, historical incident density) — a weighted formula like the existing rule-based prediction engine, not a new model. Output a sweeping frequency recommendation per zone/road segment. |
| **8 — CCTV Intelligence** | Not started; no controller/model | **Scope down for hackathon reality.** True live CCTV + YOLO detection is a multi-week CV project. Recommended MVP: an "upload/simulate a frame" endpoint (`POST /api/cctv/detect`) that runs a pretrained, off-the-shelf object-detection model (e.g. a hosted vision API, or a small pretrained classifier) against an uploaded image, returns `{ garbage_detected, confidence, estimated_severity }`, and auto-creates a `WasteIncident` — mirrors the exact "AI Detection → incident" flow in the brief without needing a custom-trained model or live camera feed. Flag this as a judgment call — confirm scope with the user before building (see §7 open questions). |
| **Command Center data needs** | New dashboard (Workstream C) wants trend charts, not just current snapshot | Add `GET /api/stats/trends?metric=fillPct&range=7d` style endpoints aggregating `WastePrediction`/`BinData` history over time — needed for the Recharts trend lines described in §4. |

---

## 4. Workstream C — Rebuild the frontend ("make it sexy")

Uses the skills installed this session: `frontend-design` (aesthetic direction), `landing-page-design` (if a public marketing/pitch page is added, see below), the Emil Kowalski animation set (`animate`, `apple-design`, `emil-design-eng`, `ask-sonner`, `find-animation-opportunities`, `review-animations`), and the Owl-Listener design-critique set (`ui-design`, `interaction-design`, `design-systems`, `visual-critique`) for the final polish pass.

### 4.1 Foundation (do this first, before touching any page)
1. **TypeScript migration**: switch `client` to `tsx`/`ts` — `tsconfig.json`, rename files incrementally starting with new/rebuilt components; don't block on converting the old monoliths before deleting them.
2. **Tailwind CSS + shadcn/ui**: install and initialize; this replaces `style.css`'s 3,017 hand-written lines over time (delete sections as each page is rebuilt, don't do a big-bang CSS delete).
3. **Design tokens** — invoke `ui-design:color-palette` and `ui-design:type-system` and `design-systems:tokenize` to produce a documented token set (color scales incl. dark mode — `ThemeContext`'s `data-theme` mechanism already exists and stays), spacing scale, type scale. This is the "brief" the `frontend-design` skill needs to avoid generic output — ground it in NagarAI's actual identity (municipal/civic, data-dense, trustworthy-but-modern — not a generic SaaS look).
4. **Component primitives**: rebuild `components/ui/{Modal,StatCard,StatusBadge,ThemeToggle}` as shadcn-based primitives; add the shadcn `Toast`/replace `ToastContext` with **Sonner** (`ask-sonner` skill covers exact setup) for free polish on every notification in the app.
5. **Charts**: add **Recharts** for the Command Center — bin fill trend lines, overflow-risk distribution, zone comparison bars, collection-efficiency gauges. Load the `dataviz` skill before writing any chart for consistent, accessible color use across light/dark.
6. **Motion baseline**: add Framer Motion; use `animate`/`apple-design` skills for page transitions, sidebar/topbar micro-interactions, and the map's marker state changes (bin turning red as risk rises should *animate*, not snap).

### 4.2 Per-screen rebuild plan
| Screen | Redesign focus |
|---|---|
| **AuthPage** | Smallest surface, do it first as the TS+Tailwind+shadcn dry run. Distinctive hero/split-screen treatment per `frontend-design` — this is the first thing anyone (including judges) sees. |
| **NagaraiCommandCenter** (flagship) | Full redesign: KPI stat row (animated count-ups), Recharts trend panels, the Leaflet map restyled with a custom dark/light tile theme and animated risk markers, an "AI Recommendations" feed (matches the brief's §31 vision) as a distinct, scannable card list, and — once Workstream A lands — a per-bin "why is this flagged" panel if the SHAP stretch goal ships. |
| **AdminDashboard** | Convert to a proper shadcn data-table for users/complaints/rewards management; this is the most "enterprise CRUD"-feeling screen, so lean on `interaction-design:form-design` and `error-handling-ux` for the create/edit flows. |
| **StudentDashboard (citizen)** | Report-submission flow is the most user-facing/emotional surface — apply `interaction-design:design-form` + `loading-states` + `feedback-patterns` for the photo-upload-and-submit moment (this is a citizen's "did my report actually go through" trust moment). |
| **CollectorDashboard (worker)** | Field-use context: assume outdoor/one-handed/bad-connectivity use. Prioritize large tap targets (`interaction-design:fitts-law`), clear task-priority visual hierarchy, offline-friendly loading states. |
| **Sidebar/Topbar/NotificationBell** | Restyle as shadcn nav primitives; keep existing `AuthContext`/`ThemeContext` logic untouched, only the presentation layer changes. |

### 4.3 Optional: public landing page
The brief's "killer demo" framing and multi-role pitch (§54, §58 of the PRD) suggests a short marketing/pitch landing page ahead of the login screen would strengthen a hackathon demo — this is exactly what the `landing-page-design` skill was installed for. **Confirm with user before building** (adds scope); if yes, it's a single new route (`/`) with the existing `AuthPage` moving to `/login`.

### 4.4 Final polish pass (do this last, per-screen, before calling any screen "done")
Run `visual-critique:critique-screen` on each rebuilt screen → fix flagged issues using the referenced `ui-design`/`interaction-design` skill → re-run `find-animation-opportunities` to catch any UI moment that should move but doesn't → accessibility pass via `chrome-devtools-mcp:a11y-debugging` (keyboard nav, focus states, contrast, tap targets — non-negotiable given `CollectorDashboard`'s field-use context).

---

## 5. Workstream D — Testing

- **Playwright** (already installed): E2E for the critical paths — login as each of the 3 roles, submit a citizen complaint end-to-end, run predictions and confirm the Command Center updates, generate + view a route.
- **chrome-devtools-mcp**: use during development for perf (LCP on the map-heavy Command Center is a real risk) and console/network debugging, not just at the end.
- Visual regression is informal here (no dedicated skill installed for it) — rely on the `visual-critique` pass per screen instead of pixel-diffing.

---

## 6. Suggested execution order

1. **Foundation** (§4.1) — TS + Tailwind + shadcn + tokens + Sonner + Recharts + Framer Motion scaffolding. Nothing user-facing changes yet, but every later step builds on this.
2. **ML bridge** (§2, all of Workstream A) — in parallel with step 1 since it's backend/Python work with no frontend dependency. This unblocks real numbers for the Command Center rebuild.
3. **AuthPage rebuild** — smallest surface, validates the new stack end-to-end.
4. **NagaraiCommandCenter rebuild**, wired to real predictions from step 2 — the flagship screen, do it while the ML bridge is fresh.
5. **Backend phases 7 & 9** (Simulator, Sweeping) — needed before the Command Center can show What-If results or sweeping recommendations; sequence alongside step 4.
6. **StudentDashboard, CollectorDashboard, AdminDashboard rebuilds** — in that order (citizen-facing trust surface first, then field worker, then internal admin CRUD last since it's least demo-critical).
7. **CCTV MVP** (§3) — only after confirming scope (§7 below); lowest priority since it's the least-built and highest-effort-per-value item without a real camera feed.
8. **Testing pass** (§5) across all rebuilt screens.
9. **Final polish pass** (§4.4) screen-by-screen.
10. **Deploy** — server target is already Render-aware (CORS list references a Render URL); add `ml-service` as a second Render service (or bundle as a sidecar); client to Vercel/Netlify or alongside on Render static hosting.

---

## 7. Open questions to confirm before/while building

- **CCTV scope**: real live camera integration, or an upload-a-frame demo mode using an off-the-shelf pretrained detector? (Recommendation: demo mode — see §3.)
- **TypeScript migration depth**: convert all existing pages, or write new/rebuilt code in TS and leave any untouched legacy JS as-is? (Recommendation: latter, since every page is being rebuilt anyway per §4.2, this mostly resolves itself.)
- **Public landing page** (§4.3): in scope or not?
- **Deployment targets**: confirm Render for both `server` and the new `ml-service`, and where `client` should deploy.
- **Timeline**: is there a hackathon submission deadline that should set the priority cutoff (i.e., which of steps 6–9 above get cut if time runs out)?
