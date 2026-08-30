import type { Engine } from "@/hooks/useWasteEngine"

export function DataBar({ engine }: { engine: Engine }) {
  const { dataStatus, fetchLive, useDemo } = engine

  return (
    <div className="data-bar">
      <span className={`data-dot ${dataStatus.kind}`} />
      <span className="data-badge">{dataStatus.badge}</span>
      <span className="data-sep">·</span>
      <span className="data-detail">{dataStatus.detail}</span>
      <span className="spacer" />
      <button
        className="data-btn"
        onClick={() =>
          fetchLive({
            south: 13.0086,
            west: 74.7856,
            north: 13.0206,
            east: 74.7996,
          })
        }
      >
        Fetch live OSM data
      </button>
      <button className="data-btn ghost" onClick={useDemo}>
        Use demo data
      </button>
    </div>
  )
}
