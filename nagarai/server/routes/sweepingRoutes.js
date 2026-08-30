const express = require('express');
const { getSweepingPlan, deploySweeping, analyzeSweepingNeeds, getSweepingNeeds } = require('../controllers/sweepingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/plan', protect, getSweepingPlan);
router.post('/deploy', protect, deploySweeping);
router.post('/analyze', protect, analyzeSweepingNeeds);
router.get('/needs', protect, getSweepingNeeds);

module.exports = router;