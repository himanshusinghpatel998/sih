const { generateSweepingPlan } = require('../services/sweeping');
const { runSweepingAnalysis } = require('../services/sweepingEngine');
const { Zone, Landmark, Event, SweepingNeed } = require('../models');

// Real bin-dataset zones (imported from ml/bins_master.csv) carry their
// actual zone_type — prefer that directly over guessing from landmark
// counts, which flattens out once every zone has at least a few restaurant
// landmarks (a baseline "nearby restaurants" count exists everywhere in the
// real data, not just food-street zones, so a landmark-count-only heuristic
// classified every zone as food_street).
const ZONE_TYPE_TO_ROAD_TYPE = {
  market: 'market',
  commercial: 'main',
  tourist: 'main',
  mixed_use: 'main',
  institutional: 'main',
  residential_high: 'residential',
  residential_low: 'residential',
  industrial: 'highway',
};

// Fallback for zones with no known zone_type (e.g. the old mock seed) —
// pick a dominant road type from its landmark mix.
const inferRoadTypeFromLandmarks = (landmarks) => {
  const counts = {};
  for (const l of landmarks) counts[l.type] = (counts[l.type] || 0) + 1;
  if (counts.food_street || counts.cafe) return 'food_street';
  if (counts.market) return 'market';
  if (counts.mall || counts.office || counts.college || counts.railway_station || counts.bus_station) return 'main';
  if (counts.restaurant) return 'food_street';
  if (counts.tourist_attraction) return 'park';
  return 'residential';
};

const inferRoadType = (zone, landmarks) =>
  (zone.zoneType && ZONE_TYPE_TO_ROAD_TYPE[zone.zoneType]) || inferRoadTypeFromLandmarks(landmarks);

// @desc  Run the Predictive Sweeping engine (dirt score + frequency per zone), persist + return
// @route POST /api/sweeping/analyze
const analyzeSweepingNeeds = async (req, res) => {
  try {
    const { weather = 'clear' } = req.body || {};
    const [zones, landmarks, events] = await Promise.all([
      Zone.find().lean(),
      Landmark.find().lean(),
      Event.find({ status: { $in: ['upcoming', 'active'] } }).lean(),
    ]);

    const eventsByZone = {};
    for (const ev of events) if (ev.zone) eventsByZone[String(ev.zone)] = ev.wasteMultiplier || ev.expectedImpactMultiplier || 2;

    const byZoneRoadType = {};
    for (const z of zones) {
      byZoneRoadType[String(z._id)] = inferRoadType(z, landmarks.filter((l) => String(l.zone) === String(z._id)));
    }

    const needs = await runSweepingAnalysis({
      zones,
      landmarks,
      weather,
      RoadTypeMap: { byZone: byZoneRoadType, eventsByZone },
    });

    await SweepingNeed.deleteMany({});
    await SweepingNeed.insertMany(needs);
    // insertMany returns unpopulated docs (zone as a bare id) — re-fetch
    // populated so the response matches GET /api/sweeping/needs's shape.
    const docs = await SweepingNeed.find().sort({ priority: -1 }).populate('zone', 'code name');

    res.json({ count: docs.length, needs: docs });
  } catch (err) {
    console.error(' [SWEEPING] analyze error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Get the latest persisted sweeping recommendations
// @route GET /api/sweeping/needs
const getSweepingNeeds = async (req, res) => {
  try {
    const needs = await SweepingNeed.find().sort({ priority: -1 }).populate('zone', 'code name');
    res.json(needs);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Generate sweeping plan (preview only)
// @route POST /api/sweeping/plan
const getSweepingPlan = async (req, res) => {
  try {
    const plan = await generateSweepingPlan({ createTasks: false });
    res.json(plan);
  } catch (err) {
    console.error(' [SWEEPING] plan error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Generate sweeping plan AND create tasks
// @route POST /api/sweeping/deploy
const deploySweeping = async (req, res) => {
  try {
    const plan = await generateSweepingPlan({ createTasks: true });
    res.json(plan);
  } catch (err) {
    console.error(' [SWEEPING] deploy error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getSweepingPlan, deploySweeping, analyzeSweepingNeeds, getSweepingNeeds };