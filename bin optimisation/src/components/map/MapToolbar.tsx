import { Ban, Boxes, Loader, PenTool, RefreshCw, Trash2, Map as MapIcon, CircleDot } from "lucide-react"
import type { Engine } from "@/hooks/useWasteEngine"

export function MapToolbar({ engine }: { engine: Engine }) {
  const {
    drawMode,
    setDrawMode,
    centerMode,
    setCenterMode,
    setPolygon,
    polygon,
    regenArea,
    loadPolygonArea,
    centers,
    removeCenter,
    dataStatus,
    buildings,
    showHeatmap,
    setShowHeatmap,
    showBubbles,
    setShowBubbles,
    showCoverage,
    setShowCoverage,
    view,
  } = engine

  return (
    <div className="map-toolbar">
      <button
        className={`map-control ${drawMode ? "on" : ""}`}
        onClick={() => {
          setDrawMode(!drawMode)
          if (centerMode) setCenterMode(false)
        }}
        title="Draw a polygon to select & load an area"
      >
        <PenTool size={15} /> {drawMode ? "Drawing…" : "Select area"}
      </button>
      {drawMode && polygon && polygon.length >= 3 && (
        <button className="map-control primary" onClick={loadPolygonArea} title="Load live data in this polygon">
          <Loader size={15} />
          {dataStatus.kind === "loading" ? "Loading…" : "Load area"}
        </button>
      )}
      {drawMode && polygon && polygon.length > 0 && (
        <button
          className="map-control"
          onClick={() => setPolygon(null)}
          title="Clear polygon"
        >
          <Ban size={15} /> Clear
        </button>
      )}
      <button
        className={`map-control ${centerMode ? "on" : ""}`}
        onClick={() => {
          setCenterMode(!centerMode)
          if (drawMode) setDrawMode(false)
        }}
        title="Click the map to add a collection centre"
      >
        <Boxes size={15} /> {centerMode ? "Place centre…" : "Add centre"}
      </button>
      {centers.length > 0 && (
        <button className="map-control" onClick={() => centers.forEach((c) => removeCenter(c.id))} title="Clear collection centres">
          <Trash2 size={15} /> Centres {centers.length}
        </button>
      )}
      <button className="map-control" onClick={regenArea} title="Regenerate simulated demo data">
        <RefreshCw size={15} /> Demo
      </button>
      {(view === "heat" || view === "placement") && (
        <span className="map-toolbar-seg">
          <button
            className={`map-control ${showHeatmap ? "on" : ""}`}
            onClick={() => setShowHeatmap(!showHeatmap)}
            title="Toggle density heatmap"
          >
            <MapIcon size={15} /> Heat
          </button>
          <button
            className={`map-control ${showBubbles ? "on" : ""}`}
            onClick={() => setShowBubbles(!showBubbles)}
            title="Toggle bubble map — circle size = waste generated"
          >
            <CircleDot size={15} /> Bubble
          </button>
        </span>
      )}
      {view === "placement" && (
        <span className="map-toolbar-toggle">
          <input
            id="covToggle"
            type="checkbox"
            checked={showCoverage}
            onChange={(e) => setShowCoverage(e.target.checked)}
          />
          <label htmlFor="covToggle">Coverage zones</label>
        </span>
      )}
      <span className="map-toolbar-count">{buildings.length} buildings</span>
    </div>
  )
}
