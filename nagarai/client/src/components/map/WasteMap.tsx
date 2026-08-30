import {
  MapContainer,
  TileLayer,
  useMapEvents,
} from "react-leaflet"
import type { Engine } from "@/hooks/useWasteEngine"
import { NITK_CENTER } from "@/hooks/useWasteEngine"
import { BuildingLayer, GenerationHeatmap } from "./HeatLayers"
import { BubbleLayer } from "./BubbleLayer"
import { BinLayer } from "./BinLayer"
import { RouteLayer } from "./RouteLayer"
import { CollectionCenterLayer } from "./CollectionCenterLayer"
import { PolygonLayer } from "./PolygonLayer"
import { MapToolbar } from "./MapToolbar"
import { MapSearch } from "./MapSearch"

// Click on the routes view relocates the depot.
function DepotClick({ onSet }: { onSet: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onSet(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

interface Props {
  engine: Engine
}

export function WasteMap({ engine }: Props) {
  const view = engine.view
  const showHeat = view === "heat" || view === "placement"
  const showBins = view !== "routes" && view !== "heat"

  const interactive = view === "placement" && !engine.drawMode && !engine.centerMode
  const projected = view === "predictions"

  const projectedFill = (id: string) => {
    const p = engine.projections.find((x) => x.bin.id === id)
    return p ? p.proj : undefined
  }

  return (
    <div className="map-wrap">
      <MapToolbar engine={engine} />
      <MapContainer
        center={[NITK_CENTER.lat, NITK_CENTER.lon]}
        zoom={16}
        zoomControl={false}
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BuildingLayer
          buildings={engine.buildings}
          visible={showHeat}
          onSelect={engine.setSelected}
        />
        {engine.showHeatmap ? (
          <GenerationHeatmap buildings={engine.buildings} visible={showHeat} />
        ) : null}
        {engine.showBubbles ? (
          <BubbleLayer buildings={engine.buildings} visible={showHeat} />
        ) : null}
        <PolygonLayer
          polygon={engine.polygon}
          drawMode={engine.drawMode}
          onAddPoint={(p) => engine.setPolygon([...(engine.polygon || []), p])}
          onClose={() => {
            engine.setDrawMode(false)
            void engine.loadPolygonArea()
          }}
        />
        <CollectionCenterLayer
          centers={engine.centers}
          addMode={engine.centerMode}
          onClickCenter={(id) => {
            if (engine.centerMode) engine.removeCenter(id)
          }}
          onClickMap={(pos) => engine.addCenterAt(pos)}
        />
        {showBins && (
          <BinLayer
            bins={engine.bins}
            interactive={interactive}
            onClickBin={(id) => {
              engine.setSelected(id)
              if (interactive) engine.removeBin(id)
            }}
            onMoveBin={engine.updateBinPosition}
            onClickMap={(pos) => {
              if (interactive) engine.addBinAt(pos)
            }}
            projectedFill={projected ? projectedFill : undefined}
            coverageRadius={
              view === "placement" && engine.showCoverage ? engine.placement.Dmax : undefined
            }
            buildings={engine.buildings}
          />
        )}
        <RouteLayer
          routes={engine.routes}
          depot={engine.depot}
          visible={view === "routes"}
        />
        {view === "routes" && (
          <DepotClick onSet={(lat, lon) => engine.setDepot([lat, lon])} />
        )}
        <MapSearch engine={engine} />
      </MapContainer>
    </div>
  )
}
