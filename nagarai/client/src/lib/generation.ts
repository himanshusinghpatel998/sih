import type { Building, HeatParams } from "./types"
import { BUILDING_TYPES } from "./model"

/**
 * Trash-generation engine.
 *   G_i = (P_i × B_w) × M_footfall × M_weather × M_events × M_day
 * where P_i is building occupancy, B_w the type baseline rate, and the M's
 * are percentage multipliers.
 */
export function applyDayOfWeekMultiplier(type: string, weekend: boolean): number {
  if (weekend) {
    if (type === "office") return 0.3
    if (type === "retail" || type === "restaurant") return 1.35
    return 1.15
  }
  if (type === "office") return 1.2
  if (type === "retail" || type === "restaurant") return 0.9
  return 1.0
}

/** Recompute each building's daily waste score using the multiplier stack. */
export function recomputeDemand(
  buildings: Building[],
  heat: HeatParams,
  now: Date = new Date()
): void {
  const dow = now.getDay()
  const weekend = dow === 0 || dow === 6
  buildings.forEach((b) => {
    const meta = BUILDING_TYPES[b.type]
    const dowM = applyDayOfWeekMultiplier(b.type, weekend)
    const footfallM = 1 + 0.5 * b.footfallIndex
    b.waste = b.occupancy * meta.rate * heat.weatherM * heat.eventM * footfallM * dowM
  })
}

/** Heatmap weight in [0,1] for a building's waste score. */
export function heatWeight(waste: number): number {
  const floor = 15 // kg/day that maps to full red
  return Math.min(1, waste / floor)
}
