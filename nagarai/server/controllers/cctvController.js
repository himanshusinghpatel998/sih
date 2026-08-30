/**
 * CCTV Waste Detection — hackathon-scoped MVP.
 *
 * Real live-camera + trained object-detection (YOLO-style) is out of scope
 * for this build (no camera feed, no labeled training data). This endpoint
 * implements the full *flow* the PRD describes — frame in, detection out,
 * incident auto-created, worker task dispatched — using an explicit image
 * heuristic (pixel-variance/clutter proxy) instead of a trained model, so the
 * closed-loop demo (upload/simulate a frame → AI flags it → incident →
 * worker task) works end-to-end. Swapping in a real detector later only
 * means replacing `analyzeFrame()` below — the incident/task pipeline is
 * unaffected.
 */
const sharp = require('sharp');
const { WasteIncident, CollectionTask, User, Zone } = require('../models');
const { uploadToCloudinary } = require('../middleware/upload');
const { createNotification } = require('./notificationController');
const { incidentPriority, findDuplicate } = require('./incidentController');

// Heuristic "is there a garbage pile in this frame" scorer.
// Real garbage piles/overflow tend to be visually high-variance, low-saturation-uniformity
// clutter compared to a clean street/pavement. This is a stand-in, not a trained classifier.
const analyzeFrame = async (buffer) => {
  const stats = await sharp(buffer).stats();
  const channelStdDevs = stats.channels.map((c) => c.stdev);
  const avgStdDev = channelStdDevs.reduce((a, b) => a + b, 0) / channelStdDevs.length;
  // Normalize: typical clean-scene stdev ~15-35, cluttered-scene stdev ~45-90 (8-bit channel)
  const clutterScore = Math.max(0, Math.min(1, (avgStdDev - 20) / 60));
  const garbageDetected = clutterScore > 0.45;
  const severity = clutterScore > 0.75 ? 'high' : clutterScore > 0.55 ? 'medium' : 'low';
  const estimatedAreaM2 = garbageDetected ? Math.round((5 + clutterScore * 40) * 10) / 10 : 0;

  return {
    garbageDetected,
    confidence: Math.round(clutterScore * 100) / 100,
    severity,
    estimatedAreaM2,
    method: 'heuristic-image-variance-v1',
  };
};

// @desc  Analyze an uploaded/simulated CCTV frame; auto-create an incident if flagged
// @route POST /api/cctv/detect
const detectFromImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'image file is required (field name: image)' });
    const { lat, lng, address, zone, cameraId } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ message: 'lat/lng are required (the camera\'s known fixed location)' });
    }

    const detection = await analyzeFrame(req.file.buffer);

    let incident = null;
    let task = null;
    let imageUrl = null;

    if (detection.garbageDetected) {
      try {
        imageUrl = await uploadToCloudinary(req.file, 'nagarai/cctv');
      } catch (e) {
        console.error('⚠️ CCTV frame upload failed:', e.message);
      }

      const incidentData = {
        incidentId: `CCTV-${Date.now()}`,
        source: 'cctv',
        type: detection.severity === 'high' ? 'overflow' : 'garbage_accumulation',
        zone: zone || null,
        location: { lat: Number(lat), lng: Number(lng), address: address || `Camera ${cameraId || 'unknown'}` },
        description: `AI Detection — ${detection.severity} severity, ~${detection.estimatedAreaM2} m² (confidence ${Math.round(detection.confidence * 100)}%)`,
        extentKg: Math.round(detection.estimatedAreaM2 * 8), // rough kg/m² proxy for street waste
        priority: incidentPriority({ type: 'garbage_accumulation', extentKg: detection.estimatedAreaM2 * 8 }),
        status: 'open',
        image: imageUrl,
      };

      const dup = await findDuplicate(incidentData);
      if (dup) {
        dup.duplicateCount = (dup.duplicateCount || 0) + 1;
        await dup.save();
        return res.json({ detection, deduplicated: true, incident: dup, task: null });
      }

      incident = await WasteIncident.create(incidentData);

      const admins = await User.find({ role: 'admin' });
      for (const a of admins) {
        await createNotification(
          a._id,
          `📹 CCTV detected ${incident.type} (${detection.severity}) — incident ${incident.incidentId}`,
          'incident'
        ).catch(() => {});
      }

      task = await CollectionTask.create({
        taskId: `TASK-${Date.now()}`,
        type: 'incident-response',
        zone: incident.zone,
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
    }

    res.json({ detection, incident, task });
  } catch (err) {
    console.error('❌ [CCTV] detect error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { detectFromImage, analyzeFrame };
