const { Bin, Zone, Event, Landmark, WastePrediction, WasteIncident } = require('../models');
const { predictBin, predictAllBins } = require('../services/predictionEngine');
const mlServiceClient = require('../services/mlServiceClient');
const { backfillPredictionOutcomes, predictionAccuracy } = require('../services/predictionFeedback');

// Convert the ml-service's response shape into the same shape predictBin()
// (rule engine) produces, so downstream persistence/consumers don't care
// which strategy generated a given bin's prediction.
const realModelToEngineShape = (bin, real, zone) => {
  const capacityL = bin.capacityL || 240;
  const toKg = (pct) => (pct / 100) * capacityL;
  const horizons = {};
  for (const [h, pct] of Object.entries(real.horizons || {})) {
    horizons[h] = { predictedFillPct: pct, predictedKg: Math.round(toKg(pct) * 100) / 100 };
  }
  // Extend the model's native horizons (1h/6h/12h/24h) with 48h/7d so the
  // shape matches the rule engine's HORIZONS_HOURS — derived by continuing
  // the same next-day slope, clamped to [0, 100] (a declining slope — e.g.
  // the model predicting a post-collection drop — extrapolated forward can
  // otherwise go negative, which isn't a meaningful fill percentage).
  const clampPct = (v) => Math.max(0, Math.min(100, Math.round(v * 100) / 100));
  const dailyDelta = real.fillPctNextDay - real.currentFillPct;
  horizons['48h'] = { predictedFillPct: clampPct(real.fillPctNextDay + dailyDelta) };
  horizons['48h'].predictedKg = Math.round(toKg(horizons['48h'].predictedFillPct) * 100) / 100;
  horizons['7d'] = { predictedFillPct: clampPct(real.fillPctNextDay + dailyDelta * 6) };
  horizons['7d'].predictedKg = Math.round(toKg(horizons['7d'].predictedFillPct) * 100) / 100;

  const riskScore = Math.round(real.overflowRisk * 100);
  return {
    binId: real.binId,
    zone: zone ? zone.code : null,
    currentLevel: real.currentFillPct,
    predictions: horizons,
    overflowAt: null,
    overflowRisk: riskScore,
    riskScore,
    status: real.currentFillPct >= 70 ? 'red' : real.currentFillPct <= 20 ? 'green' : 'yellow',
    contributors: [`cluster:${real.clusterId}`, 'xgboost-fill-model', 'xgboost-overflow-model'],
    modelVersion: real.modelVersion,
    strategy: 'xgboost-live',
  };
};

// Load zone context with landmark-derived counts (restaurants/markets nearby)
const loadZoneContext = async () => {
  const zones = await Zone.find().lean();
  const landmarks = await Landmark.find().lean();
  const zonesById = {};
  for (const z of zones) {
    const near = landmarks.filter((l) => {
      if (!l.zone) return false;
      return String(l.zone) === String(z._id);
    });
    zonesById[String(z._id)] = {
      ...z,
      nearbyRestaurants: near.filter((l) => ['restaurant', 'food_street', 'cafe'].includes(l.type)).length,
      nearbyMarkets: near.filter((l) => ['market', 'mall'].includes(l.type)).length,
    };
  }
  return { zones, zonesById };
};

const loadActiveEventsByZone = async (date = new Date()) => {
  const events = await Event.find({ status: { $in: ['upcoming', 'active'] } }).lean();
  const byZone = {};
  for (const ev of events) {
    if (ev.zone) byZone[String(ev.zone)] = ev;
  }
  return byZone;
};

// Resolve event for a zone (by zone ObjectId) currently active at `date`
const activeEventForZone = (eventsByZone, zone, date) => {
  if (!zone || !eventsByZone) return null;
  const ev = eventsByZone[String(zone._id)] || eventsByZone[zone.code];
  if (!ev) return null;
  const d = new Date(date).setHours(0, 0, 0, 0);
  const s = new Date(ev.startDate).setHours(0, 0, 0, 0);
  const e = (ev.endDate ? new Date(ev.endDate) : new Date(s)).setHours(0, 0, 0, 0);
  if (d >= s && d <= e) return ev;
  return null;
};

// @desc  Run prediction for all bins, persist, return results
// @route POST /api/predictions/run
const runPredictions = async (req, res) => {
  try {
    const { weather = 'clear' } = req.body || {};
    const bins = await Bin.find().lean();
    const { zones, zonesById } = await loadZoneContext();
    const eventsByZone = await loadActiveEventsByZone();

    const engine = process.env.ML_ENGINE || 'rule';
    let results;
    let usedRealModel = false;

    if (engine === 'xgboost-live' && (await mlServiceClient.isHealthy())) {
      try {
        const overrides = {};
        for (const bin of bins) overrides[bin.binId] = bin.currentLevel;
        const realPredictions = await mlServiceClient.predictBatch(overrides);
        const byBinId = {};
        for (const r of realPredictions) if (!r.error) byBinId[r.binId] = r;

        results = bins.map((bin) => {
          const zone = bin.zone ? zonesById[String(bin.zone)] : null;
          const real = byBinId[bin.binId];
          if (real) return realModelToEngineShape(bin, real, zone);
          // No trained-model coverage for this bin (not in the ml/ dataset) — fall back per-bin
          const event = activeEventForZone(eventsByZone, zone, new Date());
          return predictBin(bin, zone, { weather, eventType: event ? event.type : null });
        });
        usedRealModel = true;
      } catch (err) {
        console.warn('⚠️ [PREDICTION] ml-service call failed, falling back to rule engine:', err.message);
      }
    }

    if (!results) {
      results = bins.map((bin) => {
        const zone = bin.zone ? zonesById[String(bin.zone)] : null;
        const event = activeEventForZone(eventsByZone, zone, new Date());
        return predictBin(bin, zone, { weather, eventType: event ? event.type : null });
      });
    }

    // Persist results
    const docs = [];
    for (const r of results) {
      for (const [horizon, p] of Object.entries(r.predictions)) {
        docs.push({
          targetType: 'bin',
          targetId: r.binId,
          forecastDate: new Date(),
          horizon,
          predictedFillPct: p.predictedFillPct,
          predictedKg: p.predictedKg,
          riskScore: r.riskScore,
          overflowAt: r.overflowAt,
          contributors: r.contributors,
          modelVersion: r.modelVersion,
        });
      }
    }
    await WastePrediction.insertMany(docs);

    res.json({ count: results.length, engine: usedRealModel ? 'xgboost-live' : 'rule', results });
  } catch (err) {
    console.error('❌ [PREDICTION] run error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Get latest persisted predictions (optionally overflow-risk ones)
// @route GET /api/predictions
const getPredictions = async (req, res) => {
  try {
    const { binId, overflowOnly } = req.query;
    const query = {};
    if (binId) query.targetId = binId;
    const docs = await WastePrediction.find(query)
      .sort({ forecastDate: -1 })
      .limit(parseInt(req.query.limit) || 200);

    // Group by target + horizon (latest forecast)
    const latest = {};
    for (const d of docs) {
      const key = `${d.targetType}:${d.targetId}:${d.horizon}`;
      if (!latest[key]) latest[key] = d;
    }
    let grouped = Object.values(latest);
    if (overflowOnly) {
      grouped = grouped.filter((d) => d.horizon === '24h' && d.predictedFillPct >= 85);
    }
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Backfill actual-vs-predicted outcomes for predictions whose horizon has passed
// @route POST /api/predictions/backfill-outcomes
const backfillOutcomes = async (req, res) => {
  try {
    const result = await backfillPredictionOutcomes();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Prediction accuracy (MAE / accuracy %) grouped by model version + horizon
// @route GET /api/predictions/accuracy
const getAccuracy = async (req, res) => {
  try {
    const result = await predictionAccuracy();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { runPredictions, getPredictions, predictBin, loadZoneContext, backfillOutcomes, getAccuracy };
