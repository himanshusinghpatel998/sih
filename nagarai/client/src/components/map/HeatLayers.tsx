import { useEffect } from "react"
import * as L from "leaflet"
import "leaflet.heat"
import { useMap } from "react-leaflet"
import type { Building } from "@/lib/types"
import { BUILDING_TYPES } from "@/lib/model"
import { heatWeight } from "@/lib/generation"

interface Props {
  buildings: Building[]
  visible: boolean
  onSelect?: (id: string) => void
}

/** Building dots coloured by type, sized/weighted by computed waste. */
export function BuildingLayer({ buildings, visible, onSelect }: Props) {
  const map = useMap()

  useEffect(() => {
    if (!visible) return undefined
    const layer = L.layerGroup()
    buildings.forEach((b) => {
      const m = L.circleMarker([b.lat, b.lon], {
        radius: 2 + Math.min(4, b.waste / 8),
        color: BUILDING_TYPES[b.type].color,
        weight: 0,
        fillOpacity: 0.55,
      })
        .bindTooltip(`${b.type} · ${b.waste.toFixed(1)} kg/day`, { sticky: true })
      if (onSelect) m.on("click", () => onSelect(b.id))
      m.addTo(layer)
    })
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, buildings, visible, onSelect])

  return null
}

/** Leaflet.heat heatmap weighted by each building's waste score. */
export function GenerationHeatmap({ buildings, visible }: Props) {
  const map = useMap()

  useEffect(() => {
    if (!visible || buildings.length === 0) return undefined
    const pts = buildings.map(
      (b) => [b.lat, b.lon, heatWeight(b.waste)] as [number, number, number]
    )
    if (pts.length === 0) return undefined

    map.invalidateSize({ pan: false })
    const heat = (L as typeof L & {
      heatLayer: (p: [number, number, number][], o: object) => L.Layer
    }).heatLayer(pts, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      gradient: {
        0.2: "#2a9d8f",
        0.45: "#e9c46a",
        0.7: "#f4a261",
        1: "#e76f51",
      },
    })
    heat.addTo(map)
    return () => {
      map.removeLayer(heat)
    }
  }, [map, buildings, visible])

  return null
}
