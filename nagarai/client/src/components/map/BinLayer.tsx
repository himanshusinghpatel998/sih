import type { Bin, Building, Position } from "@/lib/types"
import * as L from "leaflet"
import { useEffect } from "react"
import { Marker, Tooltip, useMap, useMapEvents } from "react-leaflet"
import { binDivIcon, binFillColor } from "./icons"
import { haversine, fmt } from "@/lib/geo"

interface Props {
  bins: Bin[]
  interactive: boolean
  onClickBin: (id: string) => void
  onMoveBin: (id: string, pos: Position) => void
  onClickMap: (pos: Position) => void
  projectedFill?: (id: string) => number | undefined
  coverageRadius?: number
  buildings: Building[]
}

/** For every bin, find the buildings within its catchment (Dmax) + their total trash. */
function binCatchment(
  bin: Bin,
  buildings: Building[],
  dmax: number
): { count: number; demand: number } {
  let count = 0
  let demand = 0
  for (const b of buildings) {
    if (haversine(b, bin) <= dmax) {
      count++
      demand += b.waste
    }
  }
  return { count, demand }
}

/** Map click handler to add a bin (placement view) or move depot (routes view). */
function MapInteractions({
  onClickMap,
}: {
  onClickMap: (pos: Position) => void
}) {
  useMapEvents({
    click(e) {
      onClickMap([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

/** Filled coverage bubbles centred on each bin, sized/coloured to show what it serves. */
function CoverageLayer({
  bins,
  radius,
  buildings,
}: {
  bins: Bin[]
  radius: number
  buildings: Building[]
}) {
  const map = useMap()
  useEffect(() => {
    const layer = L.layerGroup()
    bins.forEach((bin) => {
      const { count, demand } = binCatchment(bin, buildings, radius)
      const color = binFillColor(bin.fillRatio)
      const c = L.circle([bin.lat, bin.lon], {
        radius,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.1,
      })
      c.bindTooltip(
        `<b>${bin.id}</b> — service zone (${radius} m)<br/>` +
          `<b>${count}</b> buildings in range · ~<b>${fmt(Math.round(demand))} kg/day</b> generated here<br/>` +
          `fill ${(bin.fillRatio * 100).toFixed(0)}% (${fmt(Math.round(bin.allocated))} / ${fmt(bin.capacity)} L)`,
        { sticky: true }
      )
      c.addTo(layer)
    })
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, bins, radius, buildings])
  return null
}

export function BinLayer({
  bins,
  interactive,
  onClickBin,
  onMoveBin,
  onClickMap,
  projectedFill,
  coverageRadius,
  buildings,
}: Props) {
  const dmax = coverageRadius ?? 0
  return (
    <>
      {interactive && <MapInteractions onClickMap={onClickMap} />}
      {coverageRadius ? (
        <CoverageLayer bins={bins} radius={coverageRadius} buildings={buildings} />
      ) : null}
      {bins.map((bin) => {
        const show = projectedFill !== undefined
        const ratio = show && projectedFill ? projectedFill(bin.id) ?? bin.fillRatio : bin.fillRatio
        const { count, demand } = binCatchment(bin, buildings, dmax)
        return (
          <Marker
            key={bin.id}
            position={[bin.lat, bin.lon]}
            icon={binDivIcon(ratio, bin.source, show)}
            draggable={interactive}
            bubblingMouseEvents={false}
            eventHandlers={{
              click: () => onClickBin(bin.id),
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng()
                onMoveBin(bin.id, [ll.lat, ll.lng])
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              <div className="bin-tip">
                <strong>{bin.id}</strong>
                <span className={`tip-tag ${ratio > 0.85 ? "red" : ratio > 0.7 ? "amber" : "green"}`}>
                  {Math.round(ratio * 100)}% full
                </span>
                {show ? (
                  <div className="tip-grid">
                    <span>Forecast fill</span>
                    <b>{(ratio * 100).toFixed(0)}%</b>
                    <span>Capacity</span>
                    <b>{fmt(bin.capacity)} L</b>
                    <span>Now</span>
                    <b>{(bin.fillRatio * 100).toFixed(0)}%</b>
                  </div>
                ) : (
                  <div className="tip-grid">
                    <span>Allocated</span>
                    <b>{fmt(Math.round(bin.allocated))} kg</b>
                    <span>Capacity</span>
                    <b>{fmt(bin.capacity)} L</b>
                    <span>Buildings served</span>
                    <b>{count}</b>
                    <span>Trash in zone</span>
                    <b>~{fmt(Math.round(demand))} kg/day</b>
                    <span>Source</span>
                    <b>{bin.source}</b>
                  </div>
                )}
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
