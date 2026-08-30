import type { CollectionCenter, Position } from "@/lib/types"
import { Marker, useMapEvents } from "react-leaflet"
import { centerDivIcon } from "./icons"

interface Props {
  centers: CollectionCenter[]
  addMode: boolean
  onClickCenter: (id: string) => void
  onClickMap: (pos: Position) => void
}

function CenterMapClick({ onClickMap }: { onClickMap: (pos: Position) => void }) {
  useMapEvents({
    click(e) {
      onClickMap([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

/** Collection/transfer stations, addable by clicking when addMode is on. */
export function CollectionCenterLayer({ centers, addMode, onClickCenter, onClickMap }: Props) {
  return (
    <>
      {addMode && <CenterMapClick onClickMap={onClickMap} />}
      {centers.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lon]}
          icon={centerDivIcon(c.fillRatio)}
          draggable={false}
          bubblingMouseEvents={false}
          eventHandlers={{ click: () => onClickCenter(c.id) }}
        />
      ))}
    </>
  )
}
