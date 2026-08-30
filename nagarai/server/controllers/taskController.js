const { CollectionTask, Worker, User } = require('../models');
const WasteIncident = require('../models/WasteIncident');

// Resolve a worker's userId to their Worker profile (for zone/workload)
const resolveWorker = async (req) => {
  const worker = await Worker.findOne({ userId: req.user._id });
  if (worker) req.user.workerProfile = worker;
  return worker;
};

// @desc  List collection tasks (role-aware)
// @route GET /api/tasks
const listTasks = async (req, res) => {
  try {
    const { status, zone } = req.query;
    const query = {};
    if (status) query.status = status;
    if (zone) query.zone = zone;

    if (req.user.role === 'worker') {
      await resolveWorker(req);
      if (req.user.workerProfile) query.zone = req.user.workerProfile.zone;
      else query.assignedTo = req.user._id;
    } else if (req.user.role === 'collector') {
      query.zone = req.user.zone || null;
    }

    const tasks = await CollectionTask.find(query)
      .populate('zone', 'name code')
      .populate('bin', 'binId capacityL location')
      .populate('incident')
      .populate('vehicle', 'vehicleId name')
      .populate('assignedTo', 'userId ')
      .sort({ priority: -1, createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Update task status
// @route PUT /api/tasks/:id/status
const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const task = await CollectionTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const allowed = ['pending', 'assigned', 'in-progress', 'completed', 'unresolved', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    task.status = status;
    await task.save();

    // If the task tracks an incident, keep them in sync
    if (task.incident) {
      const incMap = {
        'in-progress': 'in-progress',
        completed: 'resolved',
        unresolved: 'open',
        cancelled: 'rejected',
      };
      if (incMap[status]) {
        await WasteIncident.findByIdAndUpdate(task.incident, { status: incMap[status] });
      }
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { listTasks, updateTaskStatus };
