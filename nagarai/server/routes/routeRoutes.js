const express = require('express');
const {
  generateRoutes,
  deployRoutes,
  reroute,
  workforce,
} = require('../controllers/routeController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/generate', protect, generateRoutes);
router.post('/deploy', protect, deployRoutes);
router.post('/reroute', protect, reroute);
router.get('/workforce', protect, workforce);

module.exports = router;
