const express = require('express');
const { runPredictions, getPredictions, backfillOutcomes, getAccuracy } = require('../controllers/predictionController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Run the prediction engine across all bins and persist results
router.post('/run', protect, runPredictions);

// Get latest persisted predictions
router.get('/', protect, getPredictions);

// Phase H — feedback loop
router.post('/backfill-outcomes', protect, backfillOutcomes);
router.get('/accuracy', protect, getAccuracy);

module.exports = router;
