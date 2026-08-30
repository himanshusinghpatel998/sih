const express = require('express');
const {
  createIncident,
  listIncidents,
  assignIncident,
  completeIncident,
} = require('../controllers/incidentController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const router = express.Router();

router.route('/')
  .get(protect, listIncidents)
  .post(protect, upload.single('image'), createIncident);

router.put('/:id/assign', protect, assignIncident);
router.post('/:id/complete', protect, upload.single('completionImage'), completeIncident);

module.exports = router;
