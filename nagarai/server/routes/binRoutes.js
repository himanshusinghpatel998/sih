const express = require('express');
const { optimizeBins, getRecommendations, listBins, getMlRecommendations } = require('../controllers/binController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, listBins);
router.get('/recommendations', protect, getRecommendations);
router.get('/ml-recommendations', protect, getMlRecommendations);
router.post('/optimize', protect, optimizeBins);

module.exports = router;
