const { generateSweepingPlan } = require('../services/sweeping');
const { runSweepingAnalysis } = require('../services/sweepingEngine');
const { Zone, Landmark, Event, SweepingNeed } = require('../models');

// Pick a dominant road type per zone from its landmark mix (heuristic).
const inferRoadType = (landmarks) => {
  const counts = {};
  for (const l of landmarks) counts[l.type] = (counts[l.type] || 0) + 1;
  if (counts.food_street || counts.restaurant || counts.cafe) return 'food_street';
  if (counts.market) return 'market';
  if (counts.mall || counts.office || counts.college || counts.railway_station || counts.bus_station) return 'main';
  if (counts.tourist_attraction) return 'park';
  return 'residential';
};

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
      byZoneRoadType[String(z._id)] = inferRoadType(landmarks.filter((l) => String(l.zone) === String(z._id)));
    }

    const needs = await runSweepingAnalysis({
      zones,
      landmarks,
      weather,
      RoadTypeMap: { byZone: byZoneRoadType, eventsByZone },
    });

    await SweepingNeed.deleteMany({});
    const docs = await SweepingNeed.insertMany(needs);

    res.json({ count: docs.length, needs: docs });
  } catch (err) {
    console.error('❌ [SWEEPING] analyze error:', err.message);
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
    console.error('❌ [SWEEPING] plan error:', err.message);
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
    console.error('❌ [SWEEPING] deploy error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getSweepingPlan, deploySweeping, analyzeSweepingNeeds, getSweepingNeeds };