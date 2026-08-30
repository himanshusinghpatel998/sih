import type { Bin, Building, Metrics, PlacementParams, Position } from "./types"
import { haversine, rand, pointInPolygon } from "./geo"

export const DEFAULT_PLACEMENT: PlacementParams = {
  Dmax: 55,
  capacity: 240,
  maxBins: 60,
  fillThreshold: 0.7,
  autoBins: true,
}

/** Hard ceiling on total (existing + suggested) bins so the map never overflows. */
export const HARD_MAX_BINS = 100

export interface Candidate {
  lat: number
  lon: number
}

/** Jittered candidate grid over the entire service area (not just the centre),
 *  so every trash-producing area has candidate spots and none are missed.
 *  When a `polygon` is given, only candidate spots inside it are kept, so
 *  placement is confined to the selected region. */
export function generateCandidatesForBuildings(
  buildings: Building[],
  spacingM = 34,
  padM = 40,
  polygon?: Position[]
): Candidate[] {
  if (buildings.length === 0) return []
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const b of buildings) {
    if (b.lat < south) south = b.lat
    if (b.lat > north) north = b.lat
    if (b.lon < west) west = b.lon
    if (b.lon > east) east = b.lon
  }
  const centerLat = (south + north) / 2
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)
  const centerLon = (west + east) / 2
  const minX = (west - centerLon) * mPerDegLon - padM
  const maxX = (east - centerLon) * mPerDegLon + padM
  const minY = (south - centerLat) * mPerDegLat - padM
  const maxY = (north - centerLat) * mPerDegLat + padM
  const inArea = (lat: number, lon: number) =>
    !polygon || polygon.length < 3 || pointInPolygon([lat, lon], polygon)
  // Include each building itself so isolated demand always has a reachable spot.
  const candidates: Candidate[] = buildings
    .filter((b) => inArea(b.lat, b.lon))
    .map((b) => ({ lat: b.lat, lon: b.lon }))
  for (let x = minX; x <= maxX; x += spacingM) {
    for (let y = minY; y <= maxY; y += spacingM) {
      const lat = centerLat + (y + rand(-8, 8)) / mPerDegLat
      const lon = centerLon + (x + rand(-8, 8)) / mPerDegLon
      if (inArea(lat, lon)) {
        candidates.push({ lat, lon })
      }
    }
  }
  return candidates
}

/**
 * Greedy MCLP-style placement. Keeps existing real (OSM/manual) bins fixed,
 * then adds suggested bins at the highest-uncovered-demand candidate until
 * the budget (maxBins) or coverage target is met.
 */
export interface PlacementStep {
  binId: string
  lat: number
  lon: number
  coveredPct: number
  unservedPct: number
  gainPct: number
  capacityPct: number
}

export interface PlacementResult {
  bins: Bin[]
  trace: PlacementStep[]
  stopReason: string
}

export interface PlacementMidState {
  bins: Bin[]
  trace: PlacementStep[]
  step: PlacementStep | null
  candidateCount: number
  evaluateCount: number
  currentGainPct: number
  done: boolean
  stopReason?: string
}

/**
 * Steppable greedy MCLP placement. Each `yield` returns the mid-state after one
 * bin is placed (or when scanning completes), so a UI can animate bins onto the
 * map in real time and show the live coverage math. The final yielded state has
 * `done: true` plus a `stopReason`.
 */
export function* placeBinsStepwise(
  buildings: Building[],
  existingBins: Bin[],
  params: PlacementParams,
  coverageTarget = 0.95,
  polygon?: Position[]
): Generator<PlacementMidState, void, void> {
  const candidates = generateCandidatesForBuildings(buildings, 34, 40, polygon)
  const uncovered = new Map(buildings.map((b) => [b.id, b.waste]))
  const totalWeight = buildings.reduce((s, b) => s + b.waste, 0)

  const existing = existingBins.map((b) => ({ ...b }))
  existing.forEach((bin) => {
    let usageBudget = bin.capacity * Math.max(0, params.fillThreshold - (bin.baseFill || 0))
    buildings.forEach((bld) => {
      if (usageBudget <= 0) return
      if (haversine(bld, bin) <= params.Dmax) {
        const rem = uncovered.get(bld.id)!
        const take = Math.min(rem, Math.max(0, usageBudget))
        uncovered.set(bld.id, rem - take)
        usageBudget -= take
      }
    })
  })

  const placed: Bin[] = [...existing]
  // Hard cap the TOTAL (existing + added) at HARD_MAX_BINS so the map never overflows.
  const requestedCap = Math.min(params.maxBins, HARD_MAX_BINS)
  const cap = params.autoBins ? HARD_MAX_BINS : requestedCap
  const budget = Math.max(0, Math.min(cap - existing.length, HARD_MAX_BINS - placed.length))
  const trace: PlacementStep[] = []
  let iterations = 0
  const candidateCount = candidates.length
  const remainingWeight = () => Array.from(uncovered.values()).reduce((s, v) => s + v, 0)

  yield {
    bins: placed,
    trace,
    step: null,
    candidateCount,
    evaluateCount: 0,
    currentGainPct: 0,
    done: false,
  }

  let stopReason = params.autoBins
    ? `auto-selected up to ${HARD_MAX_BINS} bins`
    : `reached max-bins budget of ${params.maxBins}`
  while (iterations < budget && budget > 0) {
    let bestCand: Candidate | null = null
    let bestScore = 0
    let bestCovers: string[] = []
    let evaluateCount = 0
    for (const c of candidates) {
      let score = 0
      const covers: string[] = []
      for (const b of buildings) {
        const rem = uncovered.get(b.id)!
        if (rem <= 0) continue
        if (haversine(c, b) <= params.Dmax) {
          score += rem
          covers.push(b.id)
        }
      }
      evaluateCount++
      if (score > bestScore) {
        bestScore = score
        bestCand = c
        bestCovers = covers
      }
    }

    const gainPct = totalWeight > 0 ? (bestScore / totalWeight) * 100 : 0
    if (!bestCand || gainPct < 0.4) {
      stopReason = !bestCand ? "no candidate covers any remaining demand" : `marginal gain too small (${gainPct.toFixed(2)}%)`
      yield {
        bins: placed,
        trace,
        step: null,
        candidateCount,
        evaluateCount,
        currentGainPct: gainPct,
        done: true,
        stopReason,
      }
      return
    }

    const bin: Bin = {
      id: "BIN" + placed.length,
      lat: bestCand.lat,
      lon: bestCand.lon,
      capacity: params.capacity,
      fillRatio: 0.15 + Math.random() * 0.15,
      allocated: 0,
      baseFill: 0.15 + Math.random() * 0.15,
      source: "suggested",
    }
    placed.push(bin)

    let allocated = 0
    const usageBudget = params.capacity * Math.max(0, params.fillThreshold - bin.baseFill)
    for (const bid of bestCovers) {
      const rem = uncovered.get(bid)!
      const take = Math.min(rem, Math.max(0, usageBudget - allocated))
      allocated += take
      uncovered.set(bid, rem - take)
    }
    iterations++

    const rem = remainingWeight()
    const coveredPct = totalWeight > 0 ? ((totalWeight - rem) / totalWeight) * 100 : 0
    const capacityPct = (allocated / (params.capacity * params.fillThreshold)) * 100
    const step: PlacementStep = {
      binId: bin.id,
      lat: bin.lat,
      lon: bin.lon,
      coveredPct,
      unservedPct: 100 - coveredPct,
      gainPct,
      capacityPct,
    }
    trace.push(step)

    yield {
      bins: placed,
      trace,
      step,
      candidateCount,
      evaluateCount,
      currentGainPct: gainPct,
      done: false,
    }

    if (coveredPct >= coverageTarget * 100) {
      stopReason = `coverage target reached (${coveredPct.toFixed(1)}%)`
      yield {
        bins: placed,
        trace,
        step,
        candidateCount,
        evaluateCount,
        currentGainPct: gainPct,
        done: true,
        stopReason,
      }
      return
    }
  }

  yield {
    bins: placed,
    trace,
    step: trace[trace.length - 1] ?? null,
    candidateCount,
    evaluateCount: 0,
    currentGainPct: 0,
    done: true,
    stopReason,
  }
}

/**
 * Greedy MCLP-style placement. Keeps existing real (OSM/manual) bins fixed,
 * then adds suggested bins at the highest-uncovered-demand candidate until the
 * coverage target, the max-bins budget, or a marginal-gain floor is met.
 * Synchronous wrapper over placeBinsStepwise.
 */
export function placeBinsGreedy(
  buildings: Building[],
  existingBins: Bin[],
  params: PlacementParams,
  centerLat: number,
  centerLon: number,
  coverageTarget = 0.95,
  polygon?: Position[]
): PlacementResult {
  const gen = placeBinsStepwise(buildings, existingBins, params, coverageTarget, polygon)
  void centerLat
  void centerLon
  let last: PlacementMidState | undefined
  for (const m of gen) last = m
  return {
    bins: last?.bins ?? existingBins.map((b) => ({ ...b })),
    trace: last?.trace ?? [],
    stopReason: last?.stopReason ?? "",
  }
}

/**
 * Capacity-aware demand allocation + metrics. Mutates bin.allocated/fillRatio.
 * Returns a fresh Metrics object.
 */
export function recomputeAllocationAndMetrics(
  buildings: Building[],
  bins: Bin[],
  params: PlacementParams
): Metrics {
  bins.forEach((b) => {
    b.allocated = 0
  })
  let unservedWeight = 0
  let totalWeight = 0
  let coveredWeight = 0
  let distSum = 0
  let distN = 0

  buildings.forEach((bld) => {
    totalWeight += bld.waste
    const near = bins
      .map((bin) => ({ bin, d: haversine(bld, bin) }))
      .filter((x) => x.d <= params.Dmax)
      .sort((a, c) => a.d - c.d)
    if (near.length === 0) {
      unservedWeight += bld.waste
      return
    }
    distSum += near[0].d
    distN++
    let remaining = bld.waste
    for (const { bin } of near) {
      if (remaining <= 0) break
      const usageBudget = bin.capacity * Math.max(0, params.fillThreshold - bin.baseFill)
      const capLeft = usageBudget - bin.allocated
      if (capLeft <= 0) continue
      const take = Math.min(remaining, capLeft)
      bin.allocated += take
      remaining -= take
      coveredWeight += take
    }
    if (remaining > 0) unservedWeight += remaining
  })

  bins.forEach((bin) => {
    const raw = bin.baseFill + bin.allocated / bin.capacity
    bin.fillRatio = isNaN(raw) ? bin.baseFill : Math.min(params.fillThreshold, raw)
  })

  const coveragePct = totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0
  const overThreshold = bins.filter((b) => b.fillRatio > 0.85).length
  const underThreshold = bins.filter((b) => b.fillRatio <= 0.7).length

  return {
    totalDemand: totalWeight,
    coveragePct,
    unservedWeight,
    unservedPct: totalWeight > 0 ? (unservedWeight / totalWeight) * 100 : 0,
    numBins: bins.length,
    avgWalk: distN > 0 ? distSum / distN : 0,
    overThreshold,
    underThreshold,
  }
}
