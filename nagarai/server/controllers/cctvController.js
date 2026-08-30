/**
 * CCTV Waste Detection.
 *
 * A frame goes to the ml-service's YOLOv8n object-density detector
 * (analyzeFrameWithYolo) — no labeled "garbage pile" dataset exists in this
 * repo, so it's not a trained waste classifier, it's non-person/non-vehicle
 * object clutter density used as a detection signal (see ml-service/detector.py).
 * If ml-service is unreachable, analyzeFrame() falls back to the original
 * pixel-variance heuristic (analyzeFrameHeuristic) so the closed-loop demo
 * (frame in → incident → worker task) never hard-depends on the Python service.
 */
const sharp = require('sharp');
const { WasteIncident, CollectionTask, User, Zone } = require('../models');
const { uploadToCloudinary } = require('../middleware/upload');
const { createNotification } = require('./notificationController');
const { incidentPriority, findDuplicate } = require('./incidentController');
const mlServiceClient = require('../services/mlServiceClient');

// Real detector — maps YOLO's objectCount/coverageRatio onto the same
// {garbageDetected, confidence, severity, estimatedAreaM2, method} shape
// analyzeFrameHeuristic already produces, so the incident/task pipeline
// downstream (incidentPriority, findDuplicate, task creation) is unaffected.
const analyzeFrameWithYolo = async (buffer) => {
  const result = await mlServiceClient.detectFrame(buffer);
  const { objectCount = 0, avgConfidence = 0, coverageRatio = 0, method } = result;
  const garbageDetected = coverageRatio > 0.06 || objectCount >= 4;
  const severity = coverageRatio > 0.22 ? 'high' : coverageRatio > 0.12 ? 'medium' : 'low';
  const estimatedAreaM2 = garbageDetected ? Math.round((5 + coverageRatio * 150) * 10) / 10 : 0;
  return {
    garbageDetected,
    confidence: Math.round((avgConfidence || Math.min(1, coverageRatio * 2)) * 100) / 100,
    severity,
    estimatedAreaM2,
    method: method || 'yolov8n-coco-density-v1',
    objectCount,
    coverageRatio,
  };
};

// Heuristic "is there a garbage pile in this frame" scorer — fallback only.
// Real garbage piles/overflow tend to be visually high-variance, low-saturation-uniformity
// clutter compared to a clean street/pavement. This is a stand-in, not a trained classifier.
const analyzeFrameHeuristic = async (buffer) => {
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

// What detectFromImage() actually calls: real detector, heuristic fallback.
const analyzeFrame = async (buffer) => {
  try {
    return await analyzeFrameWithYolo(buffer);
  } catch (err) {
    console.warn('⚠️ [CCTV] ml-service detector unavailable, falling back to heuristic:', err.message);
    return analyzeFrameHeuristic(buffer);
  }
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
        console.error(' CCTV frame upload failed:', e.message);
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
          ` CCTV detected ${incident.type} (${detection.severity}) — incident ${incident.incidentId}`,
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
    console.error(' [CCTV] detect error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { detectFromImage, analyzeFrame, analyzeFrameWithYolo, analyzeFrameHeuristic };
