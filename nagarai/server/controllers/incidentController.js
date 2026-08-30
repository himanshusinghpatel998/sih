const mongoose = require('../config/miniMongoose');
const axios = require('axios');
const { WasteIncident, CollectionTask, User, Bin, Zone, Event } = require('../models');
const { uploadToCloudinary } = require('../middleware/upload');
const { createNotification } = require('./notificationController');
const mlServiceClient = require('../services/mlServiceClient');

// Priority from incident type + extent + recent overflow history
const incidentPriority = ({ type = 'other', extentKg = null, binOverflow = false }) => {
  const typeBase = {
    overflow: 70,
    illegal_dumping: 60,
    garbage_accumulation: 55,
    damaged_bin: 40,
    missing_bin: 45,
    unclean_road: 35,
    road_litter: 30,
    other: 25,
  };
  let p = typeBase[type] != null ? typeBase[type] : typeBase.other;
  if (extentKg != null) p += Math.min(20, extentKg / 25);
  if (binOverflow) p += 10;
  return Math.min(100, Math.round(p));
};

// Deduplicate: reuse an open incident within ~150m of identical/similar type
const findDuplicate = async (incident) => {
  const { location, type } = incident;
  if (!location || location.lat == null) return null;
  const { haversineM } = require('../services/geo');
  // Not .lean() — callers (createIncident, cctvController.detectFromImage)
  // call .save() on the returned doc to bump duplicateCount.
  const open = await WasteIncident.find({
    status: { $in: ['open', 'assigned', 'in-progress'] },
  });
  for (const o of open) {
    if (!o.location || o.location.lat == null) continue;
    const d = haversineM(
      { lat: location.lat, lng: location.lng },
      { lat: o.location.lat, lng: o.location.lng }
    );
    if (d <= 150 && (type === o.type || o.type === 'garbage_accumulation')) {
      return o;
    }
  }
  return null;
};

// @desc  Create an incident (citizen report / CCTV / IOT) with auto-prioritization + dedup
// @route POST /api/incidents
const createIncident = async (req, res) => {
  try {
    const { type = 'other', location, description = '', extentKg, zone, bin } = req.body;

    if (!location || location.lat == null) {
      return res.status(400).json({ message: 'location (lat/lng) is required' });
    }

    const binDoc = bin ? await Bin.findById(bin) : null;
    const incidentId = `INC-${Date.now()}`;

    const incidentData = {
      incidentId,
      source: req.body.source || (req.user.role === 'citizen' ? 'citizen' : 'admin'),
      type,
      zone: zone || (binDoc ? binDoc.zone : null),
      bin: binDoc ? binDoc._id : null,
      location: { lat: location.lat, lng: location.lng, address: location.address || '' },
      description,
      extentKg: extentKg != null ? extentKg : binDoc ? binDoc.currentLevel * binDoc.capacityL * 0.01 : null,
      priority: incidentPriority({ type, extentKg, binOverflow: binDoc ? (binDoc.currentLevel || 0) >= 70 : false }),
      status: 'open',
      reporter: req.user.role === 'citizen' ? req.user._id : null,
      image: req.body.image || null,
    };

    if (req.file) {
      try { incidentData.image = await uploadToCloudinary(req.file, 'nagarai/incidents'); }
      catch (e) { console.error('⚠️ incident image upload failed:', e.message); }
    }

    // Deduplicate
    const dup = await findDuplicate(incidentData);
    if (dup) {
      dup.duplicateCount = (dup.duplicateCount || 0) + 1;
      await dup.save();
      return res.json({ deduplicated: true, original: dup, newIncident: null, message: 'Nearby open incident already exists — counted as duplicate.' });
    }

    const incident = await WasteIncident.create(incidentData);

    // Notify admins
    const admins = await User.find({ role: 'admin' });
    for (const a of admins) {
      await createNotification(a._id, `🚨 New ${type} incident ${incidentId} (priority ${incident.priority})`, 'incident').catch(() => {});
    }

    // Auto-convert to a collection task (closed loop part 1)
    const task = await CollectionTask.create({
      taskId: `TASK-${Date.now()}`,
      type: 'incident-response',
      zone: incident.zone,
      bin: incident.bin,
      incident: incident._id,
      location: incident.location,
      priority: incident.priority,
      status: 'pending',
      dueAt: new Date(Date.now() + 4 * 3600000),
      estimatedWorkMin: 20,
    });
    incident.status = 'assigned';
    incident.task = task._id;
    await incident.save();

    res.status(201).json({ incident, task });
  } catch (err) {
    console.error('❌ [INCIDENT] create error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  List incidents (role-aware)
// @route GET /api/incidents
const listIncidents = async (req, res) => {
  try {
    const { status, zone } = req.query;
    const query = {};
    if (status) query.status = status;
    if (zone) query.zone = zone;

    if (req.user.role === 'citizen') query.reporter = req.user._id;
    else if (req.user.role === 'worker' && req.user.workerProfile) {
      query.zone = req.user.workerProfile.zone;
    } else if (req.user.role === 'collector') {
      query.zone = req.user.zone || null;
    }

    const incidents = await WasteIncident.find(query)
      .populate('zone', 'name code')
      .populate('bin', 'binId capacityL')
      .populate('task')
      .populate('reporter', 'name email')
      .sort({ priority: -1, createdAt: -1 });

    res.json(incidents);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Assign incident to a worker (from a queue)
// @route PUT /api/incidents/:id/assign
const assignIncident = async (req, res) => {
  try {
    const incident = await WasteIncident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    let task = incident.task ? await CollectionTask.findById(incident.task) : null;
    if (!task) {
      task = await CollectionTask.create({
        taskId: `TASK-${Date.now()}`,
        type: 'incident-response',
        zone: incident.zone,
        bin: incident.bin,
        incident: incident._id,
        location: incident.location,
        priority: incident.priority,
        status: 'assigned',
        assignedTo: req.body.workerId ? [req.body.workerId] : [],
        dueAt: new Date(Date.now() + 4 * 3600000),
      });
      incident.task = task._id;
    }
    if (req.body.workerId) {
      task.assignedTo = [req.body.workerId];
      task.status = 'assigned';
      await task.save();
    }
    incident.status = 'assigned';
    await incident.save();
    res.json({ incident, task });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Complete incident with proof (worker) → AI-style verification score
// @route POST /api/incidents/:id/complete
const completeIncident = async (req, res) => {
  try {
    const incident = await WasteIncident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    let completionImage = null;
    if (req.file) {
      try { completionImage = await uploadToCloudinary(req.file, 'nagarai/completions'); }
      catch (e) { return res.status(500).json({ message: 'Proof upload failed', error: e.message }); }
    }

    // Signal-based fallback score (used when a real before/after comparison
    // isn't possible — no before image, or ml-service unreachable).
    const signals = { hasLegacyReport: incident.duplicateCount > 1, hasImage: !!completionImage, resolved: true };
    let verificationScore = Math.round(40 + (signals.hasImage ? 35 : 10) + signals.hasLegacyReport * 15);
    let verificationMethod = 'signal-heuristic-v1';

    // Real verification: run the YOLO detector on the before (incident.image)
    // and after (completionImage) photos, score by the drop in detected
    // clutter coverage. Fully replaces the fallback score when it succeeds —
    // blending it in as a floor would hide exactly the case this exists to
    // catch (a completion photo that doesn't actually show a cleanup).
    if (completionImage && incident.image && req.file) {
      try {
        const beforeBuffer = Buffer.from(
          (await axios.get(incident.image, { responseType: 'arraybuffer' })).data
        );
        const [before, after] = await Promise.all([
          mlServiceClient.detectFrame(beforeBuffer, 'before.jpg'),
          mlServiceClient.detectFrame(req.file.buffer, 'after.jpg'),
        ]);
        const beforeCoverage = before.coverageRatio || 0;
        const afterCoverage = after.coverageRatio || 0;
        const improvement = beforeCoverage > 0.001
          ? (beforeCoverage - afterCoverage) / beforeCoverage
          : (afterCoverage <= 0.02 ? 1 : 0);
        verificationScore = Math.round(Math.max(0, Math.min(1, improvement)) * 100);
        verificationMethod = 'yolov8n-before-after-v1';
      } catch (e) {
        console.warn('⚠️ [INCIDENT] photo verification detector unavailable, using signal heuristic:', e.message);
      }
    }

    incident.status = 'resolved';
    incident.completionImage = completionImage;
    incident.verificationScore = verificationScore;
    await incident.save();

    if (incident.task) {
      await CollectionTask.findByIdAndUpdate(incident.task, {
        status: 'completed',
        verificationScore,
        proofImage: completionImage,
      });
    }

    if (incident.reporter) {
      await createNotification(incident.reporter, `✅ Your incident ${incident.incidentId} is resolved (verified ${verificationScore}/100)`, 'incident').catch(() => {});
    }

    res.json({ incident, verificationScore, verificationMethod });
  } catch (err) {
    console.error('❌ [INCIDENT] complete error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createIncident, listIncidents, assignIncident, completeIncident, incidentPriority, findDuplicate };
