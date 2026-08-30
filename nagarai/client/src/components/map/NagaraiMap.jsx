import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

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
    return () => { if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; } };
  }, [map, points, radius, blur, max]);

  return null;
}

// Route polyline colors for distinct vehicles/trips
const ROUTE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#f59e0b', '#0891b2', '#db2777', '#65a30d'];

/**
 * Real interactive map (Leaflet + OpenStreetMap) with optional heat + routes.
 *
 * Props:
 *  - center      {lat,lng}             default NagarCity
 *  - zoom        number
 *  - bins        [{binId, location:{lat,lng}, currentLevel, riskScore}]
 *  - heat        [{lat, lng, intensity}]  optional waste-density heatmap points
 *  - routes      [{stops:[{location}], _color?}]  optional CVRP polylines
 *  - height      css height string
 */
export default function NagaraiMap({
  center = { lat: 19.076, lng: 72.8777 },
  zoom = 14,
  bins = [],
  heat = [],
  routes = [],
  height = '420px',
  showRoutes = true,
}) {
  const markers = useMemo(
    () => (bins || []).filter((b) => b.location && b.location.lat != null),
    [bins]
  );
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
      {markers.map((b) => {
        const value = b.riskScore != null ? b.riskScore : b.currentLevel || 0;
        const label = b.short || b.binId || '';
        return (
          <Marker key={b.binId || b._id} position={[b.location.lat, b.location.lng]} icon={binIcon(value, label, value)}>
            <Popup>
              <strong>{b.binId || 'Bin'}</strong>
              <div style={{ fontSize: '.8rem' }}>
                Zone: {b.zone || '—'} <br />
                Level: {b.currentLevel != null ? `${b.currentLevel}%` : '—'}
                {b.riskScore != null && <> · Risk: {b.riskScore}</>}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
