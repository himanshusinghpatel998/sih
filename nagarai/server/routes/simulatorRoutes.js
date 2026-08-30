const express = require('express');
const { runSimulation } = require('../controllers/simulatorController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, runSimulation);

module.exports = router;