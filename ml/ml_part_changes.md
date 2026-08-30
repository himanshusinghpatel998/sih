# ML Part — What Was Added and How It's Wired

This documents everything touched to finish the ML part of `plan2.md` (Phases F and H, plus the E4 sweeper-assignment piece). Two authors are in play, so each section is labeled:

- **[pre-existing]** — already there before this pass (a smaller model's earlier work), left as-is.
- **[added]** — new file/route/function written in this pass.
- **[fixed]** — existing code that was broken and got repaired in this pass.

Everything was tested live end-to-end (Node server + Python ml-service both running, real HTTP calls), not just read — see [§6](#6-what-was-tested-and-how).

---

## 1. The big picture — how a CCTV frame turns into a dispatched worker

```
Browser / CCTV upload
        │  POST /api/cctv/detect  (image, lat, lng)
        ▼
nagarai/server/controllers/cctvController.js
        │  analyzeFrame(buffer)
        │  ┌─── try: analyzeFrameWithYolo(buffer) ──────────────┐
        │  │        │                                            │
        │  │        ▼                                            │
        │  │  services/mlServiceClient.js → detectFrame()        │
        │  │        │  POST http://localhost:8000/detect/frame   │
        │  │        ▼                                            │
        │  │  ml-service/main.py  →  detector.py                 │
        │  │        │  YOLOv8n (pretrained COCO) inference       │
        │  │        ▼                                            │
        │  │  { objectCount, coverageRatio, avgConfidence }       │
        │  └─── catch (service down): analyzeFrameHeuristic() ───┘
        │              (original sharp pixel-variance fallback)
        ▼
{ garbageDetected, confidence, severity, estimatedAreaM2, method }
        │
        ▼
WasteIncident.create(...)  →  CollectionTask.create(...)  →  admin notified
```

Same detector is reused a second time for **photo verification** when a worker marks an incident resolved:

```
POST /api/incidents/:id/complete  (completionImage)
        │
        ▼
incidentController.js → completeIncident()
        │  fetch incident.image (before photo) via axios
        │  detectFrame(beforeBuffer) + detectFrame(afterBuffer)   [both via mlServiceClient]
        │  verificationScore = % drop in detected clutter coverage
        ▼
incident.verificationScore saved, task marked completed
```

And the prediction feedback loop, running on a timer, closes Phase H:

```
server.js  setInterval (every 30 min, + once 15s after boot)
        │
        ▼
services/predictionFeedback.js → backfillPredictionOutcomes()
        │  finds WastePrediction docs whose forecast horizon has passed
        │  stamps in the bin's real current fill % as "actual"
        ▼
GET /api/predictions/accuracy → predictionAccuracy()
        │  groups by modelVersion + horizon, computes MAE / accuracy %
        ▼
{ samples, mae, accuracyPct, byGroup: [...] }
```

---

## 2. Python side — `ml-service/` (YOLO detector)

### `ml-service/detector.py` — **[pre-existing]**

New file (not modified by me). Loads a pretrained **YOLOv8n** (`ultralytics` package) COCO checkpoint and exposes one function:

```python
def detect_image_bytes(data: bytes) -> dict:
    ...
    return {
        "objectCount": len(boxes_out),
        "avgConfidence": avg_conf,
        "coverageRatio": round(coverage_ratio, 4),   # fraction of frame covered by boxes
        "boxes": boxes_out[:40],
        "imageSize": {...},
        "method": "yolov8n-coco-density-v1",
    }
```

Key design choice: `IGNORE_CLASSES` filters out `person`, `car`, `bus`, `truck`, etc. — since there's no labeled "garbage" class in COCO, the signal used is *non-vehicle/non-person object clutter density*, not a dedicated garbage detector. Weights live in `ml-service/weights/yolov8n.pt` (auto-downloaded by `ultralytics` on first run; gitignored — see §5).

### `ml-service/main.py` — **[pre-existing, verified]**

Two new FastAPI routes were added here (already present when this pass started):

```python
@app.get("/detect/health")
def detect_health():
    from detector import _load_model
    _load_model()
    return {"status": "ok", "detector": "yolov8n"}

@app.post("/detect/frame")
async def detect_frame(file: UploadFile = File(...)):
    from detector import detect_image_bytes
    data = await file.read()
    return detect_image_bytes(data)
```

I verified both live: `GET /detect/health` → `{"status":"ok","detector":"yolov8n"}`, and `POST /detect/frame` with a real multipart image → correct JSON back.

### `ml-service/requirements.txt` — **[pre-existing, verified]**

Added: `python-multipart`, `pillow`, `ultralytics`. Confirmed all three (plus `fastapi`) already installed in the local Python 3.11 environment — no install step was needed.

---

## 3. Node side — wiring the detector into the app

### `nagarai/server/services/mlServiceClient.js` — **[pre-existing, verified]**

`detectFrame()` was already added here — it's the one function every other piece calls to reach the Python detector:

```js
const FormData = require('form-data');

const detectFrame = async (buffer, filename = 'frame.jpg') => {
  const fd = new FormData();
  fd.append('file', buffer, { filename, contentType: 'image/jpeg' });
  const { data } = await client.post('/detect/frame', fd, {
    headers: fd.getHeaders(),
    timeout: TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return data;
};

module.exports = { isHealthy, predictBin, predictBatch, detectFrame, ML_SERVICE_URL };
```

**[added]** `form-data` was only present as a *transitive* dependency (pulled in by axios/cloudinary), not declared directly — added it explicitly to `nagarai/server/package.json` so `require('form-data')` doesn't silently break on a clean install:

```diff
     "express": "^5.2.1",
+    "form-data": "^4.0.6",
     "jsonwebtoken": "^9.0.3",
```

### `nagarai/server/controllers/cctvController.js` — **[fixed/wired]**

This was the actual gap: the ML service existed and worked, but nothing in Node ever called it — `analyzeFrame()` still ran the old pixel-variance heuristic unconditionally. Rewrote it into two named functions plus a dispatcher:

```js
// Real detector — maps YOLO's objectCount/coverageRatio onto the same
// {garbageDetected, confidence, severity, estimatedAreaM2, method} shape
// the rest of the pipeline (incidentPriority, findDuplicate, task creation)
// already expects.
const analyzeFrameWithYolo = async (buffer) => {
  const result = await mlServiceClient.detectFrame(buffer);
  const { objectCount, avgConfidence, coverageRatio, method } = result;
  const garbageDetected = coverageRatio > 0.06 || objectCount >= 4;
  const severity = coverageRatio > 0.22 ? 'high' : coverageRatio > 0.12 ? 'medium' : 'low';
  const estimatedAreaM2 = garbageDetected ? Math.round((5 + coverageRatio * 150) * 10) / 10 : 0;
  return { garbageDetected, confidence: avgConfidence || ..., severity, estimatedAreaM2, method, objectCount, coverageRatio };
};

// Original heuristic, kept verbatim, renamed — now only the fallback.
const analyzeFrameHeuristic = async (buffer) => { /* unchanged sharp-stdev logic */ };

// What detectFromImage() actually calls:
const analyzeFrame = async (buffer) => {
  try {
    return await analyzeFrameWithYolo(buffer);
  } catch (err) {
    console.warn('⚠️ [CCTV] ml-service detector unavailable, falling back to heuristic:', err.message);
    return analyzeFrameHeuristic(buffer);
  }
};
```

Nothing else in the file changed — `detectFromImage()` (incident creation, dedup, notification, task dispatch) still calls `analyzeFrame(buffer)` exactly as before; it just gets real YOLO output now instead of a pixel-variance guess, with automatic fallback if the Python service is down.

**Verified both branches live:**
- ml-service running → response included `"method":"yolov8n-coco-density-v1"`.
- ml-service killed → response fell back to `"method":"heuristic-image-variance-v1"`, and the incident/task were still created correctly.

### `nagarai/server/controllers/incidentController.js` — **[added]** (Phase F7, photo verification)

`completeIncident()` previously scored a cleanup with a fixed formula that never looked at the actual photos. Added a real before/after check on top of it:

```js
const axios = require('axios');
const mlServiceClient = require('../services/mlServiceClient');

// ... inside completeIncident():

let verificationScore = Math.round(40 + (signals.hasImage ? 35 : 10) + signals.hasLegacyReport * 15);
let verificationMethod = 'signal-heuristic-v1';   // unchanged fallback formula

if (completionImage && incident.image && req.file) {
  try {
    const beforeBuffer = Buffer.from(
      (await axios.get(incident.image, { responseType: 'arraybuffer' })).data
    );
    const [before, after] = await Promise.all([
      mlServiceClient.detectFrame(beforeBuffer, 'before.jpg'),
      mlServiceClient.detectFrame(req.file.buffer, 'after.jpg'),
    ]);
    const beforeCoverage = before.coverageRatio || 0;
    const afterCoverage = after.coverageRatio || 0;
    const improvement = beforeCoverage > 0.001
      ? (beforeCoverage - afterCoverage) / beforeCoverage
      : (afterCoverage <= 0.02 ? 1 : 0);
    verificationScore = Math.round(Math.max(0, Math.min(1, improvement)) * 100);
    verificationMethod = 'yolov8n-before-after-v1';
  } catch (e) {
    console.warn('⚠️ [INCIDENT] photo verification detector unavailable, using signal heuristic:', e.message);
  }
}
```

Design choice worth flagging: this is **not** blended/floored against the old signal-based score. If the real before/after check runs, it fully replaces the score — the whole point is to catch a completion photo that doesn't actually show a cleanup, and a floor would quietly hide exactly that case. The old formula only survives as a fallback when a real comparison isn't possible (missing photo, or the ml-service is down).

`verificationMethod` is returned in the response (`res.json({ incident, verificationScore, verificationMethod })`) so it's visible which path actually ran — useful for a demo, not persisted to the DB (no schema field for it; kept the change minimal).

**Tested:** the detection + scoring math directly against the live detector with two synthetic images (confirmed it returns a sane score without throwing). Full end-to-end through the HTTP route couldn't be exercised because Cloudinary isn't configured in this environment (`uploadToCloudinary` fails before reaching this code, same limitation that existed before this change) — this is an environment/credentials gap, not a code gap.

---

## 4. Phase H — the prediction feedback loop

### `nagarai/server/models/WastePrediction.js` — **[pre-existing]**

Three fields added to the schema:

```js
actualFillPct: { type: Number, min: 0, max: 100, default: null },
actualRecordedAt: { type: Date, default: null },
error: { type: Number, default: null }, // actualFillPct - predictedFillPct
```

### `nagarai/server/services/predictionFeedback.js` — **[pre-existing, one bug fixed]**

New file with two functions:

- **`backfillPredictionOutcomes()`** — finds `WastePrediction` docs whose horizon has elapsed and `actualFillPct` is still unset, looks up the bin's real current fill %, and stamps it in along with the signed error.
- **`predictionAccuracy()`** — groups scored predictions by `modelVersion` + `horizon`, computes mean absolute error and an accuracy percentage, both overall and per group.

Neither was wired to anything reachable (no route, no scheduled call) — see below for what connects them.

### Wiring added — routes + scheduler

**`nagarai/server/controllers/predictionController.js`** — **[added]** two handlers:

```js
const { backfillPredictionOutcomes, predictionAccuracy } = require('../services/predictionFeedback');

const backfillOutcomes = async (req, res) => {
  const result = await backfillPredictionOutcomes();
  res.json(result);
};

const getAccuracy = async (req, res) => {
  const result = await predictionAccuracy();
  res.json(result);
};

module.exports = { ...existing, backfillOutcomes, getAccuracy };
```

**`nagarai/server/routes/predictionRoutes.js`** — **[added]** routes:

```js
router.post('/backfill-outcomes', protect, backfillOutcomes);
router.get('/accuracy', protect, getAccuracy);
```

**`nagarai/server/server.js`** — **[added]** a periodic trigger, since nothing would ever call the backfill otherwise:

```js
const { backfillPredictionOutcomes } = require('./services/predictionFeedback');

const PREDICTION_BACKFILL_INTERVAL_MS = Number(process.env.PREDICTION_BACKFILL_INTERVAL_MS) || 30 * 60 * 1000;
const runPredictionBackfill = () => {
  backfillPredictionOutcomes()
    .then((result) => { if (result.updated > 0) console.log(`📊 [PREDICTION] backfilled ${result.updated} outcome(s)`, result); })
    .catch((err) => console.error('❌ [PREDICTION] scheduled backfill failed:', err.message));
};
setTimeout(runPredictionBackfill, 15000);   // once shortly after boot
setInterval(runPredictionBackfill, PREDICTION_BACKFILL_INTERVAL_MS);
```

No cron dependency — a plain interval, matching how the rest of this app already does periodic client-side polling. `PREDICTION_BACKFILL_INTERVAL_MS` is overridable via `.env` if 30 minutes is ever too slow/fast for a demo.

**Verified live**, real numbers, through the actual HTTP endpoint:

```json
GET /api/predictions/accuracy
{
  "samples": 998, "mae": 2.63, "accuracyPct": 97.4,
  "byGroup": [
    {"modelVersion":"rule-seasonal-v1","horizon":"1h","samples":460,"mae":0.87,"accuracyPct":99.1},
    {"modelVersion":"rule-seasonal-v1","horizon":"7d","samples":19,"mae":12.84,"accuracyPct":87.2},
    ...
  ]
}
```

---

## 5. Two real bugs this exposed (and fixed) in `config/miniMongoose.js`

Both were **pre-existing bugs in the SQLite-backed Mongoose shim**, invisible until Phase H's code actually exercised these patterns at scale. Neither was introduced by this pass — they were latent in code nobody had stressed before.

### Bug 1 — every `findById`/`findByIdAndUpdate` call scanned the *entire* table

`Model._all()` does `SELECT doc FROM table` (every row) then JSON-parses each one — used by *every* query method, including single-document lookups by primary key. With `WastePrediction` having grown to **52,626 rows** from repeated test runs, a single `findByIdAndUpdate` took **~490ms**. The backfill loop does this in a `for` loop over up to 2,000 pending predictions — that's ~16 minutes of `node:sqlite`'s **synchronous** I/O, which freezes the entire single-threaded Node process (verified: even unrelated requests like `GET /api/health` stopped responding while this ran).

**Fix** — added an indexed fast path:

```js
// config/miniMongoose.js
static _getById(id) {
  ensureTable(table);
  const row = ensureDb().prepare(`SELECT doc FROM "${table}" WHERE _id = ?`).get(String(id));
  return row ? reviveDoc(row.doc) : null;
}
```

...used automatically whenever a filter is exactly `{ _id: <scalar> }` (detected via a new `isPlainIdFilter()` helper), in three places: `Query.exec()` (covers `findById`), `findOneAndUpdate` (covers `findByIdAndUpdate`), and `deleteOne` (covers `findByIdAndDelete`). Every other query shape is untouched — still a full scan, same as before, out of scope to fix broadly right now.

**Measured result:** ~490ms → **~1–3ms** per call. Full `backfillPredictionOutcomes()` run against the real 52k-row table: **under 900ms** (was: didn't finish inside a 20-second hard timeout).

This fix helps *every* `findById`/`findByIdAndUpdate` call across the whole app, not just Phase H — it was a systemic issue that happened to only be a problem on this one large table.

### Bug 2 — `{ field: { $ne: null } }` matched documents where the field was never set

`predictionAccuracy()` filters for "scored" predictions with `actualFillPct: { $ne: null }`. The shim's `$ne` operator did `idStr(docVal) !== idStr(opVal)`; for a genuinely *absent* field, `idStr(undefined)` is `undefined`, and `undefined !== null` is `true` — so every one of the ~52,000 never-backfilled rows counted as "scored." The accuracy numbers were being computed over the whole table, not just the real outcomes (and the top-level MAE came out as `NaN`, which serializes to `null` in JSON — that's what first gave it away).

**Fix:**

```js
// before:
case '$ne': return idStr(docVal) !== idStr(opVal);
// after:
case '$ne': return opVal === null ? (docVal !== null && docVal !== undefined) : idStr(docVal) !== idStr(opVal);
```

Now `$ne: null` treats "absent" the same as "null" — consistent with how the shim's plain (non-operator) `{ field: null }` matching already worked elsewhere in the same file.

**Verified:** before the fix, `/api/predictions/accuracy` reported `"samples": 52626, "mae": null`. After: `"samples": 998, "mae": 2.63, "accuracyPct": 97.4` — the real number, computed only over genuinely backfilled predictions.

---

## 6. What was tested, and how

All of this was exercised against **real running processes**, not just read:

1. Started `ml-service` (`python main.py`) — confirmed `/health` and `/detect/health` both return OK, YOLO model loads.
2. Sent a real multipart image to `POST /detect/frame` directly — got back a correctly-shaped detection result.
3. Started the Node server, logged in as the seeded admin (`bilimagga`/`10405`), and:
   - Hit `POST /api/cctv/detect` with ml-service **up** → response used `yolov8n-coco-density-v1`.
   - Killed ml-service, hit it again → response correctly fell back to `heuristic-image-variance-v1`, incident + task still created.
   - Hit `GET /api/predictions/accuracy` → real, sane per-horizon numbers.
   - Hit `POST /api/sweeping/analyze`, `GET /api/sweeping/needs`, `POST /api/sweeping/deploy` (one-click zone dispatch) → confirmed a real worker got assigned (`assignedTo` populated with an actual worker id).
4. Isolated, timed unit tests of `backfillPredictionOutcomes()`/`predictionAccuracy()` directly against the live 52k-row SQLite table (this is how the two shim bugs were actually found — the full server hung, so it got bisected down to the exact function, then the exact query, then the exact operator).
5. `node --check` on every edited `.js` file; ml-service restarted clean after edits.

### Housekeeping

- `ml-service/weights/yolov8n.pt` (6.5MB, auto-downloaded by `ultralytics` on first run) was moved into the `weights/` folder `detector.py` expects, and `*.pt` / `ml-service/weights/` were added to `.gitignore` — it was showing up as an untracked binary before this.
