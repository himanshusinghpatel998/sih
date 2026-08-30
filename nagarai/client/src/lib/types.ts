export type Position = [number, number]

export type BuildingType =
  | "residential"
  | "office"
  | "retail"
  | "restaurant"
  | "hotel"
  | "school"

export interface BuildingTypeModel {
  color: string
  rate: number
  unit: string
  occPerFloor: [number, number]
}

export type ViewMode = "heat" | "routes" | "placement" | "predictions"

export type DataSource = "live" | "simulated"

export interface Building {
  id: string
  lat: number
  lon: number
  type: BuildingType
  floors: number
  area: number
  occupancy: number
  footfallIndex: number
  waste: number
}

export interface Bin {
  id: string
  lat: number
  lon: number
  capacity: number
  fillRatio: number
  allocated: number
  baseFill: number
  source: "osm" | "suggested" | "manual"
  amenity?: string
}

/** A transfer/collection station: a large-capacity dump target for trucks. */
export interface CollectionCenter {
  id: string
  lat: number
  lon: number
  capacity: number
  fillRatio: number
  source: "manual" | "osm"
  amenity?: string
}

export interface RouteStop {
  id: string
  lat: number
  lon: number
  capacity: number
  fillRatio: number
  volume: number
}

export interface Route {
  truckId: string
  stops: RouteStop[]
  load: number
  distance: number
  duration: number
  path: Position[] | null
  mode: "osrm" | "straight-line"
  endLabel?: string
}

export interface PlacementParams {
  Dmax: number
  capacity: number
  maxBins: number
  fillThreshold: number
  autoBins: boolean
}

export interface RouteParams {
  truckCapacity: number
  numTrucks: number
  fillGate: number
}

export interface Metrics {
  totalDemand: number
  coveragePct: number
  unservedWeight: number
  unservedPct: number
  numBins: number
  avgWalk: number
  overThreshold: number
  underThreshold: number
}

export interface HeatParams {
  weatherM: number
  eventM: number
}