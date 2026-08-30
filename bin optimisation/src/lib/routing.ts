import type { Bin, CollectionCenter, Position, Route, RouteParams } from "./types"
import { haversine } from "./geo"

export const DEFAULT_ROUTE: RouteParams = {
  truckCapacity: 3000,
  numTrucks: 3,
  fillGate: 0.3,
}

export const DEFAULT_DEPOT: Position = [13.0206, 74.7866]

/** Nearest collection centre (or depot fallback) for a point. */
function dumpTarget(
  from: { lat: number; lon: number },
  centers: CollectionCenter[],
  depot: Position
): { lat: number; lon: number; label: string } {
  let best = { lat: depot[0], lon: depot[1], label: "Depot" }
  let bestD = haversine(from, { lat: depot[0], lon: depot[1] })
  for (const c of centers) {
    const d = haversine(from, c)
    if (d < bestD) {
      bestD = d
      best = { lat: c.lat, lon: c.lon, label: c.id }
    }
  }
  return best
}

/**
 * Capacitated nearest-neighbour CVRP heuristic. Bins above the fill gate are
 * served by `numTrucks` trucks, each leaving the depot and dumping at the
 * nearest collection centre (or the depot when no centres exist).
 */
export function buildRoutesHaversine(
  bins: Bin[],
  centers: CollectionCenter[],
  params: RouteParams,
  depot: Position
): Route[] {
  const eligible = bins
    .filter((b) => b.fillRatio >= params.fillGate)
    .map((b) => ({ ...b, volume: b.fillRatio * b.capacity }))
  const unvisited = [...eligible]
  const built: Route[] = []

  for (let t = 0; t < params.numTrucks && unvisited.length > 0; t++) {
    const stops: Route["stops"] = []
    let load = 0
    let cur = { lat: depot[0], lon: depot[1] }
    let totalDist = 0
    while (unvisited.length > 0) {
      let bestIdx = -1
      let bestD = Infinity
      for (let i = 0; i < unvisited.length; i++) {
        if (load + unvisited[i].volume > params.truckCapacity) continue
        const d = haversine(cur, unvisited[i])
        if (d < bestD) {
          bestD = d
          bestIdx = i
        }
      }
      if (bestIdx === -1) break
      const next = unvisited.splice(bestIdx, 1)[0]
      totalDist += bestD
      load += next.volume
      cur = next
      stops.push({
        id: next.id,
        lat: next.lat,
        lon: next.lon,
        capacity: next.capacity,
        fillRatio: next.fillRatio,
        volume: next.volume,
      })
    }
    const target = dumpTarget(cur, centers, depot)
    totalDist += haversine(cur, target)
    if (stops.length > 0) {
      built.push({
        truckId: "T" + (t + 1),
        stops,
        load,
        distance: totalDist,
        duration: 0,
        path: null,
        mode: "straight-line",
        endLabel: target.label,
      })
    }
  }
  return built
}

/** Fetch a real road-following route + distance/duration from OSRM. */
export async function getOSRMRoute(
  depot: Position,
  stops: { lat: number; lon: number }[],
  end: { lat: number; lon: number }
): Promise<{ coordinates: Position[]; distance: number; duration: number }> {
  const coords = [depot, ...stops.map((s) => [s.lat, s.lon] as Position), [end.lat, end.lon] as Position]
    .map((p) => `${p[1]},${p[0]}`)
    .join(";")
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error("OSRM HTTP " + res.status)
  const json = (await res.json()) as {
    code?: string
    routes?: { geometry?: { coordinates?: [number, number][] }; distance?: number; duration?: number }[]
  }
  if (json.code !== "Ok" || !json.routes || !json.routes[0]) throw new Error("OSRM: no route")
  const r = json.routes[0]
  return {
    coordinates: (r.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon] as Position),
    distance: r.distance || 0,
    duration: r.duration || 0,
  }
}

/** Solve the CVRP synchronously, then fetch real paths for each truck. */
export async function optimizeRoutesLive(
  bins: Bin[],
  centers: CollectionCenter[],
  params: RouteParams,
  depot: Position
): Promise<Route[]> {
  const routes = buildRoutesHaversine(bins, centers, params, depot)
  if (routes.length === 0) return routes
  await Promise.all(
    routes.map(async (r) => {
      const target = dumpTarget(
        { lat: r.stops[r.stops.length - 1].lat, lon: r.stops[r.stops.length - 1].lon },
        centers,
        depot
      )
      try {
        const real = await getOSRMRoute(depot, r.stops, target)
        r.path = real.coordinates
        r.distance = real.distance
        r.duration = real.duration
        r.mode = "osrm"
      } catch {
        r.mode = "straight-line"
      }
    })
  )
  return routes
}
