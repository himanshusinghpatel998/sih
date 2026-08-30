import type { Bin, Building, CollectionCenter, DataSource, HeatParams, Position } from "./types"
import { rand, choice, haversine, polygonAreaM2, centroidOf, pointInPolygon } from "./geo"
import { BUILDING_TYPES, TYPE_KEYS, TYPE_WEIGHTS, osmTypeToModel, defaultFloorsFor } from "./model"
import { recomputeDemand } from "./generation"

/** NITK Surathkal, Mangalore — default pilot locality (campus centre, 13°0'33"N 74°47'37"E). */
export const CENTER = { lat: 13.0092, lon: 74.7937 }

export const MAX_LIVE_BUILDINGS = 2500
export const MAX_BBOX_KM2 = 25

export interface FetchResult {
  buildings: Building[]
  bins: Bin[]
  centers: CollectionCenter[]
}

export function emptyFetch(): FetchResult {
  return { buildings: [], bins: [], centers: [] }
}

/** Build a raw (waste unset) building record from core fields. */
function makeBuilding(
  buildings: Building[],
  id: string,
  lat: number,
  lon: number,
  type: Building["type"],
  floors: number,
  area: number,
  occupancy: number,
  footfallIndex: number
): Building {
  const b: Building = {
    id,
    lat,
    lon,
    type,
    floors,
    area,
    occupancy,
    footfallIndex,
    waste: 0,
  }
  buildings.push(b)
  return b
}

/** Deterministic-ish simulated NITK-shaped building set (offline fallback). */
export function generateBuildings(n = 320): Building[] {
  const out: Building[] = []
  for (let i = 0; i < n; i++) {
    const clusterAngle = Math.random() * Math.PI * 2
    const clusterR = Math.pow(Math.random(), 0.6) * 480
    const dLat = (clusterR * Math.cos(clusterAngle)) / 111320
    const dLon =
      (clusterR * Math.sin(clusterAngle)) / (111320 * Math.cos((CENTER.lat * Math.PI) / 180))
    const type = choice<Building["type"]>(TYPE_KEYS, TYPE_WEIGHTS)
    const meta = BUILDING_TYPES[type]
    const floors = type === "residential" ? Math.round(rand(2, 8)) : Math.round(rand(1, 4))
    const area = rand(80, 260)
    let occupancy: number
    if (meta.unit === "m2") {
      occupancy = area * floors
    } else {
      occupancy = Math.round(rand(meta.occPerFloor[0], meta.occPerFloor[1]) * floors)
    }
    const footfallIndex = Math.max(0, 1 - clusterR / 480) * rand(0.6, 1.0)
    makeBuilding(
      out,
      "B" + i,
      CENTER.lat + dLat,
      CENTER.lon + dLon,
      type,
      floors,
      area,
      occupancy,
      footfallIndex
    )
  }
  return out
}

/** Fetch real buildings + existing bins from Overpass for the current map bounds. */
export async function fetchLiveOSM(
  south: number,
  west: number,
  north: number,
  east: number,
  polygon?: Position[]
): Promise<{ result: FetchResult; detail: string }> {
  const areaKm2 =
    (haversine({ lat: south, lon: west }, { lat: south, lon: east }) *
      haversine({ lat: south, lon: west }, { lat: north, lon: west })) /
    1e6

  if (areaKm2 > MAX_BBOX_KM2) {
    throw new Error(
      `View too large (${areaKm2.toFixed(2)} km²) — zoom in below ${MAX_BBOX_KM2} km²`
    )
  }

  const query = `[out:json][timeout:40][bbox:${south},${west},${north},${east}];
(
  way["building"];
  node["amenity"="waste_basket"];
  node["amenity"="recycling"];
  node["amenity"="waste_disposal"];
);
out geom;`

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
  })
  if (!res.ok) throw new Error("Overpass HTTP " + res.status)
  const json = (await res.json()) as { elements?: OverpassElement[] }

  const newBuildings: Building[] = []
  const newBins: Bin[] = []
  const newCenters: CollectionCenter[] = []

  ;(json.elements || []).forEach((el) => {
    if (el.type === "way" && el.tags?.building && el.geometry && el.geometry.length >= 3) {
      const pts = el.geometry.map((g) => ({ lat: g.lat, lon: g.lon }))
      const c = centroidOf(pts)
      if (polygon && !pointInPolygon([c.lat, c.lon], polygon)) return
      const type = osmTypeToModel(el.tags)
      const meta = BUILDING_TYPES[type]
      const levels = parseInt(el.tags["building:levels"] ?? "", 10) || defaultFloorsFor(type)
      const area = polygonAreaM2(pts, c.lat)
      let occupancy: number
      if (meta.unit === "m2") {
        occupancy = area * levels
      } else {
        const density = { person: 0.035, seat: 0.06, room: 0.03, student: 0.12 }[meta.unit] || 0.03
        occupancy = Math.max(1, Math.round(area * levels * density))
      }
      makeBuilding(
        newBuildings,
        "osm" + el.id,
        c.lat,
        c.lon,
        type,
        levels,
        area,
        occupancy,
        Math.random() * 0.5 + (type === "retail" || type === "restaurant" ? 0.3 : 0)
      )
    }
    if (
      el.type === "node" &&
      el.tags?.amenity &&
      ["waste_basket", "recycling", "waste_disposal"].includes(el.tags.amenity)
    ) {
      if (polygon && !pointInPolygon([el.lat!, el.lon!], polygon)) return
      const capacity =
        el.tags.amenity === "waste_basket"
          ? 50
          : el.tags.amenity === "recycling"
            ? 1100
            : 660
      if (el.tags.amenity === "waste_basket") {
        newBins.push({
          id: "osm-bin-" + el.id,
          lat: el.lat!,
          lon: el.lon!,
          capacity,
          fillRatio: 0.1 + Math.random() * 0.15,
          allocated: 0,
          baseFill: 0.1 + Math.random() * 0.15,
          source: "osm",
          amenity: el.tags.amenity,
        })
      } else {
        newCenters.push({
          id: "osm-center-" + el.id,
          lat: el.lat!,
          lon: el.lon!,
          capacity,
          fillRatio: 0.1 + Math.random() * 0.2,
          source: "osm",
          amenity: el.tags.amenity,
        })
      }
    }
  })

  if (newBuildings.length === 0) {
    throw new Error("No tagged buildings in this view — try a denser OSM area")
  }

  let sampled = newBuildings
  if (sampled.length > MAX_LIVE_BUILDINGS) {
    sampled = [...newBuildings].sort(() => Math.random() - 0.5).slice(0, MAX_LIVE_BUILDINGS)
  }

  return {
    result: { buildings: sampled, bins: newBins, centers: newCenters },
    detail: `${sampled.length} buildings${newBuildings.length > MAX_LIVE_BUILDINGS ? ` (sampled from ${newBuildings.length})` : ""} · ${newBins.length} bins · ${newCenters.length} collection centres`,
  }
}

/**
 * Build a fully-simulated dataset centered on NITK. Returns buildings with
 * waste computed, ready for placement/routing/prediction.
 */
export function simulateDataset(heat: HeatParams): { buildings: Building[]; bins: Bin[]; centers: CollectionCenter[] } {
  const buildings = generateBuildings(360)
  recomputeDemand(buildings, heat)
  return { buildings, bins: [], centers: [] }
}

export type { HeatParams, DataSource }

interface NodeGeometry {
  lat: number
  lon: number
}

interface OverpassElement {
  type: "node" | "way"
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: NodeGeometry[]
}
