const { Bin, Zone, Landmark, BinRecommendation } = require('../models');
const { evaluateLocation } = require('../services/binOptimizer');
const { haversineM } = require('../services/geo');

const buildZoneContext = (zone, landmarks) => {
  const near = landmarks.filter((l) => String(l.zone) === String(zone._id));
  return {
    ...zone,
    nearbyFood: near.filter((l) =>
      ['restaurant', 'food_street', 'cafe', 'market', 'mall'].includes(l.type)
    ).length,
  };
};

// @desc  Run bin placement/capacity optimization for all zones
// @route POST /api/bins/optimize
const optimizeBins = async (req, res) => {
  try {
    const [zones, bins, landmarks] = await Promise.all([
      Zone.find().lean(),
      Bin.find().lean(),
      Landmark.find().lean(),
    ]);

    const results = [];

    for (const zone of zones) {
      const zoneCtx = buildZoneContext(zone, landmarks);
      const zoneBins = bins.filter((b) => String(b.zone) === String(zone._id));
      const zoneLandmarks = landmarks.filter((l) => String(l.zone) === String(zone._id));

      // Candidate locations: the zone center + each landmark in the zone
      const candidates = [];
      candidates.push({
        location: zoneCtx.center,
        label: `${zoneCtx.name} (center)`,
        predictedKgDay: (zoneCtx.footfall || 0) * 0.12,
        overflowEvents: zoneBins.reduce((s, b) => s + (b.overflowCount || 0), 0),
      });
      for (const lm of zoneLandmarks) {
        candidates.push({
          location: lm.location,
          label: `${zoneCtx.name} — ${lm.name}`,
          predictedKgDay: (lm.estimatedDailyVisitors || 300) * 0.15 + (zoneCtx.footfall || 0) * 0.05,
          overflowEvents: zoneBins.reduce((s, b) => s + (b.overflowCount || 0), 0),
        });
      }

      for (const cand of candidates) {
        // Is there an existing bin very close (within ~60m)?
        let existingBin = null;
        for (const b of zoneBins) {
          if (!b.location) continue;
          if (haversineM(cand.location, b.location) <= 60) {
            existingBin = b;
            break;
          }
        }

        const evalResult = evaluateLocation({
          location: cand.location,
          zone: zoneCtx,
          nearbyFood: zoneCtx.nearbyFood,
          predictedKgDay: cand.predictedKgDay,
          overflowEvents: cand.overflowEvents,
          bins: zoneBins.map((b) => ({ location: b.location })),
          existingBin,
        });

        results.push({ ...evalResult, label: cand.label });
      }
    }

    // Persist recommendations (clear previous run first for idempotency)
    await BinRecommendation.deleteMany({});
    const docs = results
      .filter((r) => r.action !== 'no_action')
      .map((r) => ({
        zone: r.zone ? r.zone : null,
        location: r.location,
        action: r.action,
        existingBin: r.existingBinId ? null : null, // id referenced below if needed
        recommendedCapacityL: r.recommendedCapacityL,
        predictedDemandLDay: r.predictedLDay,
        currentCoverage: r.coverage,
        reason: r.reason,
        priority: r.priority,
      }));
    // Attach existingBin id where applicable
    for (let i = 0; i < docs.length; i++) {
      const src = results.filter((r) => r.action !== 'no_action')[i];
      if (src && src.existingBinId) {
        const bin = bins.find((b) => b.binId === src.existingBinId);
        docs[i].existingBin = bin ? bin._id : null;
      }
    }
    if (docs.length) await BinRecommendation.insertMany(docs);

    // Sort: no_action last
    results.sort((a, b) => (a.action === 'no_action' ? 1 : 0) - (b.action === 'no_action' ? 1 : 0) || b.priority - a.priority);
    res.json({ count: results.length, results });
  } catch (err) {
    console.error(' [BINS] optimize error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Get saved bin recommendations
// @route GET /api/bins/recommendations
const getRecommendations = async (req, res) => {
  try {
    const recs = await BinRecommendation.find()
      .populate('zone', 'name code')
      .populate('existingBin', 'binId capacityL location')
      .sort({ priority: -1 });
    res.json(recs);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  List all bins (with zone)
// @route GET /api/bins
const listBins = async (req, res) => {
  try {
    const bins = await Bin.find().populate('zone', 'name code').sort({ binId: 1 });
    res.json(bins);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { optimizeBins, getRecommendations, listBins };
