import { useEffect } from "react"
import * as L from "leaflet"
import { useMap } from "react-leaflet"
import type { Building } from "@/lib/types"

interface Props {
  buildings: Building[]
  visible: boolean
}

/**
 * Bubble map: one circle per building, radius proportional to the generated
 * demand (kg/day) — a common "magnitude by bubble size" presentation. Colour
 * reflects building type so density and composition are both readable.
 */
export function BubbleLayer({ buildings, visible }: Props) {
  const map = useMap()

  useEffect(() => {
    if (!visible || buildings.length === 0) return undefined
    const layer = L.layerGroup()
    const maxWaste = Math.max(...buildings.map((b) => b.waste), 1)

    buildings.forEach((b) => {
      const radius = 5 + (b.waste / maxWaste) * 42
      const c = L.circle([b.lat, b.lon], {
        radius,
        color: "#ffffff",
        weight: 1,
        fillColor: "#2a9d8f",
        fillOpacity: 0.42,
      })
      c.bindTooltip(
        `<b>${b.type}</b> · ${b.waste.toFixed(1)} kg/day<br/>~${Math.round(b.occupancy)} people · ${b.floors} flr`,
        { sticky: true }
      )
      c.addTo(layer)
    })

    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, buildings, visible])

  return null
}
