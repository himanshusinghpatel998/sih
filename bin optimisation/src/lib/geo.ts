import type { Position } from "./types"

export const R_EARTH = 6371000

export function toRad(x: number): number {
  return (x * Math.PI) / 180
}

/** Great-circle distance between two lat/lon points in metres. */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.sqrt(h))
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Weighted random pick from an array. */
export function choice<T>(arr: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i]
    if (r <= 0) return arr[i]
  }
  return arr[arr.length - 1]
}

export function fmt(n: number, d = 0): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  })
}

export function centroidOf(points: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length
  return { lat, lon }
}

/** Shoelace polygon area in m² using local equirectangular projection around a centroid latitude. */
export function polygonAreaM2(points: { lat: number; lon: number }[], centerLat: number): number {
  if (points.length < 3) return 120
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)
  const xy = points.map((p) => [p.lon * mPerDegLon, p.lat * mPerDegLat])
  let a = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i]
    const [x2, y2] = xy[(i + 1) % xy.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.max(20, Math.abs(a) / 2)
}

export function toPosition(p: { lat: number; lon: number }): Position {
  return [p.lat, p.lon]
}

/** Ray-casting point-in-polygon test. Vertices are [lat, lon]. */
export function pointInPolygon(pt: Position, polygon: Position[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1]
    const yi = polygon[i][0]
    const xj = polygon[j][1]
    const yj = polygon[j][0]
    const intersect =
      yi > pt[0] !== yj > pt[0] && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Bounding box of a polygon -> [south, west, north, east]. */
export function polygonBBox(polygon: Position[]): [number, number, number, number] {
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const [lat, lon] of polygon) {
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lon < west) west = lon
    if (lon > east) east = lon
  }
  return [south, west, north, east]
}

/** Centroid of a polygon's vertex ring (arithmetic mean, fine for small areas). */
export function polygonCentroid(polygon: Position[]): Position {
  const lat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const lon = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  return [lat, lon]
}
