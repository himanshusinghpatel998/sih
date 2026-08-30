const { Bin, Zone } = require('../models');
const { simulate } = require('../services/simulator');

// @desc  Run what-if simulation
// @route POST /api/simulate
const runSimulation = async (req, res) => {
  try {
    const {
      eventType,
      expectedAttendance,
      weather = 'clear',
      zones,
      hours = 48,
      collectionFrequencyHrs = 0,
    } = req.body || {};

    const [bins, zoneDocs] = await Promise.all([
      Bin.find({ active: { $ne: false } }).lean(),
      Zone.find().lean(),
    ]);

    const zoneIdsByCode = {};
    zoneDocs.forEach((z) => { zoneIdsByCode[z.code] = z._id; });

    const result = await simulate({
      bins,
      zones: zoneDocs,
      zoneIdsByCode,
      scenario: { eventType, expectedAttendance, weather, zones, hours, collectionFrequencyHrs },
    });

    res.json(result);
  } catch (err) {
    console.error(' [SIMULATOR] error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { runSimulation };