import * as L from "leaflet"
import type { Bin } from "@/lib/types"

/** Fill-ratio icon colour for a bin: ≤70% green, 70–85% yellow, >85% red. */
export function binFillColor(ratio: number): string {
  if (ratio > 0.85) return "#e4572e" // >85% red
  if (ratio > 0.7) return "#f2a93b" // 70–85% yellow
  return "#2a9d8f" // ≤70% green
}

export function binDivIcon(ratio: number, source: string, projected = false): L.DivIcon {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  const color = binFillColor(ratio)
  const border = source === "osm" ? "2px solid #fff" : "2px solid #0e1112"
  const label = projected ? "" : String(Math.round(pct))
  const ring = `conic-gradient(${color} ${pct}%, rgba(10,14,17,0.22) ${pct}% 100%)`
  return L.divIcon({
    className: "",
    html: `<div class="bin-pin-ring" style="background:${ring};border:${border}">
      <div class="bin-pin-core" style="background:${color}">${label}</div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

export function stopDivIcon(seq: number, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="stop-pin" style="border-color:${color}">${seq}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

export function depotDivIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="depot-pin"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export function centerDivIcon(fill: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="center-pin"><b>${Math.round(fill * 100)}%</b></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

export const ROUTE_PALETTE = ["#3478f6", "#2a9d8f", "#7d6fae", "#e76f51", "#8fbf6a", "#d97b4a"]

export type { Bin }
