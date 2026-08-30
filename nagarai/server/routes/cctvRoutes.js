const express = require('express');
const { detectFromImage, detectCrowdFromImage } = require('../controllers/cctvController');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/detect', protect, upload.single('image'), detectFromImage);
router.post('/detect-crowd', protect, upload.single('image'), detectCrowdFromImage);

module.exports = router;
