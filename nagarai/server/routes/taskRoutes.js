const express = require('express');
const { listTasks, updateTaskStatus } = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, listTasks);
router.put('/:id/status', protect, updateTaskStatus);

module.exports = router;
