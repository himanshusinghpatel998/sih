const express = require('express');
const {
  createEvent,
  listEvents,
  getEventImpact,
  updateEvent,
} = require('../controllers/eventController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, listEvents)
  .post(protect, createEvent);

router.get('/:id/impact', protect, getEventImpact);
router.put('/:id', protect, updateEvent);

module.exports = router;
