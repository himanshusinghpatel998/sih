const { Bin, Zone, Vehicle, Worker, Event, DisposalFacility, CollectionTask, WasteIncident, User } = require('../models');
const { solveCVRP, prioritizeStops } = require('../services/routeOptimizer');
const { enrichRoutesWithRoads } = require('../services/routing');
const { predictBin } = require('../services/predictionEngine');
const { computeZoneStaffing } = require('../services/workforceOptimizer');
const mlServiceClient = require('../services/mlServiceClient');
const { advanceDay } = require('../services/dayCycle');
const { buildFleetForDemand } = require('../services/truckFleet');
const { haversineM } = require('../services/geo');

// A bin at/above this predicted risk is a mandatory route node — the truck
// is going there regardless. Below it but still due, a bin only gets
// visited if it happens to be near a critical bin's route ("on the way").
const RISK_CRITICAL = 90;
const RISK_OPPORTUNISTIC = 70;
// How far off a route's existing stops a lower-priority bin can be and
// still count as "on the way" rather than a dedicated detour.
const MAX_DETOUR_M = 600;

// Try the ml-service's OR-Tools CVRP solver (ml/routing/route_optimizer.py,
// reused as-is — richer than the greedy heuristic below: real capacity-
// constrained VRP instead of nearest-neighbor insertion). Falls back to the
// zero-dependency solveCVRP() if ml-service is unreachable, mirroring the
// same try/fallback pattern used for CCTV detection.
//
// `fleet` is pre-sized for the bins being routed (see buildFleetForDemand) —
// this only solves the assignment/ordering problem, not truck selection.
const optimizeRoutesWithFallback = async ({ depot, due, fleet, maxStopsPerRoute }) => {
  try {
    // NOTE: don't send total_score/risk_level — RouteOptimizer recomputes
    // its own via ml/routing/demand_score.py internally, and a bins_df that
    // already carries those column names collides with that recomputation
    // (pandas merge suffixes them to total_score_x/_y, and the optimizer's
    // own filter on 'total_score' then KeyErrors).
    const mlBins = due.map((d) => ({
      bin_id: d.binId,
      latitude: d.location.lat,
      longitude: d.location.lng,
      bin_capacity_liters: d.capacityL || 240,
      avg_fill_pct: d.currentLevel != null ? d.currentLevel : 50,
    }));
    const mlFleet = fleet.map((v) => ({ vehicle_id: v.vehicleId, capacity_kg: v.capacityKg, type: v.truckType }));

    const result = await mlServiceClient.optimizeRoutes(mlBins, mlFleet);
    const byBinId = {};
    for (const d of due) byBinId[d.binId] = d;
    const fleetById = {};
    for (const v of fleet) fleetById[v.vehicleId] = v;

    const routes = (result.routes || []).map((r) => {
      const truck = fleetById[r.vehicle_id] || {};
      return {
        vehicle: r.vehicle_id,
        vehicleCapacityKg: r.capacity_kg,
        truckType: truck.truckType || null,
        truckLabel: truck.truckLabel || null,
        stops: (r.stops || []).map((s) => {
          const orig = byBinId[s.bin_id];
          return {
            binId: s.bin_id,
            location: orig ? orig.location : { lat: s.latitude, lng: s.longitude },
            demandKg: Math.round(s.capacity_used || 0),
            priority: s.demand_score,
            tier: orig ? orig.tier : 'critical',
          };
        }),
        totalDistanceM: Math.round((r.total_distance_km || 0) * 1000),
        totalDemandKg: Math.round(r.total_demand_kg || 0),
        utilizationPct: r.utilization_pct != null ? Math.round(r.utilization_pct) : null,
      };
    });

    const assignedIds = new Set(routes.flatMap((r) => r.stops.map((s) => s.binId)));
    const unassigned = due.filter((d) => !assignedIds.has(d.binId));
    return { routes, unassigned, engine: 'ortools', rawResult: result };
  } catch (err) {
    console.warn('⚠️ [ROUTE] ml-service optimizer unavailable, falling back to greedy CVRP:', err.message);
    const { routes, unassigned } = solveCVRP({
      depot: { location: depot.location, name: depot.name },
      stops: due,
      vehicles: fleet,
      opts: { maxStopsPerRoute },
    });
    const fleetById = {};
    for (const v of fleet) fleetById[v.vehicleId] = v;
    for (const r of routes) {
      const truck = fleetById[r.vehicle] || {};
      r.truckType = truck.truckType || null;
      r.truckLabel = truck.truckLabel || null;
      for (const s of r.stops) s.tier = s.tier || 'critical';
    }
    return { routes, unassigned, engine: 'greedy-cvrp', rawResult: null };
  }
};

// Insert lower-priority "opportunistic" bins into whichever route already
// passes near them, if the truck still has room — the "pick up other bins
// on the way" behavior. A bin that isn't near any route or would overload
// its truck is left unassigned rather than forcing a dedicated detour.
const insertOpportunisticBins = (routes, opportunistic) => {
  const stillUnassigned = [];
  const sorted = [...opportunistic].sort((a, b) => b.priority - a.priority);

  for (const bin of sorted) {
    let bestRoute = null;
    let bestDist = Infinity;
    for (const route of routes) {
      const remainingCapacity = route.vehicleCapacityKg - route.totalDemandKg;
      if (bin.demandKg > remainingCapacity) continue;
      for (const stop of route.stops) {
        const d = haversineM(bin.location, stop.location);
        if (d < bestDist) { bestDist = d; bestRoute = route; }
      }
    }
    if (bestRoute && bestDist <= MAX_DETOUR_M) {
      bestRoute.stops.push({
        binId: bin.binId,
        location: bin.location,
        demandKg: bin.demandKg,
        priority: bin.priority,
        tier: 'opportunistic',
        pickedUpOnTheWay: true,
      });
      bestRoute.totalDemandKg += bin.demandKg;
      bestRoute.utilizationPct = Math.round((bestRoute.totalDemandKg / bestRoute.vehicleCapacityKg) * 100);
    } else {
      stillUnassigned.push(bin);
    }
  }
  return stillUnassigned;
};

// Resolve which bins are due for collection, tagged by tier:
//   'critical'      — predicted risk >= RISK_CRITICAL (90), or an open
//                      incident — these are the route's mandatory nodes.
//   'opportunistic' — risk in [RISK_OPPORTUNISTIC, RISK_CRITICAL) — only
//                      visited if a critical-bin route happens to pass by.
const selectDueBins = async ({ weather = 'clear', onlyHighRisk = false, minRisk = RISK_OPPORTUNISTIC } = {}) => {
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

    // Two signals, either one triggers a tier: actual fill % (the bin is
    // literally ~full) or the model's predicted overflow risk (it's
    // trending toward full even if not there yet). riskScore alone rarely
    // reaches 90 even for a nearly-full bin — it's a differently-calibrated
    // probability, not a copy of fill % — so a fill-based OR keeps a truly
    // overflowing bin classified as critical regardless of model quirks.
    const currentLevel = pred.currentLevel || 0;
    const tier = currentLevel >= RISK_CRITICAL || pred.riskScore >= RISK_CRITICAL || hasIncident ? 'critical'
      : currentLevel >= minRisk || pred.riskScore >= minRisk ? 'opportunistic'
      : null;

    const needsCollection = tier && (!onlyHighRisk || tier === 'critical');

    if (needsCollection) {
      due.push({
        binId: bin.binId,
        zone: zone ? zone.code : null,
        location: bin.location,
        demandKg: Math.round((pred.predictions['1h'] ? pred.predictions['1h'].predictedKg : 0) * 1.3), // headroom to today's load
        priority: pred.riskScore,
        tier,
        prediction: pred,
        capacityL: bin.capacityL,
        currentLevel: bin.currentLevel,
      });
    }
  }
  return due;
};

// Shared by generate/deploy: predict → split critical (mandatory route
// nodes, risk >= 90) vs opportunistic (picked up along the way, risk 70-89)
// → size a truck fleet to the critical load → solve routes on critical bins
// only → fold opportunistic bins into whichever route already passes near
// them, capacity permitting.
const planRoutes = async ({ weather, maxStopsPerRoute }) => {
  const due = await selectDueBins({ weather });
  const critical = due.filter((d) => d.tier === 'critical');
  const opportunistic = due.filter((d) => d.tier === 'opportunistic');

  // No bin is at critical risk yet — nothing forces a truck out. Fall back
  // to routing the opportunistic set directly so the system isn't idle
  // just because nothing has crossed 90 yet.
  const nodeBins = critical.length ? critical : opportunistic;
  const extraBins = critical.length ? opportunistic : [];

  if (!nodeBins.length) {
    return { due: [], critical, opportunistic, routes: [], unassigned: [] };
  }

  const totalNodeKg = nodeBins.reduce((s, b) => s + b.demandKg, 0);
  const fleet = buildFleetForDemand(totalNodeKg);

  const depot = await DisposalFacility.findOne().lean();
  if (!depot) return { noDepot: true };

  const { routes, unassigned, engine, rawResult } = await optimizeRoutesWithFallback({
    depot,
    due: nodeBins,
    fleet,
    maxStopsPerRoute: maxStopsPerRoute || 30,
  });

  const stillUnassignedOpportunistic = insertOpportunisticBins(routes, extraBins);

  return {
    depot,
    due,
    critical,
    opportunistic,
    routes,
    unassigned: [...unassigned, ...stillUnassignedOpportunistic],
    engine,
    rawResult,
  };
};

// @desc  Generate optimized collection routes for due bins
// @route POST /api/routes/generate
const generateRoutes = async (req, res) => {
  try {
    const { weather = 'clear' } = req.body || {};
    const plan = await planRoutes({ weather, maxStopsPerRoute: req.body.maxStopsPerRoute });
    if (plan.noDepot) return res.status(400).json({ message: 'No disposal facility configured as depot' });
    if (!plan.routes.length && !plan.due.length) {
      return res.json({ routes: [], unassigned: [], message: 'No bins currently due for collection' });
    }

    // Attach road-following polylines (gracefully falls back to straight lines)
    const enriched = await enrichRoutesWithRoads(plan.depot, plan.routes);

    res.json({
      depot: plan.depot,
      binsAssigned: plan.due.length - plan.unassigned.length,
      criticalBins: plan.critical.length,
      opportunisticBins: plan.opportunistic.length,
      routes: enriched,
      unassigned: plan.unassigned,
      engine: plan.engine,
    });
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
    const plan = await planRoutes({ weather, maxStopsPerRoute: req.body.maxStopsPerRoute });
    if (plan.noDepot) return res.status(400).json({ message: 'No disposal facility configured as depot' });
    if (!plan.routes.length && !plan.due.length) {
      return res.json({ message: 'No bins currently due for collection', tasksCreated: 0 });
    }
    const { depot, routes, unassigned, engine, rawResult } = plan;

    // Real registered vehicles — matched to each route's sized truck type
    // where a suitable one is available (status: available, capacity covers
    // the route's load); routes fall back to a virtual truck otherwise, so
    // deployment never blocks on the DB fleet being incomplete.
    const vehicles = await Vehicle.find({ status: 'available' }).lean();
    const workers = await Worker.find().lean();
    const claimedVehicleIds = new Set();
    const matchVehicleForRoute = (route) => {
      const candidates = vehicles
        .filter((v) => !claimedVehicleIds.has(String(v._id)) && (v.capacityKg || 0) >= route.totalDemandKg)
        .sort((a, b) => (a.capacityKg || 0) - (b.capacityKg || 0)); // smallest that fits first
      const match = candidates[0];
      if (match) claimedVehicleIds.add(String(match._id));
      return match || null;
    };

    // Worker → route assignment: try the ml-service assigner (skill/experience
    // match score from ml/routing/worker_assignment.py), fall back to plain
    // round-robin if ml-service is unreachable or returns nothing usable.
    let assignments = null;
    try {
      const users = await User.find({ _id: { $in: workers.map((w) => w.userId) } }).lean();
      const usersById = {};
      for (const u of users) usersById[String(u._id)] = u;
      const mlWorkers = workers.map((w) => ({
        worker_id: String(w._id),
        name: usersById[String(w.userId)]?.name || String(w._id),
        experience_years: (w.skills || []).length + 2,
        skill_level: (w.skills || []).includes('hazardous') || (w.skills || []).includes('driving') ? 'expert'
          : (w.skills || []).length > 1 ? 'advanced' : 'intermediate',
        available: w.availability !== false,
      }));
      const routesForAssignment = rawResult || {
        routes: routes.map((r) => ({ vehicle_id: r.vehicle, stops: r.stops, total_distance_km: r.totalDistanceM / 1000 })),
      };
      const assignResult = await mlServiceClient.assignWorkers(routesForAssignment, mlWorkers);
      if (assignResult.assignments && assignResult.assignments.length) assignments = assignResult.assignments;
    } catch (err) {
      console.warn('⚠️ [ROUTE] ml-service worker assignment unavailable, falling back to round-robin:', err.message);
    }

    const workerByRoute = new Map();
    if (assignments) {
      for (const a of assignments) workerByRoute.set(a.route_vehicle_id, a.worker_id);
    }

    // Assign a worker per route: ml-service match if available, else round-robin.
    const created = [];
    routes.forEach((route, i) => {
      const assignedWorkerId = workerByRoute.get(route.vehicle);
      const worker = assignedWorkerId
        ? workers.find((w) => String(w._id) === assignedWorkerId)
        : workers[i % workers.length];
      const totalPriority = route.stops.reduce((s, st) => s + (st.priority || 0), 0);
      const taskId = `TASK-${Date.now()}-${i}`;
      const firstStop = route.stops[0] || null;
      const matchedVehicle = matchVehicleForRoute(route);
      const task = new CollectionTask({
        taskId,
        type: 'collection',
        zone: null,
        location: firstStop ? firstStop.location : null,
        assignedTo: worker ? [worker._id] : [],
        vehicle: matchedVehicle ? matchedVehicle._id : null,
        priority: Math.min(100, Math.round(totalPriority / route.stops.length)),
        status: 'assigned',
        dueAt: new Date(),
        estimatedWorkMin: Math.round(route.totalDistanceM / 1000 / 25) * 60 + route.stops.length * 3,
      });
      route.matchedVehicleNo = matchedVehicle ? matchedVehicle.vehicleNo : null;
      route.matchedVehicleType = matchedVehicle ? matchedVehicle.type : null;
      created.push(task);
    });

    await CollectionTask.insertMany(created);

    // Attach road polylines for the client map (best-effort) — done last so
    // matchedVehicleNo (set on `routes` above) survives into the response.
    const enriched = await enrichRoutesWithRoads(depot, routes);

    res.json({
      depot,
      tasksCreated: created.length,
      binsAssigned: plan.due.length - unassigned.length,
      criticalBins: plan.critical.length,
      opportunisticBins: plan.opportunistic.length,
      unassigned,
      routes: enriched,
      workersAssigned: enriched.length,
      engine,
      workerAssignmentEngine: assignments ? 'ml-service' : 'round-robin',
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

// @desc  Insert a newly-urgent bin into an in-progress route, or report a
//        vehicle breakdown / traffic delay against it — powered by
//        ml/routing/dynamic_rerouting.py. The frontend passes back the
//        `routes` object it already holds in state from the last
//        generate/deploy call (Node doesn't persist full stop lists per
//        route, only one CollectionTask per route — see plan2.md Phase G).
// @route POST /api/routes/reroute-ml
const rerouteMl = async (req, res) => {
  try {
    const { action, routes, bins, binId, vehicleId, delayMinutes, affectedStops, currentLocation } = req.body || {};
    if (!routes || !Array.isArray(bins)) {
      return res.status(400).json({ message: 'routes and bins are required' });
    }

    let result;
    if (action === 'insert-bin') {
      if (!binId) return res.status(400).json({ message: 'binId is required for insert-bin' });
      result = await mlServiceClient.rerouteInsertBin(routes, bins, binId, req.body.scores, currentLocation);
    } else if (action === 'breakdown') {
      if (!vehicleId) return res.status(400).json({ message: 'vehicleId is required for breakdown' });
      result = await mlServiceClient.rerouteBreakdown(routes, bins, vehicleId);
    } else if (action === 'traffic') {
      if (!vehicleId) return res.status(400).json({ message: 'vehicleId is required for traffic' });
      result = await mlServiceClient.rerouteTraffic(routes, bins, vehicleId, delayMinutes || 10, affectedStops || []);
    } else {
      return res.status(400).json({ message: "action must be one of: 'insert-bin', 'breakdown', 'traffic'" });
    }

    res.json(result);
  } catch (err) {
    console.error('❌ [ROUTE] reroute-ml error:', err.message);
    res.status(502).json({ message: 'ml-service reroute failed (is ml-service running?)', error: err.message });
  }
};

// @desc  Close the day's predict→route→collect loop: reset bins that were
//        actually on a deployed route today, and carry every other bin's
//        predicted growth forward as tomorrow's starting fill level — so
//        outstanding (uncollected) waste compounds instead of vanishing,
//        and the next "Run prediction" reflects it.
// @route POST /api/routes/advance-day
const advanceDayHandler = async (req, res) => {
  try {
    const { collectedBinIds = [], weather = 'clear' } = req.body || {};
    if (!Array.isArray(collectedBinIds)) {
      return res.status(400).json({ message: 'collectedBinIds must be an array of binIds' });
    }
    const result = await advanceDay({ collectedBinIds, weather });
    res.json(result);
  } catch (err) {
    console.error('❌ [ROUTE] advance-day error:', err.message);
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

module.exports = { generateRoutes, deployRoutes, reroute, rerouteMl, workforce, selectDueBins, advanceDayHandler };
