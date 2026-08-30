# NagarAI — Phases E–H Build Plan

Continues `full_proj.md` (Workstreams A–D: ML bridge, backend core, frontend rebuild, testing — all shipped). This covers the four remaining phases: Smart Sweeping, Computer Vision, Command Center integration, and the Feedback/retraining loop.

**Ground rule for this whole plan:** several of these phases sound greenfield but aren't — the backend pipelines already exist and work. The plan below is written as a gap analysis against the real code, not a rebuild-from-scratch. Re-reading §0 before starting any phase will save time.

---

## 0. Current state — what's real vs. what's actually missing

Verified against the code, not assumed:

| Phase | Already built (reuse as-is) | Actually missing |
|---|---|---|
| **E — Sweeping** | `SweepingNeed` model, `sweepingEngine.js` (dirt score + frequency formula from footfall/markets/events/weather), `POST /api/sweeping/analyze`, `GET /api/sweeping/needs`, `POST /api/sweeping/plan`/`deploy` (creates `CollectionTask` with `type: 'sweeping'`), a working "Sweeping" tab in `NagaraiCommandCenter.jsx` with a "Run analysis" button and results table | The UI is a raw table only — no map overlay, no per-zone drill-down, no visual priority ranking, no sweeper-assignment view once a task is deployed |
| **F — Computer vision** | Full incident pipeline: `WasteIncident` model (dedup, priority, source tracking), `createIncident`/`assignIncident`/`completeIncident`, auto-task creation, admin notifications, a CCTV tab in the Command Center (upload frame → detect → incident created) | `analyzeFrame()` in `cctvController.js` is a **pixel-variance heuristic**, not a trained detector — this is the real gap. `completeIncident`'s "AI verification" is a **deterministic formula** (`40 + hasImage×35 + duplicate×15`), not an actual before/after comparison |
| **G — Command Center** | `NagaraiMap.jsx` already renders a Leaflet map with a heatmap layer, route polylines, and risk-colored bin markers; incidents/sweeping/CCTV already have their own tabs with live data; polling-based updates already exist (`setInterval` in `NotificationBell.jsx`, dashboards) | Everything lives in **separate tabs** — the map doesn't show incidents, sweeping needs, or event zones as layers. No unified "what's happening right now" view. No toggleable layers. No simulation-result visualization tied to the map |
| **H — Feedback** | `WastePrediction` model records every forecast (`predictedFillPct`, `riskScore`, `overflowAt`, `modelVersion`) | **No field or job ever records the actual outcome.** There is no accuracy tracking, no error metric, no retraining trigger anywhere in the codebase — this phase is genuinely new |

This changes the effort shape a lot: E and G are mostly **integration and visualization** work on top of solid APIs; F and H are where the real new engineering is.

---

## Phase E — Smart Sweeping

### E1. Complete sweeping UI
Reuse `GET /api/sweeping/needs` (already returns zone-populated, priority-sorted results) and `POST /api/sweeping/analyze`/`deploy` as-is. Build:
- A **priority-ranked card list** (not a raw table) grouped by `roadType`, each card showing `dirtScore`, `frequencyLabel`, `contributors` (the "why" — e.g. "market nearby", "event today"), and a one-click "Deploy sweeper" button that calls `/api/sweeping/deploy` scoped to that zone.
- A **map overlay**: plot `SweepingNeed.location` (or the zone's centroid via `Zone` lookup) as colored circles on `NagaraiMap.jsx`, color = `dirtScore` bucket (reuse the existing bin-risk color scale for visual consistency). This is the single highest-value addition — right now sweeping is invisible on the map that everything else lives on.

### E2. Dirt accumulation prediction
Already implemented in `sweepingEngine.js` — verify the formula's inputs are actually current: footfall proxy, market/food-street density, weather param, event multiplier. No new model needed. Action item: read `sweepingEngine.js` and confirm each contributor is real data, not a hardcoded stub, before presenting `contributors` as "why" text in the UI (E1) — don't let the UI claim explainability the engine doesn't actually have.

### E3. Sweeping priority
`priority` field already computed and sorted server-side (`getSweepingNeeds` sorts by `priority: -1`). Just needs to drive the visual ranking in E1 — no backend work.

### E4. Sweeper deployment
`CollectionTask` already supports `type: 'sweeping'` with `assignedTo: [Worker]`. Gap: `deploySweeping()` (in `services/sweeping.js`) needs to actually assign a specific worker/vehicle, not just create an unassigned task — check whether it currently sets `assignedTo`; if not, reuse the same nearest-available-worker logic that `workforceOptimizer.js` already has for collection tasks (don't write a second assignment algorithm).
- Add a **Collector-side view**: sweeping tasks assigned to a worker should show up in `CollectorDashboard.jsx` alongside collection tasks (the `type` field already distinguishes them — this is a filter/UI addition, not new data model work).

### E5. Event-aware sweeping
`eventsByZone` multiplier already wired into `analyzeSweepingNeeds` via the `Event` model. Verify it actually shifts `dirtScore` visibly when an upcoming/active event exists in a zone — write one manual test case (seed an event, re-run analyze, confirm the affected zone's score jumps) before considering this done. This is a two-line verification, not new code, but skipping it means shipping an unverified claim.

---

## Phase F — Computer Vision

This is the phase with real new ML/infra work. Scope decision needed up front (see Open Questions).

### F1. YOLO setup
**Recommendation: YOLOv8n (nano) via the `ultralytics` Python package**, run as a small inference endpoint inside `ml-service` (already a FastAPI app sitting next to the XGBoost models — same process, one more route, no new service to deploy).
- Use a **pretrained COCO/general-object checkpoint** to start, not a custom-trained waste model — there's no labeled waste-image dataset in this repo (`ml/` only has tabular bin data), and training a custom detector is out of scope for the available data. COCO won't have a "garbage pile" class, so:
- **Practical detection strategy**: run YOLO for object density/clutter counting (bounding-box count + coverage-area ratio) as the *replacement signal* for the current pixel-variance heuristic — same output shape (`garbageDetected`, `confidence`, `severity`, `estimatedAreaM2`), same downstream pipeline (`incidentPriority`, `findDuplicate`, task creation) untouched. This is a plug-compatible upgrade, not a rewrite: `analyzeFrame()` is already isolated for exactly this swap (see its own doc comment).
- If a labeled litter dataset becomes available later (e.g. TACO — Trash Annotations in Context, a public dataset), fine-tune YOLOv8n on it for real waste-class detection. Flag this as a stretch goal, not a blocker — ship the object-density version first.

### F2. Waste/litter detection
- New `ml-service` endpoint: `POST /detect/frame` (multipart image) → runs YOLO inference → returns `{ objectCount, avgConfidence, coverageRatio, boxes: [...] }`.
- Node's `analyzeFrame()` in `cctvController.js` calls this endpoint (via axios, same pattern as `mlServiceClient.js` already uses for predictions — including its fallback-to-heuristic behavior if the service is unreachable, so the current pixel-variance method becomes the fallback, not dead code).
- Map `coverageRatio`/`objectCount` → `clutterScore` using the same thresholds already tuned in the heuristic (`> 0.45` detected, `> 0.75` high severity) as a starting calibration; re-tune against a handful of real test photos before demo.

### F3. CCTV/image inference
Already wired end-to-end (`POST /api/cctv/detect` → `analyzeFrame` → incident). Only change: `analyzeFrame` becomes async-over-HTTP to `ml-service` instead of local `sharp` stats. No route/controller signature changes needed elsewhere.

### F4. AI incident creation
Already fully built (`WasteIncident.create` inside `detectFromImage`). Nothing to do.

### F5. Priority assignment
Already fully built (`incidentPriority()`, shared between citizen reports, CCTV, and IoT). Nothing to do.

### F6. Worker task
Already fully built (`CollectionTask.create` inside `detectFromImage`/`createIncident`). Nothing to do.

### F7. Photo verification
Real gap. Current `completeIncident` formula ignores the actual before/after images entirely. Upgrade path:
- Reuse the same YOLO endpoint from F2: run it on both the original incident `image` and the worker's `completionImage`.
- Verification logic: **object/clutter count should drop significantly** between before and after (e.g. `coverageRatio` down by some threshold). Compute `verificationScore` from that delta instead of the current fixed formula:
  `verificationScore = clamp(0, 100, round(100 × (beforeCoverage − afterCoverage) / max(beforeCoverage, 0.01)))`, blended with the existing signals (has image, duplicate count) as a floor/ceiling rather than replacing them outright.
- This reuses F2's endpoint twice per completion — no new model, just two calls instead of a static formula.

---

## Phase G — Command Center Integration

The theme here: **stop treating incidents/sweeping/CCTV/predictions as separate tabs and make the map the single source of truth**, with tabs becoming detail/management views that highlight what's already on the map.

### G1. Connect everything to dashboard
Refactor `NagaraiCommandCenter.jsx`'s data-loading `useEffect` (already fetches bins/events/workforce/incidents/ML status in parallel via `Promise.all`) to also fetch `sweepingNeeds` on load, not just on-demand after clicking "analyze" — so the map has something to show immediately.

### G2. Map layers
Extend `NagaraiMap.jsx` (currently: tile layer, heatmap, route polylines, bin markers) with toggleable layers, passed as props from the parent so state lives in `NagaraiCommandCenter.jsx`:
- **Incidents layer**: marker per `WasteIncident.location`, icon/color by `source` (cctv/citizen/iot) and `status`, popup with `incidentId`/`priority`/`type`.
- **Sweeping layer**: from E1's map overlay — same map, controlled by the same layer-toggle UI.
- **Event zones layer**: existing `Event` model already has a `zone` reference — draw the affected zone's boundary (if `Zone` has polygon/boundary data; if not, a circle at the zone centroid sized by `wasteMultiplier` is an acceptable v1) when an event is upcoming/active.
- Layer toggles as a small floating control (checkbox group) on the map itself, not buried in a sidebar — this is the kind of UI a judge/demo audience actually interacts with.

### G3. Real-time alerts
No WebSocket infrastructure exists anywhere in the app today — everything is `setInterval` polling (`NotificationBell.jsx`, dashboards). **Don't introduce Socket.io/WebSocket for this** unless the team specifically wants it; it's a new moving part (server upgrade, connection handling, reconnect logic) for a marginal gain over polling in a hackathon-scale deployment. Instead:
- Extend the existing polling pattern: `NagaraiCommandCenter.jsx` polls `/api/incidents?status=open` and the new sweeping-needs endpoint every ~15–20s while the tab is active, diffs against current state, and surfaces new high-priority items as a toast (Sonner is already installed and used elsewhere) plus a pulsing marker on the map.
- If true real-time later becomes a requirement, Server-Sent Events (SSE) is a smaller lift than WebSockets for this one-directional (server→client) use case — flag as a stretch option, not the default plan.

### G4. Route visualization
Already substantially built — `Polyline` rendering from `roadPolyline` already exists in `NagaraiMap.jsx`, fed by `generateRoutes`/`deployRoutes`. Gap: routes aren't currently shown *alongside* the new incident/sweeping layers, so a route can't be visually checked against what it's supposed to be responding to. Fix is purely compositional once G2's layer system exists — no new route logic.

### G5. Prediction visualization
Bin markers already color-coded by risk (`binIcon(value, label, value)` in `NagaraiMap.jsx`). Add: a small trend sparkline in each bin's popup using `WastePrediction` history for that `targetId` (Recharts is already a dependency) — turns "this bin is red" into "here's why, and where it's heading."

### G6. Event simulation visualization
`simulatorController.js` (per `full_proj.md` Workstream B) re-runs the optimizers against a modified scenario and returns a before/after comparison object. Visualization: render the *proposed* route/risk changes as a second, dashed-style layer on the same map (reuse G2's layer toggle system — "simulated" becomes just another layer), rather than a separate results screen. Lets a user see the diff spatially instead of reading a table of deltas.

### G7. Intervention workflow
The actual gap here is UX, not data: right now, going from "I see a problem on the map" to "a worker is dispatched" requires switching tabs (map → incidents tab → assign). Add a **map-popup action**: clicking an incident/sweeping marker shows priority + a direct "Dispatch" button that calls the existing `assignIncident`/`deploySweeping` endpoints inline, closing the loop without leaving the map view. This is the single change most likely to make the Command Center feel like a real operations tool instead of a set of reports.

---

## Phase H — Feedback Loop

The only phase with no existing scaffolding at all. Build order matters here — each step depends on the last actually running for a while first.

### H1. Actual vs. predicted waste
- Add fields to `WastePrediction`: `actualFillPct` (Number, default `null`), `actualRecordedAt` (Date, default `null`), `error` (Number, default `null` — computed once actual is known).
- New scheduled job (reuse whatever mechanism already exists for periodic jobs in this codebase — check `server.js`/`scripts/` for an existing cron/interval pattern before adding `node-cron` as a new dependency): for every `WastePrediction` whose `overflowAt`/horizon has passed and `actualFillPct` is still `null`, look up the bin's real `currentLevel` (from IoT data or the most recent `Bin` document) and backfill `actualFillPct` + compute `error = actualFillPct - predictedFillPct`.

### H2. Error tracking
- New endpoint `GET /api/stats/prediction-accuracy` (mirrors the existing `statsRoutes.js` pattern): aggregate `WastePrediction` docs where `actualFillPct != null`, group by `modelVersion` and/or `horizon`, return mean absolute error (MAE) and a simple accuracy percentage (`100 - MAE`) per group.
- Surface this in the Command Center — this is the number that makes "live prediction accuracy" (already claimed on the public landing page's FAQ, worded carefully as "scored continuously" rather than a fixed number) actually true instead of aspirational. Closing this loop retroactively validates that FAQ answer.

### H3. Store historical outcomes
`WastePrediction` documents already accumulate over time (never deleted) — H1's backfill is the only addition needed. No new storage model required; resist the urge to build a separate "PredictionHistory" collection when the existing one already has a timestamp index and just needs the actual-value fields from H1.

### H4. Retraining pipeline
- A script (`ml/retrain.py`), not an auto-triggered job — retraining on demand or on a manual schedule (e.g. weekly) is the right cadence for a system with this data volume; don't build automatic retraining triggers before there's evidence the model actually drifts.
- Pulls `WastePrediction` rows with non-null `actualFillPct` via a small export endpoint or direct DB read, joins with the original feature set from `ml/feature_engineering.py` (reuse, don't reimplement), appends to the existing training data shape used by `03_model1_fill_percentage_regression.ipynb`, retrains the XGBoost model, and writes a **new versioned file** (`model1_fill_percentage_xgb_v2.json`) rather than overwriting `model1_fill_percentage_xgb.json` — so a bad retrain is a config change (point `inference.py` back at v1), not a data-loss incident.
- Bump `modelVersion` in new `WastePrediction` records once the new model is live, so H2's accuracy tracking can compare versions against each other directly — this is exactly why `modelVersion` already exists as a field.

---

## Execution order

1. **G1–G2** (wire sweeping into the load cycle, build the map layer system) — this is the shared foundation E1, G4, G5, G6, G7 all build on top of. Do this before E1 specifically, so the sweeping map overlay is built once, correctly, inside the new layer system rather than as a one-off.
2. **E1, E4** (sweeping UI + real deployment assignment) — now has somewhere to render.
3. **G3, G7** (polling alerts, map-popup dispatch actions) — makes the now-unified map interactive, not just a viewer.
4. **F1–F3** (YOLO service + swap into CCTV detection) — independent backend/ML work, can run in parallel with steps 1–3.
5. **F7** (photo verification upgrade) — depends on F1–F3 existing.
6. **G5, G6** (prediction sparklines, simulation overlay) — polish on the now-stable map, do last among the G items since they're the least demo-critical individually.
7. **H1 → H2 → H3 → H4, strictly in that order** — H2's accuracy numbers are meaningless without H1 actually running for some time first to accumulate real actual-vs-predicted pairs; don't build the retraining script (H4) before there's real error data (H1/H2) to retrain against.

---

## Open questions to confirm before/while building

1. **F1 scope**: pretrained COCO-based object-density detection (recommended, ships now) vs. holding out for a labeled waste dataset to fine-tune on (better accuracy, but blocks on data that doesn't exist yet in this repo). Recommend starting with the former and treating the latter as a stretch goal.
2. **G3**: confirm polling (simple, consistent with the rest of the app) is acceptable for "real-time," or whether the brief specifically requires push-based updates (would justify the SSE upgrade).
3. **H1's scheduled job**: needs a decision on where periodic jobs live in this deployment (a `setInterval` inside `server.js`, a separate cron script, or a platform-level scheduled task on Render) — check deployment target before picking a mechanism, since this affects Phase H's very first step.
4. **H4's retraining cadence**: manual/on-demand (recommended for now) vs. scheduled — revisit once H1/H2 have been running long enough to know if drift is actually a problem worth automating around.
