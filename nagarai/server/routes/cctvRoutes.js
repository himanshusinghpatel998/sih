const express = require('express');
const { detectFromImage } = require('../controllers/cctvController');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/detect', protect, upload.single('image'), detectFromImage);

module.exports = router;
