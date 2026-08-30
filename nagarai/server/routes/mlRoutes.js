const express = require('express');
const { generate, trainEndpoint, status } = require('../controllers/mlController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/status', protect, status);
router.post('/generate', protect, generate);
router.post('/train', protect, trainEndpoint);

module.exports = router;
