/**
 * NagarAI Road Routing service.
 *
 * Converts a CVRP stop sequence into a road-following polyline using the free,
 * key-less OSRM demo server (OpenStreetMap-based). Falls back to straight-line
 * haversine segments if OSRM is unreachable, so the API degrades gracefully.
 */

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

// eslint-disable-next-line no-unused-vars
const unused = null; // placeholder

/**
 * Fetch a single road polyline for an ordered list of {lat,lng} waypoints.
 * OSRM expects [lng,lat] and returns GeoJSON coordinates as [lng,lat].
 * @returns {Promise<{coordinates: [number,number][], distanceM, durationS}|null>}
 */
const getRoadPolyline = async (waypoints) => {
  if (!waypoints || waypoints.length < 2) return null;
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson&steps=false`;

  let controller;
  try {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`OSRM HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      throw new Error(`OSRM code ${data.code}`);
    }
    const route = data.routes[0];
    // GeoJSON coords are [lng, lat]; convert to {lat,lng} form used by the map
    const coordinates = (route.geometry?.coordinates || []).map(([lng, lat]) => ({ lat, lng }));
    if (coordinates.length < 2) return null;
    return {
      coordinates,
      distanceM: Math.round(route.distance || 0),
      durationS: Math.round(route.duration || 0),
    };
  } catch (err) {
    return null; // graceful fallback (caller uses haversine straight lines)
  }
};

/**
 * Attach road polylines to CVRP routes (deep-copied). Adds `_color`? no —
 * colors are client-side. Adds:
 *   roadPolyline: [{lat,lng},...]           (through road points)
 *   roadDistanceM, roadDurationS, roadMeters true|false
 *
 * @param {object} depot
 * @param {array}  routes   CVRP routes: [{ vehicle, stops:[{location}] }]
 */
const enrichRoutesWithRoads = async (depot, routes, { concurrency = 3 } = {}) => {
  const result = [];
  const queue = routes.map((r) => ({
    r,
    waypoints: [depot.location, ...(r.stops || []).map((s) => s.location), depot.location],
  }));

  // simple concurrency limiter
  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const { r, waypoints } = queue[idx++];
      const road = await getRoadPolyline(waypoints.filter((w) => w && w.lat != null && w.lng != null));
      result.push({
        ...r,
        roadPolyline: road ? road.coordinates : null,
        roadDistanceM: road ? road.distanceM : null,
        roadDurationS: road ? road.durationS : null,
        roadMeters: !!road,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return result;
};

module.exports = { getRoadPolyline, enrichRoutesWithRoads, OSRM_URL };
