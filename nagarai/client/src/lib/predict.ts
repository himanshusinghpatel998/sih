import type { Bin } from "./types"

/**
 * Linear fill forecast. Assumes each bin fills at the daily rate implied by
 * its current allocation (fraction of capacity per day). `hours` ahead.
 */
export function forecastFillRatio(bin: Bin, hours: number): number {
  const dailyRate = (bin.allocated || 0) / bin.capacity
  return Math.min(1.4, bin.fillRatio + dailyRate * (hours / 24))
}

/** Hours until a bin reaches 100% fill; null if it isn't filling. */
export function overflowETA(bin: Bin): number | null {
  const dailyRate = (bin.allocated || 0) / bin.capacity
  if (dailyRate <= 0.0001) return null
  const hoursTo1 = ((1 - bin.fillRatio) / dailyRate) * 24
  return hoursTo1 > 0 ? hoursTo1 : 0
}

export interface Prediction {
  bin: Bin
  proj: number
  eta: number | null
  overflow: boolean
  warning: boolean
}

/** Project every bin forward `hours` and classify alerts. */
export function projectBins(bins: Bin[], hours: number): Prediction[] {
  return bins.map((bin) => {
    const proj = forecastFillRatio(bin, hours)
    const eta = overflowETA(bin)
    const overflow = proj >= 1 || (eta !== null && eta <= hours)
    const warning = proj >= 0.85 && proj < 1
    return { bin, proj, eta, overflow, warning }
  })
}
