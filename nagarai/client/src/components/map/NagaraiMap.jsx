import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { CITY_CENTER } from '../../lib/cityConfig';

// Fix default marker icon paths under bundlers (Leaflet images)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let iconsInitialized = false;
function ensureIcons() {
  if (iconsInitialized) return;
  iconsInitialized = true;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
  });
}

// risk -> circle color
const riskColor = (v) => {
  if (v >= 70) return '#EB4C4C';
  if (v >= 40) return '#FFD150';
  return '#7BB35B';
};

// Custom divIcon circle marker, size by value
function binIcon(r, label, value) {
  ensureIcons();
  const color = riskColor(value != null ? value : r);
  const size = 14 + (value != null && value > 0 ? (value / 100) * 14 : 0);
  return L.divIcon({
    className: 'nagarai-bin-icon',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:8px;color:#000;font-weight:700">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// A route stop: colored to match its vehicle's polyline, numbered by visit order.
function routeStopIcon(color, seq) {
  ensureIcons();
  const size = 20;
  return L.divIcon({
    className: 'nagarai-route-stop-icon',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700">${seq}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Depot / disposal facility marker — visually distinct (square, not a circle)
// from bin/stop markers so the route's start/end point reads immediately.
function depotIcon() {
  ensureIcons();
  return L.divIcon({
    className: 'nagarai-depot-icon',
    html: `<div style="width:22px;height:22px;background:#1e293b;border:2px solid #fff;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700">D</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Inside component that has the map ref -> add heat layer imperatively
function HeatLayer({ points, radius = 40, blur = 25, max = 1.0 }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    const pts = (points || []).map((p) => [p.lat, p.lng, p.intensity]);
    if (!layerRef.current) {
      layerRef.current = L.heatLayer(pts, { radius, blur, maxZoom: 15, max, gradient: {
        0.2: '#FFD150', 0.5: '#FF8C42', 0.8: '#E8503A', 1.0: '#C12121',
      } });
      layerRef.current.addTo(map);
    }
    layerRef.current.setLatLngs(pts);
    return () => {
      const layer = layerRef.current;
      if (!layer) return;
      // leaflet.heat schedules redraw() via requestAnimFrame but never cancels
      // it in onRemove — without this, a stale frame fires after teardown and
      // crashes reading getSize() on the now-gone map.
      if (layer._frame) {
        L.Util.cancelAnimFrame(layer._frame);
        layer._frame = null;
      }
      layer.remove();
      layerRef.current = null;
    };
  }, [map, points, radius, blur, max]);

  return null;
}

// Route polyline colors for distinct vehicles/trips. Exported so other UI
// (route/fleet cards) can color-match their own elements to what's on the map.
export const ROUTE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#f59e0b', '#0891b2', '#db2777', '#65a30d'];

/**
 * Real interactive map (Leaflet + OpenStreetMap) with optional heat + routes.
 *
 * Props:
 *  - center           {lat,lng}             default city center (see lib/cityConfig)
 *  - zoom              number
 *  - bins              [{binId, location:{lat,lng}, currentLevel, riskScore}]
 *  - heat              [{lat, lng, intensity}]  optional waste-density heatmap points
 *  - routes            [{stops:[{location}], _color?}]  optional CVRP polylines
 *  - depot             {location:{lat,lng}, name}  optional depot/facility marker
 *  - routeStopMarkers  when true, bins that are route stops render as numbered
 *                       vehicle-colored markers (visit order) instead of the
 *                       generic risk-colored dot — use on a dedicated routes
 *                       map so the stop list and the map read as one thing.
 *  - height            css height string
 */
export default function NagaraiMap({
  center = CITY_CENTER,
  zoom = 14,
  bins = [],
  heat = [],
  routes = [],
  depot = null,
  height = '420px',
  showRoutes = true,
  routeStopMarkers = false,
}) {
  const markers = useMemo(
    () => (bins || []).filter((b) => b.location && b.location.lat != null),
    [bins]
  );

  // binId -> { color, seq } for every stop across all routes, used to make
  // route-stop markers match their vehicle's polyline color + visit order.
  const stopMeta = useMemo(() => {
    if (!routeStopMarkers) return {};
    const map = {};
    (routes || []).forEach((r, ri) => {
      const color = r._color || ROUTE_COLORS[ri % ROUTE_COLORS.length];
      (r.stops || []).forEach((s, si) => {
        if (s.binId) map[s.binId] = { color, seq: si + 1 };
      });
    });
    return map;
  }, [routes, routeStopMarkers]);
  const heatPoints = useMemo(
    () => (heat || []).filter((p) => p && p.lat != null && p.lng != null),
    [heat]
  );
  const routeLines = useMemo(() => {
    if (!showRoutes) return [];
    return (routes || []).map((r, i) => {
      // Prefer the road-following polyline (from OSRM); else fall back to
      // straight lines between stops.
      const points = Array.isArray(r.roadPolyline) && r.roadPolyline.length >= 2
        ? r.roadPolyline.map((p) => [p.lat, p.lng])
        : (r.stops || []).map((s) => [s.location.lat, s.location.lng]);
      return {
        color: r._color || ROUTE_COLORS[i % ROUTE_COLORS.length],
        points,
        road: Array.isArray(r.roadPolyline),
        dist: r.roadDistanceM || r.totalDistanceM,
        dur: r.roadDurationS,
        id: r.vehicle || `route-${i}`,
      };
    }).filter((r) => r.points.length >= 2);
  }, [routes, showRoutes]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      style={{ height, width: '100%', borderRadius: '.5rem', zIndex: 1 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
      {routeLines.map((rl) => (
        <Polyline key={rl.id} positions={rl.points} pathOptions={{ color: rl.color, weight: 4, opacity: 0.85 }} />
      ))}
      {depot && depot.location && depot.location.lat != null && (
        <Marker position={[depot.location.lat, depot.location.lng]} icon={depotIcon()}>
          <Popup>
            <strong>{depot.name || 'Depot'}</strong>
            <div style={{ fontSize: '.8rem' }}>Disposal facility / route start &amp; end</div>
          </Popup>
        </Marker>
      )}
      {markers.map((b) => {
        const meta = stopMeta[b.binId];
        const value = b.riskScore != null ? b.riskScore : b.currentLevel || 0;
        const label = b.short || b.binId || '';
        const icon = meta ? routeStopIcon(meta.color, meta.seq) : binIcon(value, label, value);
        return (
          <Marker key={b.binId || b._id} position={[b.location.lat, b.location.lng]} icon={icon}>
            <Popup>
              <strong>{b.binId || 'Bin'}</strong>
              <div style={{ fontSize: '.8rem' }}>
                Zone: {b.zone || '—'} <br />
                Level: {b.currentLevel != null ? `${b.currentLevel}%` : '—'}
                {b.riskScore != null && <> · Risk: {b.riskScore}</>}
                {meta && <><br />Stop #{meta.seq} on this route</>}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
