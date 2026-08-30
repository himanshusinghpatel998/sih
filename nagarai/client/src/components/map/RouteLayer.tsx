import type { Position, Route } from "@/lib/types"
import { LayerGroup, Marker, Polyline } from "react-leaflet"
import { depotDivIcon, stopDivIcon, ROUTE_PALETTE } from "./icons"

interface Props {
  routes: Route[]
  depot: Position
  visible: boolean
}

export function RouteLayer({ routes, depot, visible }: Props) {
  if (!visible) return null
  return (
    <LayerGroup>
      <Marker position={depot} icon={depotDivIcon()} />
      {routes.map((r, ri) => {
        const color = ROUTE_PALETTE[ri % ROUTE_PALETTE.length]
        const defaultPath: Position[] = [
          depot,
          ...r.stops.map((s) => [s.lat, s.lon] as Position),
          depot,
        ]
        const points = r.path && r.path.length > 0 ? r.path : defaultPath
        return (
          <LayerGroup key={r.truckId}>
            <Polyline
              positions={points}
              pathOptions={{
                color,
                weight: 3,
                opacity: 0.85,
                dashArray: r.mode === "osrm" ? undefined : "6,5",
              }}
            />
            {r.stops.map((s, si) => (
              <Marker
                key={`${r.truckId}-${s.id}`}
                position={[s.lat, s.lon]}
                icon={stopDivIcon(si + 1, color)}
              />
            ))}
          </LayerGroup>
        )
      })}
    </LayerGroup>
  )
}
