/**
 * NagarAI Sweeping Optimizer
 *
 * Builds sweeping routes from:
 *   - Litter incidents (road_litter, unclean_road, garbage_accumulation)
 *   - High-footfall zone centroids (for proactive sweeping)
 *
 * Uses a simple nearest-neighbor TSP on the candidate points, then groups
 * by sweeper capacity (distance per shift). Creates CollectionTask of type 'sweeping'.
 */

const { haversineM } = require('./geo');
const { DisposalFacility } = require('../models');

const MAX_SWEEPER_KM_PER_SHIFT = 25; // ~25 km per shift per sweeper

/**
 * Build sweeping candidate points from incidents and high-footfall zones
 * @returns {Promise<{location, type, source, incidentId?}[]>}
 */
const buildSweepCandidates = async () => {
  const { WasteIncident, Zone } = require('../models');
  const candidates = [];

  // 1. Open litter incidents
  const litterIncidents = await WasteIncident.find({
    type: { $in: ['road_litter', 'unclean_road', 'garbage_accumulation'] },
    status: { $in: ['open', 'assigned'] },
  }).lean();

  for (const inc of litterIncidents) {
    if (inc.location && inc.location.lat != null) {
      candidates.push({
        location: inc.location,
        type: 'incident',
        source: inc.incidentId,
        priority: inc.priority,
        zone: inc.zone,
      });
    }
  }

  // 2. High-footfall zone centroids (proactive sweep)
  const zones = await Zone.find({ footfall: { $gte: 15000 } }).lean();
  for (const z of zones) {
    if (z.center && z.center.lat != null) {
      candidates.push({
        location: z.center,
        type: 'proactive',
        source: `zone-${z.code}`,
        zone: z._id,
        footfall: z.footfall,
      });
    }
  }

  return candidates;
};

/**
 * Nearest-neighbor TSP tour through points (starts/ends at depot)
 * Returns array of waypoints in visit order
 */
const solveTSP = (depot, points) => {
  if (!points.length) return { tour: [], distanceM: 0 };
  const unvisited = points.map((p, i) => ({ ...p, idx: i }));
  const tour = [];
  let current = depot;
  let totalDist = 0;

  while (unvisited.length) {
    let best = null, bestDist = Infinity, bestIdx = -1;
    unvisited.forEach((p, i) => {
      const d = haversineM(current, p.location);
      if (d < bestDist) { bestDist = d; best = p; bestIdx = i; }
    });
    totalDist += bestDist;
    current = best.location;
    tour.push(best);
    unvisited.splice(bestIdx, 1);
  }
  // Return to depot
  totalDist += haversineM(current, depot);
  return { tour, distanceM: Math.round(totalDist) };
};

/**
 * Split a TSP tour into sweeper segments each <= maxKm
 * @returns {segments: [{points, distanceM, estimatedHrs}]}
 */
const segmentForSweepers = (depot, tour, maxKm = MAX_SWEEPER_KM_PER_SHIFT) => {
  const maxM = maxKm * 1000;
  const segments = [];
  let currentSeg = [];
  let segDist = 0;
  let prev = depot;

  for (const p of tour) {
    const d = haversineM(prev, p.location);
    if (segDist + d > maxM && currentSeg.length > 0) {
      // Close this segment
      segments.push({
        points: [...currentSeg],
        distanceM: Math.round(segDist),
        estimatedHrs: Math.round((segDist / 1000) / 8 * 10) / 10, // 8 km/hr sweeping speed
      });
      currentSeg = [];
      segDist = 0;
      prev = depot;
    }
    currentSeg.push(p);
    segDist += d;
    prev = p.location;
  }
  // Add last segment
  if (currentSeg.length > 0) {
    const returnDist = haversineM(prev, depot);
    segDist += returnDist;
    segments.push({
      points: [...currentSeg],
      distanceM: Math.round(segDist),
      estimatedHrs: Math.round((segDist / 1000) / 8 * 10) / 10,
    });
  }
  return segments;
};

/**
 * Main entry: generate sweeping routes and optionally create tasks
 */
const generateSweepingPlan = async ({ createTasks = false } = {}) => {
  const depot = await DisposalFacility.findOne().lean();
  if (!depot) throw new Error('No disposal facility configured');

  const candidates = await buildSweepCandidates();
  if (!candidates.length) return { candidates: 0, segments: [], tasksCreated: 0 };

  const { tour, distanceM } = solveTSP(depot.location, candidates);
  const segments = segmentForSweepers(depot.location, tour);

  let tasksCreated = 0;
  if (createTasks && segments.length) {
    const { CollectionTask, Worker } = require('../models');
    const workers = await Worker.find({ skills: 'sweeping' }).lean();
    const created = [];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const worker = workers[i % workers.length];
      created.push({
        taskId: `SWEEP-${Date.now()}-${i}`,
        type: 'sweeping',
        zone: s.points[0]?.zone || null,
        location: s.points[0]?.location || null,
        status: 'assigned',
        priority: Math.round(s.points.reduce((a, b) => a + (b.priority || 0), 0) / s.points.length),
        dueAt: new Date(),
        estimatedWorkMin: Math.round(s.estimatedHrs * 60),
        assignedTo: worker ? [worker._id] : [],
      });
    }
    if (created.length) {
      await CollectionTask.insertMany(created);
      tasksCreated = created.length;
    }
  }

  return {
    depot: { name: depot.name, location: depot.location },
    candidates: candidates.length,
    totalDistanceKm: Math.round(distanceM / 1000 * 10) / 10,
    segments: segments.map((s) => ({
      stops: s.points.map((p) => ({ location: p.location, type: p.type, source: p.source, zone: p.zone, priority: p.priority })),
      distanceM: s.distanceM,
      distanceKm: Math.round(s.distanceM / 1000 * 10) / 10,
      estimatedHrs: s.estimatedHrs,
    })),
    tasksCreated,
  };
};

module.exports = { generateSweepingPlan, buildSweepCandidates, solveTSP, segmentForSweepers };