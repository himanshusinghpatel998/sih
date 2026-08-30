import type { Engine } from "@/hooks/useWasteEngine"
import { BUILDING_TYPES, TYPE_KEYS } from "@/lib/model"
import { fmt } from "@/lib/geo"

export function HeatPanel({ engine }: { engine: Engine }) {
  const { heat, setHeat, buildings, metrics } = engine
  const avgFootfall =
    buildings.length > 0
      ? buildings.reduce((s, b) => s + b.footfallIndex, 0) / buildings.length
      : 0

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Trash generation heatmap</h2>
          <p>Waste score per building drives the heat layer</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="ctrl-group">
          <label htmlFor="wSlider">
            Weather multiplier <b id="wVal">{heat.weatherM.toFixed(2)}×</b>
          </label>
          <input
            id="wSlider"
            type="range"
            min={0.8}
            max={1.4}
            step={0.01}
            value={heat.weatherM}
            onChange={(e) => {
              setHeat({ ...heat, weatherM: +e.target.value })
              engine.recompute()
            }}
          />
        </div>
        <div className="ctrl-group">
          <label htmlFor="eSlider">
            Event multiplier <b id="eVal">{heat.eventM.toFixed(2)}×</b>
          </label>
          <input
            id="eSlider"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={heat.eventM}
            onChange={(e) => {
              setHeat({ ...heat, eventM: +e.target.value })
              engine.recompute()
            }}
          />
        </div>
        <p className="formula-note">
          G = occupancy × rate × footfall × weather × event × day
        </p>
        <button className="text-button block" onClick={() => engine.regenArea()}>
          Regenerate area →
        </button>
      </div>
      <div className="panel-body border-top">
        <h3>Personas (waste rate)</h3>
        {TYPE_KEYS.map((k) => (
          <div className="legend-item" key={k}>
            <span className="swatch" style={{ background: BUILDING_TYPES[k].color }} />
            {k} — {BUILDING_TYPES[k].rate} kg/{BUILDING_TYPES[k].unit}/day
          </div>
        ))}
      </div>
      <div className="panel-footer">
        <div className="metric-line">
          <span className="k">Total demand</span>
          <span className="v">{fmt(metrics.totalDemand, 0)} kg/day</span>
        </div>
        <div className="metric-line">
          <span className="k">Buildings modeled</span>
          <span className="v">{buildings.length}</span>
        </div>
        <div className="metric-line">
          <span className="k">Avg. footfall index</span>
          <span className="v">{avgFootfall.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
