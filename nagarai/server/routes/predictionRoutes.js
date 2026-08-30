const express = require('express');
const { runPredictions, getPredictions } = require('../controllers/predictionController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Run the prediction engine across all bins and persist results
router.post('/run', protect, runPredictions);

// Get latest persisted predictions
router.get('/', protect, getPredictions);

module.exports = router;
