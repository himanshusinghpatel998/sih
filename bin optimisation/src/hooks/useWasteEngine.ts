import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  Bin,
  Building,
  CollectionCenter,
  DataSource,
  HeatParams,
  Metrics,
  PlacementParams,
  Position,
  Route,
  RouteParams,
  ViewMode,
} from "@/lib/types"
import { DEFAULT_PLACEMENT, HARD_MAX_BINS, placeBinsStepwise, recomputeAllocationAndMetrics, type PlacementStep, type PlacementMidState } from "@/lib/placement"
import { DEFAULT_ROUTE, DEFAULT_DEPOT, optimizeRoutesLive } from "@/lib/routing"
import { projectBins, type Prediction } from "@/lib/predict"
import { recomputeDemand } from "@/lib/generation"
import { fetchLiveOSM, simulateDataset } from "@/lib/data"
import { polygonBBox, pointInPolygon } from "@/lib/geo"

export interface DataStatus {
  kind: "live" | "simulated" | "loading" | "error"
  badge: string
  detail: string
}

export interface Engine {
  view: ViewMode
  setView: (v: ViewMode) => void
  buildings: Building[]
  bins: Bin[]
  centers: CollectionCenter[]
  routes: Route[]
  depot: Position
  setDepot: (p: Position) => void
  metrics: Metrics
  heat: HeatParams
  setHeat: (h: HeatParams) => void
  placement: PlacementParams
  setPlacement: (p: PlacementParams) => void
  routeParams: RouteParams
  setRouteParams: (r: RouteParams) => void
  forecastHours: number
  setForecastHours: (n: number) => void
  projections: Prediction[]
  dataStatus: DataStatus
  dataSource: DataSource
  selected: string | null
  setSelected: (id: string | null) => void
  fetchLive: (bounds: { south: number; west: number; north: number; east: number }, polygon?: Position[]) => Promise<void>
  useDemo: () => void
  runPlacement: () => void
  resetPlacement: () => void
  placementTrace: PlacementStep[]
  placementStopReason: string
  runRoutes: () => Promise<void>
  updateBinPosition: (id: string, pos: Position) => void
  addBinAt: (pos: Position) => void
  removeBin: (id: string) => void
  regenArea: () => void
  recompute: () => void
  addCenterAt: (pos: Position) => void
  removeCenter: (id: string) => void
  polygon: Position[] | null
  setPolygon: (p: Position[] | null) => void
  drawMode: boolean
  setDrawMode: (b: boolean) => void
  centerMode: boolean
  setCenterMode: (b: boolean) => void
  showHeatmap: boolean
  setShowHeatmap: (b: boolean) => void
  showBubbles: boolean
  setShowBubbles: (b: boolean) => void
  showCoverage: boolean
  setShowCoverage: (b: boolean) => void
  loadPolygonArea: () => Promise<void>
  processing: boolean
  processingLabel: string
  progressPct: number
}

const EMPTY_METRICS: Metrics = {
  totalDemand: 0,
  coveragePct: 0,
  unservedWeight: 0,
  unservedPct: 0,
  numBins: 0,
  avgWalk: 0,
  overThreshold: 0,
  underThreshold: 0,
}

export const NITK_CENTER = { lat: 13.0092, lon: 74.7937 }

export function useWasteEngine(): Engine {
  const [view, setView] = useState<ViewMode>("heat")
  const [buildings, setBuildings] = useState<Building[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS)
  const [heat, setHeat] = useState<HeatParams>({ weatherM: 1.0, eventM: 1.15 })
  const [placement, setPlacement] = useState<PlacementParams>(DEFAULT_PLACEMENT)
  const [routeParams, setRouteParams] = useState<RouteParams>(DEFAULT_ROUTE)
  const [depot, setDepot] = useState<Position>(DEFAULT_DEPOT)
  const [forecastHours, setForecastHours] = useState(0)
  const [dataStatus, setDataStatus] = useState<DataStatus>({
    kind: "loading",
    badge: "LOADING",
    detail: "Fetching live OSM data for NITK Surathkal…",
  })
  const [dataSource, setDataSource] = useState<DataSource>("live")
  const [selected, setSelected] = useState<string | null>(null)
  const [placementTrace, setPlacementTrace] = useState<PlacementStep[]>([])
  const [placementStopReason, setPlacementStopReason] = useState("")
  const [centers, setCenters] = useState<CollectionCenter[]>([])
  const [polygon, setPolygon] = useState<Position[] | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [centerMode, setCenterMode] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showBubbles, setShowBubbles] = useState(true)
  const [showCoverage, setShowCoverage] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [processingLabel, setProcessingLabel] = useState("")
  const [progressPct, setProgressPct] = useState(0)

  // Keep latest values readable inside async callbacks (synced in an effect).
  const buildingsRef = useRef(buildings)
  const binsRef = useRef(bins)
  const heatRef = useRef(heat)
  const placementRef = useRef(placement)
  const routeParamsRef = useRef(routeParams)
  const depotRef = useRef(depot)
  const centersRef = useRef(centers)

  useEffect(() => {
    buildingsRef.current = buildings
    binsRef.current = bins
    heatRef.current = heat
    placementRef.current = placement
    routeParamsRef.current = routeParams
    depotRef.current = depot
    centersRef.current = centers
  }, [buildings, bins, heat, placement, routeParams, depot, centers])

  /** Recalculate demand (multipliers) + allocation + metrics in one pass. */
  const recomputeAll = useCallback((bds: Building[], bis: Bin[]) => {
    recomputeDemand(bds, heatRef.current)
    const m = recomputeAllocationAndMetrics(bds, bis, placementRef.current)
    setMetrics(m)
    return m
  }, [])

  const recompute = useCallback(() => {
    recomputeAll(buildingsRef.current, binsRef.current)
  }, [recomputeAll])

  const loadInitialData = useCallback(async () => {
    try {
      const { result, detail } = await fetchLiveOSM(
        NITK_CENTER.lat - 0.006,
        NITK_CENTER.lon - 0.007,
        NITK_CENTER.lat + 0.006,
        NITK_CENTER.lon + 0.007
      )
      recomputeDemand(result.buildings, heatRef.current)
      setBuildings(result.buildings)
      setBins(result.bins)
      setCenters(result.centers)
      setDataSource("live")
      setDataStatus({ kind: "live", badge: "LIVE OSM DATA", detail })
      const m = recomputeAllocationAndMetrics(result.buildings, result.bins, placementRef.current)
      setMetrics(m)
      setRoutes([])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const sim = simulateDataset(heatRef.current)
      setBuildings(sim.buildings)
      setBins([])
      setCenters([])
      setDataSource("simulated")
      setDataStatus({
        kind: "simulated",
        badge: "SIMULATED DATA",
        detail: `Live fetch unavailable (${msg}). Using simulated NITK dataset.`,
      })
      setMetrics(recomputeAllocationAndMetrics(sim.buildings, [], placementRef.current))
      setRoutes([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void loadInitialData(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchLive = useCallback(
    async (
      bounds: { south: number; west: number; north: number; east: number },
      poly?: Position[]
    ) => {
      setDataStatus({ kind: "loading", badge: "LOADING", detail: "Querying Overpass API…" })
      try {
        const { result, detail } = await fetchLiveOSM(bounds.south, bounds.west, bounds.north, bounds.east, poly)
        recomputeDemand(result.buildings, heatRef.current)
        setBuildings(result.buildings)
        setBins(result.bins)
        setCenters(result.centers)
        setDataSource("live")
        setDataStatus({ kind: "live", badge: "LIVE OSM DATA", detail })
        setMetrics(recomputeAllocationAndMetrics(result.buildings, result.bins, placementRef.current))
        setRoutes([])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setDataStatus({ kind: "error", badge: "FETCH FAILED", detail: msg })
        throw err
      }
    },
    []
  )

  const useDemo = useCallback(() => {
    const sim = simulateDataset(heatRef.current)
    setBuildings(sim.buildings)
    setBins([])
    setCenters([])
    setDataSource("simulated")
    setDataStatus({
      kind: "simulated",
      badge: "SIMULATED DATA",
      detail: "Demo dataset for NITK Surathkal (no live source).",
    })
    setMetrics(recomputeAllocationAndMetrics(sim.buildings, [], placementRef.current))
    setRoutes([])
  }, [])

  const runPlacement = useCallback(() => {
    setRoutes([])
    setProcessing(true)
    setProcessingLabel("Pipeline step 1/4 — scoring trash demand…")
    setProgressPct(0)
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      // Keep only non-suggested bins so placement can rebuild cleanly.
      // When a region polygon is active, keep only bins inside it so placement
      // stays confined to the selected area.
      let base = binsRef.current.filter((b) => b.source !== "suggested")
      if (polygon && polygon.length >= 3) {
        base = base.filter((b) => pointInPolygon([b.lat, b.lon], polygon))
      }
      setBins(base)
      // Intentional perception delay before heavy work starts.
      await delay(500)
      setProcessingLabel("Pipeline step 2/4 — building candidate spots across every trash area…")
      await delay(600)
      const gen = placeBinsStepwise(
        buildingsRef.current,
        base,
        placementRef.current,
        0.95,
        polygon ?? undefined
      )
      let last: PlacementMidState | undefined
      for (const m of gen) {
        last = m
        setBins(m.bins)
        setPlacementTrace(m.trace)
        if (m.step) {
          setProcessingLabel(
            `Pipeline step 3/4 — placing bin ${m.bins.length} · +${m.step.gainPct.toFixed(1)}% gain · ${m.step.coveredPct.toFixed(0)}% covered`
          )
          setProgressPct(m.step.coveredPct)
          setMetrics(recomputeAllocationAndMetrics(buildingsRef.current, m.bins, placementRef.current))
          await delay(150)
        } else {
          setProcessingLabel(`Scanning ${m.candidateCount} candidate spots…`)
          await delay(350)
        }
      }
      setProcessingLabel("Pipeline step 4/4 — verifying coverage across all buildings…")
      await delay(600)
      if (last) {
        setPlacementStopReason(last.stopReason ?? "")
        setMetrics(recomputeAllocationAndMetrics(buildingsRef.current, last.bins, placementRef.current))
      }
      setProcessing(false)
      setProcessingLabel("")
      setProgressPct(100)
    })()
  }, [polygon])

  const resetPlacement = useCallback(() => {
    setBins((prev) => {
      const next = prev.filter((b) => b.source !== "suggested")
      setMetrics(recomputeAllocationAndMetrics(buildingsRef.current, next, placementRef.current))
      return next
    })
    setPlacementTrace([])
    setPlacementStopReason("")
    setRoutes([])
  }, [])

  const runRoutes = useCallback(async () => {
    setDataStatus({ kind: "loading", badge: "ROUTING", detail: "Solving CVRP heuristic…" })
    const optimized = await optimizeRoutesLive(
      binsRef.current,
      centersRef.current,
      routeParamsRef.current,
      depotRef.current
    )
    setRoutes(optimized)
    setDataStatus({ kind: "live", badge: "ROUTES SOLVED", detail: "Real street-network routes (OSRM)." })
  }, [])

  const updateBinPosition = useCallback((id: string, pos: Position) => {
    setBins((prev) => prev.map((b) => (b.id === id ? { ...b, lat: pos[0], lon: pos[1] } : b)))
  }, [])

  const addBinAt = useCallback((pos: Position) => {
    setBins((prev) => {
      if (prev.length >= HARD_MAX_BINS) return prev
      const nb: Bin = {
        id: "BIN" + Date.now(),
        lat: pos[0],
        lon: pos[1],
        capacity: placementRef.current.capacity,
        fillRatio: 0.1,
        allocated: 0,
        baseFill: 0.1,
        source: "manual",
      }
      const next = [...prev, nb]
      setMetrics(recomputeAllocationAndMetrics(buildingsRef.current, next, placementRef.current))
      return next
    })
  }, [])

  const removeBin = useCallback((id: string) => {
    setBins((prev) => {
      const next = prev.filter((b) => b.id !== id)
      setMetrics(recomputeAllocationAndMetrics(buildingsRef.current, next, placementRef.current))
      return next
    })
    setRoutes([])
  }, [])

  const regenArea = useCallback(() => {
    const sim = simulateDataset(heatRef.current)
    setBuildings(sim.buildings)
    setBins([])
    setCenters([])
    setMetrics(recomputeAllocationAndMetrics(sim.buildings, [], placementRef.current))
    setRoutes([])
  }, [])

  const addCenterAt = useCallback((pos: Position) => {
    setCenters((prev) => [
      ...prev,
      {
        id: "CC" + Date.now(),
        lat: pos[0],
        lon: pos[1],
        capacity: 6600,
        fillRatio: 0.2,
        source: "manual",
      },
    ])
  }, [])

  const removeCenter = useCallback((id: string) => {
    setCenters((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const loadPolygonArea = useCallback(async () => {
    if (!polygon || polygon.length < 3) {
      setDataStatus({ kind: "error", badge: "SELECT AREA", detail: "Draw a polygon with at least 3 points first." })
      return
    }
    const [south, west, north, east] = polygonBBox(polygon)
    await fetchLive({ south, west, north, east }, polygon)
  }, [polygon, fetchLive])

  const projections = useMemo(() => projectBins(bins, forecastHours), [bins, forecastHours])

  return {
    view,
    setView,
    buildings,
    bins,
    routes,
    depot,
    setDepot,
    metrics,
    heat,
    setHeat,
    placement,
    setPlacement,
    routeParams,
    setRouteParams,
    forecastHours,
    setForecastHours,
    projections,
    dataStatus,
    dataSource,
    selected,
    setSelected,
    fetchLive,
    useDemo,
    runPlacement,
    resetPlacement,
    placementTrace,
    placementStopReason,
    runRoutes,
    updateBinPosition,
    addBinAt,
    removeBin,
    regenArea,
    recompute,
    addCenterAt,
    removeCenter,
    polygon,
    setPolygon,
    drawMode,
    setDrawMode,
    centerMode,
    setCenterMode,
    showHeatmap,
    setShowHeatmap,
    showBubbles,
    setShowBubbles,
    showCoverage,
    setShowCoverage,
    centers,
    loadPolygonArea,
    processing,
    processingLabel,
    progressPct,
  }
}
