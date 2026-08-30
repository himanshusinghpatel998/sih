const express = require('express');
const { getPublicStats } = require('../controllers/publicController');

const router = express.Router();

router.get('/stats', getPublicStats);

module.exports = router;
