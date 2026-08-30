/**
 * NagarAI Route Optimizer (CVRP)
 *
 * Solves a Capacitated Vehicle Routing Problem with a practical, zero-dependency
 * heuristic: greedy nearest-neighbor insertion grouped into vehicle routes that
 * respect each vehicle's capacity (kg) and a max number of stops per trip.
 *
 * Input:
 *   - depot: { location: {lat,lng}, name }
 *   - stops: [{ binId, location:{lat,lng}, demandKg, priority }]
 *   - vehicles: [{ vehicleId, capacityKg }]
 *   - opts: { maxStopsPerRoute, wasteTypeFilter }
 *
 * Output: array of routes, each a sequence of stop indexes ending back at depot.
 */

const { haversineM } = require('./geo');

const DEFAULT_MAX_STOPS = 40;

/**
 * Build an n x n distance matrix (meters, rounded) for a list of points.
 */
const buildDistanceMatrix = (points) => {
  const n = points.length;
  const m = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.round(haversineM(points[i], points[j]));
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
};

/**
 * Greedy nearest-neighbor CVRP.
 * Returns array of { vehicle, stops: [...], totalDistanceM, totalDemandKg }.
 */
const solveCVRP = ({ depot, stops, vehicles, opts = {} }) => {
  const maxStops = opts.maxStopsPerRoute || DEFAULT_MAX_STOPS;
  const allPoints = [depot.location, ...stops.map((s) => s.location)];
  const dist = buildDistanceMatrix(allPoints);
  const n = stops.length;

  // Track visited stops (index 0 is depot; stops are 1..n)
  const visited = Array(n).fill(false);
  const routes = [];

  for (let r = 0; r < vehicles.length; r++) {
    const vehicle = vehicles[r];
    const capacity = vehicle.capacityKg || Infinity;

    let current = 0; // depot
    let load = 0;
    const routeStops = [];
    let routeDistance = 0;

    while (routeStops.length < maxStops && visited.some((v) => !v)) {
      // Find nearest unvisited stop we can still carry (respect capacity)
      let best = -1;
      let bestDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (visited[j]) continue;
        const d = dist[current][j + 1];
        if (d < bestDist && load + stops[j].demandKg <= capacity) {
          bestDist = d;
          best = j;
        }
      }
      if (best === -1) break; // can't add more to this route (capacity/stops or no reachable)

      visited[best] = true;
      routeDistance += dist[current][best + 1];
      load += stops[best].demandKg;
      current = best + 1;
      routeStops.push(best);
    }

    // Close route back to depot
    if (routeStops.length > 0) {
      routeDistance += dist[current][0];
      routes.push({
        vehicle: vehicle.vehicleId,
        vehicleCapacityKg: capacity,
        stops: routeStops.map((idx) => stops[idx]),
        stopIndexes: routeStops,
        totalDistanceM: routeDistance,
        totalDemandKg: Math.round(load),
        utilizationPct: capacity === Infinity ? null : Math.round((load / capacity) * 100),
      });
    }
  }

  const unassigned = [];
  for (let j = 0; j < n; j++) {
    if (!visited[j]) unassigned.push(stops[j]);
  }

  return { routes, unassigned, distanceMatrix: dist };
};

/**
 * Filter stops by risk/priority for congestion-triaging: keeps only high-priority
 * stops when there are too many to serve. Used for dynamic rerouting.
 */
const prioritizeStops = (stops, opts = {}) => {
  const { keepPriorityAbove = 0, topN = 0 } = opts;
  let filtered = stops;
  if (keepPriorityAbove > 0) filtered = filtered.filter((s) => s.priority > keepPriorityAbove);
  if (topN > 0) {
    filtered = [...filtered].sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, topN);
  }
  return filtered;
};

// Recompute a single route's metrics after a change
const recomputeRoute = (route, depot) => {
  const points = [depot.location, ...route.stops.map((s) => s.location)];
  const dist = buildDistanceMatrix(points);
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) d += dist[i][i + 1];
  d += dist[points.length - 1][0];
  const demand = route.stops.reduce((s, st) => s + Math.round(st.demandKg || 0), 0);
  return { ...route, totalDistanceM: Math.round(d), totalDemandKg: demand };
};

module.exports = { solveCVRP, prioritizeStops, recomputeRoute, buildDistanceMatrix };
