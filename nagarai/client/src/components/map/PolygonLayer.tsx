import * as L from "leaflet"
import { useEffect } from "react"
import { useMap, useMapEvents } from "react-leaflet"
import type { Position } from "@/lib/types"

const MAX_POINTS = 40

interface Props {
  polygon: Position[] | null
  drawMode: boolean
  onAddPoint: (p: Position) => void
  onClose: () => void
}

/** While drawing, add a vertex on each clean map click (never on a marker). */
function PolygonDraw({
  onAddPoint,
  pointCount,
  atMax,
}: {
  onAddPoint: (p: Position) => void
  pointCount: number
  atMax: boolean
}) {
  useMapEvents({
    click(e) {
      if (atMax) return
      onAddPoint([e.latlng.lat, e.latlng.lng])
    },
  })
  if (atMax) {
    return (
      <div className="map-control map-control-close max-h-10">
        Point limit reached ({MAX_POINTS}) — continue & load
      </div>
    )
  }
  if (pointCount === 0) {
    return (
      <div className="map-control map-control-close max-h-10">
        Click the map to drop points — at least 3 for an area (click again when done)
      </div>
    )
  }
  return null
}

/**
 * Render the polygon as a light, dashed outline with vertex markers while
 * drawing, and only fill it once it's closed (>= 3 points and not drawing).
 */
export function PolygonLayer({ polygon, drawMode, onAddPoint, onClose }: Props) {
  const map = useMap()

  useEffect(() => {
    const layer = L.layerGroup()
    if (polygon && polygon.length > 0) {
      const pts = polygon.map(([lat, lon]) => [lat, lon] as [number, number])
      if (polygon.length >= 3 && !drawMode) {
        // Closed area: subtle fill + crisp outline.
        L.polygon(pts, {
          color: "#2a9d8f",
          weight: 2,
          fillColor: "#2a9d8f",
          fillOpacity: 0.08,
          opacity: 0.6,
          dashArray: "6,4",
        }).addTo(layer)
      } else if (polygon.length >= 3) {
        // Still drawing: just the closing guide outline, no big fill.
        L.polyline([...pts, pts[0]], {
          color: "#2a9d8f",
          weight: 2,
          opacity: 0.55,
          dashArray: "6,4",
        }).addTo(layer)
      } else {
        L.polyline(pts, { color: "#2a9d8f", weight: 2, opacity: 0.7 }).addTo(layer)
      }
      pts.forEach((p) =>
        L.circleMarker(p, {
          radius: 4,
          color: "#fff",
          weight: 2,
          fillColor: "#2a9d8f",
          fillOpacity: 1,
        }).addTo(layer)
      )
    }
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, polygon, drawMode])

  const atMax = (polygon?.length ?? 0) >= MAX_POINTS

  return (
    <>
      {drawMode && (
        <PolygonDraw
          onAddPoint={onAddPoint}
          pointCount={polygon?.length ?? 0}
          atMax={atMax}
        />
      )}
      {drawMode && (polygon?.length ?? 0) >= 3 && (
        <button className="map-control map-control-close max-h-10" onClick={onClose}>
          Done ({polygon?.length} pts) — load area
        </button>
      )}
      {drawMode && atMax && <div className="map-control map-control-close">Point limit reached</div>}
    </>
  )
}
