const express = require('express');
const {
  generateRoutes,
  deployRoutes,
  reroute,
  rerouteMl,
  workforce,
  advanceDayHandler,
} = require('../controllers/routeController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/generate', protect, generateRoutes);
router.post('/deploy', protect, deployRoutes);
router.post('/reroute', protect, reroute);
router.post('/reroute-ml', protect, rerouteMl);
router.post('/advance-day', protect, advanceDayHandler);
router.get('/workforce', protect, workforce);

module.exports = router;
