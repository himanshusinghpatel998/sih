const { Bin, Zone, Vehicle, Worker, Event, DisposalFacility, CollectionTask, WasteIncident } = require('../models');
const { solveCVRP, prioritizeStops } = require('../services/routeOptimizer');
const { enrichRoutesWithRoads } = require('../services/routing');
const { predictBin } = require('../services/predictionEngine');
const { computeZoneStaffing } = require('../services/workforceOptimizer');

// Resolve which bins are due for collection: bins at/over risk threshold,
// bins with reported incident, or bins explicitly requested.
const selectDueBins = async ({ weather = 'clear', onlyHighRisk = false, minRisk = 60 } = {}) => {
  const [bins, zones, events] = await Promise.all([
    Bin.find({ active: { $ne: false } }).lean(),
    Zone.find().lean(),
    Event.find({ status: { $in: ['upcoming', 'active'] } }).lean(),
  ]);

  const zonesById = {};
  for (const z of zones) zonesById[String(z._id)] = z;

  const eventsByZone = {};
  for (const ev of events) if (ev.zone) eventsByZone[String(ev.zone)] = ev;

  const due = [];
  for (const bin of bins) {
    const zone = bin.zone ? zonesById[String(bin.zone)] : null;
    const ev = bin.zone ? eventsByZone[String(bin.zone)] : null;
    const pred = predictBin(bin, zone, { weather, eventType: ev ? ev.type : null });

    const hasIncident = await WasteIncident.exists({
      bin: bin._id,
      status: { $in: ['open', 'assigned', 'in-progress'] },
    });

    const needsCollection =
      (pred.riskScore >= minRisk || (pred.currentLevel || 0) >= 65 || hasIncident) &&
      (!onlyHighRisk || pred.riskScore >= minRisk);

    if (needsCollection) {
      due.push({
        binId: bin.binId,
        zone: zone ? zone.code : null,
        location: bin.location,
        demandKg: Math.round((pred.predictions['1h'] ? pred.predictions['1h'].predictedKg : 0) * 1.3), // headroom to today's load
        priority: pred.riskScore,
        prediction: pred,
      });
    }
  }
  return due;
};

// @desc  Generate optimized collection routes for due bins
// @route POST /api/routes/generate
const generateRoutes = async (req, res) => {
  try {
    const { weather = 'clear' } = req.body || {};
    const depot = await DisposalFacility.findOne().lean();
    if (!depot) {
      return res.status(400).json({ message: 'No disposal facility configured as depot' });
    }

    const due = await selectDueBins({ weather });
    if (!due.length) {
      return res.json({ routes: [], unassigned: [], message: 'No bins currently due for collection', depot });
    }

    // Limit to high-priority if too many (topN default generous)
    const vehicles = await Vehicle.find({ active: { $ne: false } }).lean();
    const availableVehicles = vehicles.map((v) => ({
      vehicleId: v.vehicleId || String(v._id),
      capacityKg: v.capacityKg || 4000,
    }));

    const { routes, unassigned } = solveCVRP({
      depot: { location: depot.location, name: depot.name },
      stops: due,
      vehicles: availableVehicles,
      opts: { maxStopsPerRoute: req.body.maxStopsPerRoute || 30 },
    });

    // Attach road-following polylines (gracefully falls back to straight lines)
    const enriched = await enrichRoutesWithRoads(depot, routes);

    res.json({ depot, binsAssigned: due.length - unassigned.length, routes: enriched, unassigned });
  } catch (err) {
    console.error('❌ [ROUTE] generate error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Generate routes AND assign workers, persisting collection tasks
// @route POST /api/routes/deploy
const deployRoutes = async (req, res) => {
  try {
    const { weather = 'clear' } = req.body || {};
    const depot = await DisposalFacility.findOne().lean();
    if (!depot) return res.status(400).json({ message: 'No disposal facility configured as depot' });

    const due = await selectDueBins({ weather });
    if (!due.length) {
      return res.json({ message: 'No bins currently due for collection', tasksCreated: 0 });
    }

    const vehicles = await Vehicle.find({ active: { $ne: false } }).lean();
    const workers = await Worker.find().lean();

    const availableVehicles = vehicles.map((v) => ({
      vehicleId: v.vehicleId || String(v._id),
      capacityKg: v.capacityKg || 4000,
    }));

    const { routes, unassigned } = solveCVRP({
      depot: { location: depot.location, name: depot.name },
      stops: due,
      vehicles: availableVehicles,
      opts: { maxStopsPerRoute: req.body.maxStopsPerRoute || 30 },
    });

    // Attach road polylines for the client map (best-effort)
    const enriched = await enrichRoutesWithRoads(depot, routes);

    // Assign one worker per route (round-robin over available workers)
    const created = [];
    routes.forEach((route, i) => {
      const worker = workers[i % workers.length];
      const totalPriority = route.stops.reduce((s, st) => s + (st.priority || 0), 0);
      const taskId = `TASK-${Date.now()}-${i}`;
      const firstStop = route.stops[0] || null;
      const task = new CollectionTask({
        taskId,
        type: 'collection',
        zone: null,
        location: firstStop ? firstStop.location : null,
        assignedTo: worker ? [worker._id] : [],
        vehicle: vehicles.find((v) => (v.vehicleId || String(v._id)) === route.vehicle)?._id || null,
        priority: Math.min(100, Math.round(totalPriority / route.stops.length)),
        status: 'assigned',
        dueAt: new Date(),
        estimatedWorkMin: Math.round(route.totalDistanceM / 1000 / 25) * 60 + route.stops.length * 3,
      });
      created.push(task);
    });

    await CollectionTask.insertMany(created);

    res.json({
      depot,
      tasksCreated: created.length,
      binsAssigned: due.length - unassigned.length,
      unassigned,
      routes: enriched,
      workersAssigned: enriched.length,
    });
  } catch (err) {
    console.error('❌ [ROUTE] deploy error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Dynamic reroute: given a new urgent incident, reassign nearest vehicle
// @route POST /api/routes/reroute
const reroute = async (req, res) => {
  try {
    const { incidentId } = req.body;
    const incident = await WasteIncident.findById(incidentId);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    // Find vehicles (assigned or available) and pick nearest by straight-line distance
    const vehicles = await Vehicle.find({ active: { $ne: false } }).lean();
    const depot = await DisposalFacility.findOne().lean();
    const loc = incident.location || (depot ? depot.location : null);
    if (!loc || loc.lat == null) return res.status(400).json({ message: 'Incident has no location' });

    const { haversineM } = require('../services/geo');
    let nearest = null;
    let best = Infinity;
    for (const v of vehicles) {
      const vLoc = v.currentLocation || (depot ? depot.location : null);
      if (!vLoc || vLoc.lat == null) continue;
      const d = haversineM({ lat: loc.lat, lng: loc.lng }, { lat: vLoc.lat, lng: vLoc.lng });
      if (d < best) { best = d; nearest = v; }
    }
    if (!nearest) return res.status(400).json({ message: 'No vehicles available for reroute' });

    // Create an urgent task and mark incident dispatched
    const task = await CollectionTask.create({
      taskId: `TASK-URGENT-${Date.now()}`,
      type: 'incident-response',
      zone: incident.zone || null,
      incident: incident._id,
      location: incident.location || null,
      vehicle: nearest._id,
      assignedTo: [],
      status: 'assigned',
      dueAt: new Date(),
      priority: 100,
      estimatedWorkMin: Math.round((best / 1000 / 25) * 60),
    });

    incident.status = 'in-progress';
    incident.task = task._id;
    await incident.save();

    res.json({ reroutedVehicle: nearest.vehicleId || String(nearest._id), distanceM: Math.round(best), task, incident });
  } catch (err) {
    console.error('❌ [ROUTE] reroute error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Workforce need for upcoming event/zone (resource planning)
// @route GET /api/routes/workforce?eventId=...
const workforce = async (req, res) => {
  try {
    const { eventId } = req.query;
    let effEvent = 1;
    if (eventId) {
      const ev = await Event.findById(eventId);
      if (ev) effEvent = ev.wasteMultiplier || 1;
    }

    const [zones, bins] = await Promise.all([Zone.find().lean(), Bin.find().lean()]);
    const out = zones.map((z) => {
      const zoneBins = bins.filter((b) => String(b.zone) === String(z._id));
      return {
        zone: z.code,
        name: z.name,
        bins: zoneBins.length,
        predictedKg: Math.round((z.footfall || 0) * 0.12 * zoneBins.length || 0),
        footfall: z.footfall,
        areaM2: z.areaM2 || 0,
        eventMultiplier: effEvent,
        staffing: computeZoneStaffing({
          bins: zoneBins.length,
          predictedKg: (z.footfall || 0) * 0.12,
          footfall: z.footfall,
          areaM2: z.areaM2 || 0,
          eventMultiplier: effEvent,
        }),
      };
    });
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { generateRoutes, deployRoutes, reroute, workforce, selectDueBins };
