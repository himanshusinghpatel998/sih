# NagarAI — Predictive Municipal Waste & Sanitation Intelligence

**Demo Video:** [Drive Link for SIH Internal Hackathon Demo](https://drive.google.com/drive/folders/1G6ApeS_vt23JStBK_m9vcRFCjK-10IxH?usp=sharing)

## Problem Statement
Municipal waste management today is **reactive**: bins overflow before anyone
notices, collection routes are fixed regardless of actual demand, sanitation
staffing isn't matched to real waste load, and there's no visibility into
*where* and *when* waste will accumulate before it becomes a problem.

## Our Idea
NagarAI turns city sanitation from reactive to **predictive and closed-loop**.
It forecasts where waste will pile up (per bin, per zone, per hour) using a
real trained ML model on real city bin data, then automatically plans and
dispatches optimized collection — before the overflow happens, not after a
citizen complains.

## Novelty
- **Real trained XGBoost models** on actual per-bin fill history — not a
  rule-of-thumb heuristic — predicting fill % 1h–7d ahead per bin.
- **Closed-loop simulation**: predict → generate optimized routes (OR-Tools
  CVRP + skill-matched worker assignment) → deploy → advance the day →
  re-predict, so the system carries real state forward instead of resetting.
- **CCTV auto-detection**: a YOLOv8n object-density model flags overflow from
  a camera frame and auto-creates an incident + dispatches a worker, with a
  heuristic fallback if the ML service is down.
- **Demand-driven bin placement**: an MCLP-style optimizer recommends where
  new bins should physically go, based on real footfall/landmark/population
  data — not arbitrary spacing.
- **Predictive sweeping**: road-dirt accumulation scoring drives sweeper
  routes and frequency, separate from bin collection.
- **Citizen gamification**: reward points for verified complaints, redeemable
  in an in-app eco store — turning citizen reporting into a data source
  instead of a complaint box.

## Features by Role

**Citizen**
- File complaints with photo proof + AI quick-scan
- Track complaint status with a live timeline
- Earn reward points, redeem in the eco store

**Collector**
- Live dashboard of assigned block complaints & IoT bin alerts
- Manage & fulfill citizen store-redemption orders
- Resolve complaints with photo proof

**Admin — NagarAI Command Center**
- Live city map with real-time fill/overflow heatmap
- XGBoost fill predictions across all bins, multiple horizons
- Auto-generated & deployable collection routes (OR-Tools + fleet sizing)
- Bin placement optimizer, workforce planning, what-if event simulator
- Predictive sweeping plan/deploy
- CCTV overflow + crowd detection (YOLOv8n)
- Day-cycle simulation to test the full predict→collect→carry-forward loop

**Admin — Waste Ops (bin placement lab)**
- Interactive heatmap generation from live OSM building data
- Route optimization and bin-placement coverage simulation on any city area

## Tech Stack
React + Vite (client) · Node/Express + SQLite (server) · Python FastAPI +
XGBoost + YOLOv8n + OR-Tools (ml-service) · Leaflet/OpenStreetMap
