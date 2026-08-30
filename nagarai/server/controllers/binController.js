const { Bin, Zone, Landmark, BinRecommendation } = require('../models');
const { evaluateLocation } = require('../services/binOptimizer');
const { haversineM } = require('../services/geo');
const mlServiceClient = require('../services/mlServiceClient');

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

        results.push({ ...evalResult, label: cand.label, zoneId: zone._id });
      }
    }

    // Persist recommendations (clear previous run first for idempotency)
    await BinRecommendation.deleteMany({});
    const actionable = results.filter((r) => r.action !== 'no_action');
    const docs = actionable.map((r) => ({
      // r.zone is {code,name} (evaluateLocation's own return shape) — not a
      // real reference. r.zoneId (attached above, from the zones loop) is
      // the actual Zone _id, which is what .populate('zone') needs to work.
      zone: r.zoneId || null,
      location: r.location,
      action: r.action,
      existingBin: r.existingBinId ? bins.find((b) => b.binId === r.existingBinId)?._id || null : null,
      recommendedCapacityL: r.recommendedCapacityL,
      predictedDemandLDay: r.predictedLDay,
      currentCoverage: r.coverage,
      reason: r.reason,
      priority: r.priority,
    }));
    if (docs.length) await BinRecommendation.insertMany(docs);

    // Sort: no_action last
    results.sort((a, b) => (a.action === 'no_action' ? 1 : 0) - (b.action === 'no_action' ? 1 : 0) || b.priority - a.priority);
    res.json({ count: results.length, results });
  } catch (err) {
    console.error('❌ [BINS] optimize error:', err.message);
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

// @desc  Bin action recommendations (UPGRADE/ADD_BIN_NEARBY/RELOCATE/REMOVE/KEEP)
//        from the demand-score + recommendation engine in ml/routing/*
//        (distinct from optimizeBins' own JS placement-candidate engine above —
//        this scores existing bins by demand/overflow/festival-sensitivity).
// @route GET /api/bins/ml-recommendations
const getMlRecommendations = async (req, res) => {
  try {
    const [bins, zones] = await Promise.all([Bin.find().lean(), Zone.find().lean()]);
    const zonesById = {};
    for (const z of zones) zonesById[String(z._id)] = z;

    const mlBins = bins.map((b) => {
      const zone = b.zone ? zonesById[String(b.zone)] : null;
      return {
        bin_id: b.binId,
        zone_type: zone ? (zone.commercialDensity > 0.6 ? 'commercial' : zone.residentialDensity > 0.6 ? 'residential_high' : 'mixed_use') : 'residential_low',
        bin_capacity_liters: b.capacityL || 240,
        avg_fill_pct: b.currentLevel != null ? b.currentLevel : 50,
        overflow_rate: b.overflowCount ? Math.min(1, b.overflowCount / 20) : 0,
        latitude: b.location ? b.location.lat : null,
        longitude: b.location ? b.location.lng : null,
      };
    });

    const result = await mlServiceClient.getBinRecommendations(mlBins);
    res.json(result);
  } catch (err) {
    console.error('❌ [BINS] ml-recommendations error:', err.message);
    res.status(502).json({ message: 'ml-service recommendations unavailable (is ml-service running?)', error: err.message });
  }
};

module.exports = { optimizeBins, getRecommendations, listBins, getMlRecommendations };
