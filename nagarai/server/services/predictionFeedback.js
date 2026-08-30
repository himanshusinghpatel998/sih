/**
 * Phase H — Feedback loop.
 *
 * Every prediction WastePrediction persists is a claim ("this bin will be
 * X% full in N hours") that nobody ever checked against reality. This
 * service closes that loop: once a prediction's horizon has passed, it
 * looks up the bin's real current fill % and records it as the outcome, so
 * accuracy can be measured instead of assumed.
 */
const { WastePrediction, Bin } = require('../models');
const { HORIZONS_HOURS } = require('./predictionEngine');

// Find predictions whose forecast horizon has elapsed and hasn't been
// scored yet, stamp in the bin's real current fill % + signed error.
const backfillPredictionOutcomes = async () => {
  const now = Date.now();
  const pending = await WastePrediction.find({ actualFillPct: null }).limit(2000);

  const dueForScoring = pending.filter((p) => {
    const hrs = HORIZONS_HOURS[p.horizon];
    if (hrs == null) return false;
    return new Date(p.forecastDate).getTime() + hrs * 3600000 <= now;
  });

  if (!dueForScoring.length) return { checked: pending.length, updated: 0 };

  const bins = await Bin.find().lean();
  const binsById = {};
  for (const b of bins) binsById[b.binId] = b;

  let updated = 0;
  for (const p of dueForScoring) {
    if (p.targetType !== 'bin') continue;
    const bin = binsById[p.targetId];
    if (!bin || bin.currentLevel == null) continue;

    const actualFillPct = bin.currentLevel;
    await WastePrediction.findByIdAndUpdate(p._id, {
      $set: {
        actualFillPct,
        actualRecordedAt: new Date(),
        error: Math.round((actualFillPct - p.predictedFillPct) * 100) / 100,
      },
    });
    updated += 1;
  }

  return { checked: pending.length, dueForScoring: dueForScoring.length, updated };
};

// Group scored predictions by modelVersion + horizon, compute MAE and an
// accuracy percentage per group and overall.
const predictionAccuracy = async () => {
  const scored = await WastePrediction.find({ actualFillPct: { $ne: null } }).lean();

  if (!scored.length) {
    return { samples: 0, mae: null, accuracyPct: null, byGroup: [] };
  }

  const groups = {};
  for (const p of scored) {
    const key = `${p.modelVersion}::${p.horizon}`;
    (groups[key] = groups[key] || []).push(p);
  }

  const mae = (arr) => arr.reduce((s, p) => s + Math.abs(p.error), 0) / arr.length;

  const byGroup = Object.entries(groups)
    .map(([key, arr]) => {
      const [modelVersion, horizon] = key.split('::');
      const groupMae = Math.round(mae(arr) * 100) / 100;
      return {
        modelVersion,
        horizon,
        samples: arr.length,
        mae: groupMae,
        accuracyPct: Math.max(0, Math.round((100 - groupMae) * 10) / 10),
      };
    })
    .sort((a, b) => b.samples - a.samples);

  const overallMae = Math.round(mae(scored) * 100) / 100;

  return {
    samples: scored.length,
    mae: overallMae,
    accuracyPct: Math.max(0, Math.round((100 - overallMae) * 10) / 10),
    byGroup,
  };
};

module.exports = { backfillPredictionOutcomes, predictionAccuracy };
