/**
 * Small geospatial helpers (no external deps needed for MVP).
 * Distance is computed with the haversine formula on lat/lng.
 */

const EARTH_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in meters between two {lat, lng} points
const haversineM = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

// Nearest existing bin distance (m) for a location, given a list of bins
const nearestBinDistanceM = (loc, bins) => {
  let min = Infinity;
  for (const b of bins || []) {
    if (!b.location) continue;
    const d = haversineM(loc, b.location);
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
};

module.exports = { haversineM, nearestBinDistanceM };
