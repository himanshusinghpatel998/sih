const Bin = require('../models/Bin');
const Complaint = require('../models/Complaint');

// Campus block structure is fixed (matches the Complaint/User schema enums and
// the block filters used across the admin/collector dashboards) rather than
// derived from complaint volume, so this stays accurate even before any
// complaints have been filed on a fresh deployment.
const CAMPUS_BLOCKS = ['A', 'B', 'C', 'D', 'E'];

// @desc    Aggregate counts safe to show on the public landing page (no auth, no per-user data)
// @route   GET /api/public/stats
const getPublicStats = async (req, res) => {
  try {
    const [totalBins, resolvedComplaints] = await Promise.all([
      Bin.countDocuments(),
      Complaint.countDocuments({ status: 'completed' }),
    ]);

    res.json({
      bins: totalBins,
      blocks: CAMPUS_BLOCKS.length,
      resolved: resolvedComplaints,
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not load stats', error: err.message });
  }
};

module.exports = { getPublicStats };
