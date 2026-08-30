# 🌐 NagarAI — Predictive Municipal Waste & Sanitation Intelligence

NagarAI is an AI-powered municipal sanitation operating system. It predicts
**where, when and what type of waste will accumulate**, then optimizes
**bins, vehicles, routes, workers and interventions** before problems occur.

> From reactive garbage collection → predictive city sanitation.

This monorepo builds on the existing SustainX (MERN) codebase as the baseline
(auth, IoT bin data, citizen reports, worker task completion with photo proof)
and adds the NagarAI prediction & optimization engine on top.

---

## 📁 Structure

```
nagarai/
├── server/          # Node + Express + MongoDB (Mongoose) backend
│   ├── config/      # db, cloudinary
│   ├── models/      # User, Zone, Landmark, Bin, Vehicle, Worker, Event, ...
│   ├── controllers/
│   ├── routes/
│   ├── middleware/  # auth (JWT), upload
│   ├── services/    # (prediction, route optimizer, workforce — added per phase)
│   └── server.js
└── client/          # React 19 + Vite frontend (port 3001, proxies /api → 5000)
```

## 🚀 Quick Start

### Prerequisites
- Node 18+
- A MongoDB database (local or hosted, e.g. MongoDB Atlas)

### 1. Configure backend
```bash
cd server
cp .env.example .env   # (or edit existing .env)
```
Set your connection string:
```
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>/<dbname>
```

### 2. Install deps
```bash
cd server && npm install
cd ../client && npm install
```

### 3. Seed mock city data
```bash
cd server && node seed.js
```

### 4. Run
```bash
# Terminal 1 — backend
cd server && npm run dev     # → http://localhost:5000

# Terminal 2 — frontend
cd client && npm run dev     # → http://localhost:3001
```

### Default logins (after seeding)
| Role     | Email                   | Password   |
|----------|-------------------------|------------|
| Admin    | admin@nagarai.test      | admin123   |
| Worker   | worker1@nagarai.test    | worker123  |

---

## 🗺️ Implementation Roadmap (phase by phase)

| Phase | Module | Status |
|-------|--------|--------|
| 0 | Foundation & consolidation (models, seed, env) | ✅ |
| 1 | 🧠 AI Waste Prediction (rule/seasonal + ML hook) | ✅ |
| 2 | 🎪 Event & Spike Prediction | ✅ |
| 3 | 🗑️ Bin Placement / Capacity / Relocation | ✅ |
| 4 | 🚛 Dynamic Route + Workforce Optimization (CVRP) | ✅ |
| 4b | 🤖 ML Trainer scaffolding (dataset export + baseline/XGBoost/LightGBM) | ✅ |
| 5 | 📱 Citizen Report → Task → AI Verification | ✅ |
| 6 | 📊 Municipal Command Center Dashboard | ✅ |
| 7–9 | What-If Simulator / Sweeping / CCTV | ⏳ |

---

## 🔐 Environment Vars

`server/.env`:
- `PORT` — backend port (default 5000)
- `MONGO_URI` — **required** MongoDB connection string
- `JWT_SECRET` — token signing secret
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — optional image upload (skipped if unset)
- `ML_ENGINE` — optional `baseline` (default) | `xgboost` | `lightgbm`

---

## 📦 NagarAI Engine (server/services)

All NagarAI intelligence lives in `server/services/` and is callable both from
HTTP routes and standalone scripts.

| Service | Purpose |
|---------|---------|
| `timeFeatures.js` | Shared temporal/seasonal/event multiplier helpers |
| `predictionEngine.js` | Rule/seasonal prediction + pluggable `ml` strategy. Predicts fill% & kg across 1h/6h/12h/24h/48h/7d, overflow time, risk score |
| `eventEngine.js` | Event waste-spike impact (attendance → extra bins/vehicles/sweepers, peak hours) |
| `binOptimizer.js` | **Bin Demand Score** = 0.30·predicted_waste + 0.20·footfall + 0.15·food_business + 0.15·overflow_history + 0.10·population + 0.10·distance_from_bins → add/upgrade/relocate decisions |
| `routeOptimizer.js` | Zero-dependency CVRP (capacity-constrained nearest-neighbor) route generation |
| `workforceOptimizer.js` | Staffing needs per zone (collectors/vehicles/sweepers/supervisors) |
| `geo.js` | Haversine distance helpers |
| `ml/dataGenerator.js` | Synthetic hourly dataset matching the ML feature schema |
| `ml/trainer.js` | Backend-aware trainer (`baseline` now; `xgboost`/`lightgbm` hooks) |
| `ml/exportDataset.js` | Persist dataset JSON/CSV + trained model snapshots → `server/data/ml/` |

## 🔌 API (all require JWT via `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/predictions/run` | Run prediction engine across bins, persist `WastePrediction`, return results |
| GET | `/api/predictions` | Latest predictions (`?binId=&overflowOnly=1&limit=`) |
| POST | `/api/events` | Create event → auto-compute sanitation impact |
| GET | `/api/events` | List events (`?upcoming=1`) |
| GET | `/api/events/:id/impact` | Recompute impact for an event |
| PUT | `/api/events/:id` | Update event status |
| GET | `/api/bins` | List bins |
| POST | `/api/bins/optimize` | Run Bin Demand Score + placement/capacity optimization |
| GET | `/api/bins/recommendations` | Stored add/upgrade/relocate recommendations |
| POST | `/api/routes/generate` | CVRP routes for due bins (no task creation) |
| POST | `/api/routes/deploy` | CVRP routes + assign workers + persist `CollectionTask`s |
| POST | `/api/routes/reroute` | Dispatch nearest vehicle to an urgent incident |
| GET | `/api/routes/workforce` | Staffing needs per zone (optionally for an event) |
| GET | `/api/ml/status` | Engine/backends/feature schema/model snapshot |
| POST | `/api/ml/generate` | Generate + export dataset from DB seed |
| POST | `/api/ml/train` | Train a model from dataset (baseline now) |
| POST | `/api/incidents` | Create incident (auto-priority + dedup) → auto-creates task |
| GET | `/api/incidents` | List incidents (role-aware: citizen own / worker zone / admin all) |
| PUT | `/api/incidents/:id/assign` | Assign incident/task to a worker |
| POST | `/api/incidents/:id/complete` | Complete incident with proof → verification score |
| GET | `/api/tasks` | List collection tasks (role-aware) |
| PUT | `/api/tasks/:id/status` | Update task status (syncs linked incident) |

## 🤖 ML workflow (works WITHOUT a database)

```bash
cd server
node scripts/generateDataset.js --days=30 --train     # generate + train baseline
node scripts/generateDataset.js --days=30             # just export dataset
# Full pipeline uses server/data/ml/*.csv|json + baseline model snapshots
```

## 🏙️ Command Center UI

Login as **admin** → sidebar → **NagarAI Command**. A single screen exercising the
whole engine:
- **Overview**: stat cards, risk-coded SVG city map, predicted overflow hotspots, event impacts
- **Predictions**: run + inspect fill% across all horizons per bin
- **Routes & Fleet**: generate CVRP routes or deploy → create collection tasks
- **Bin Optimizer**: run the Bin Demand Score → add/upgrade/relocate actions
- **Incidents**: auto-prioritized, de-duplicated citizen reports
- **Workforce**: staffing needs per zone (live on event multiplier)

Also available standalone at **`/command`** (admin only).
