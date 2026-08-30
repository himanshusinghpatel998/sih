import type { Engine } from "@/hooks/useWasteEngine"
import { BUILDING_TYPES } from "@/lib/model"
import { applyDayOfWeekMultiplier } from "@/lib/generation"
import { fmt } from "@/lib/geo"

/**
 * "Show how it works" — walks through the generation formula for the selected
 * building so the math is visible, not hidden.
 */
export function PersonaExplorer({ engine }: { engine: Engine }) {
  const { buildings, selected, heat } = engine
  const b = buildings.find((x) => x.id === selected)
  if (!b) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Generation breakdown</h2>
            <p>Select a building on the map</p>
          </div>
        </div>
        <div className="panel-body">
          <p className="empty-note">
            Click a building dot to trace exactly how its daily waste score is
            computed from occupancy, type, and multipliers.
          </p>
        </div>
      </div>
    )
  }

  const meta = BUILDING_TYPES[b.type]
  const weekend = [0, 6].includes(new Date().getDay())
  const dowM = applyDayOfWeekMultiplier(b.type, weekend)
  const footfallM = 1 + 0.5 * b.footfallIndex
  const terms: [string, string][] = [
    ["Occupancy (P)", `${fmt(b.occupancy)} ${meta.unit}(s)`],
    ["Type rate (B_w)", `${meta.rate} kg/${meta.unit}/day`],
    ["Footfall (M_f)", `${footfallM.toFixed(2)}×`],
    ["Weather (M_w)", `${heat.weatherM.toFixed(2)}×`],
    ["Events (M_e)", `${heat.eventM.toFixed(2)}×`],
    ["Day of week (M_d)", `${dowM.toFixed(2)}×`],
  ]

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Generation breakdown</h2>
          <p>
            <span className="swatch" style={{ background: meta.color }} /> {b.id} · {b.type} ·{" "}
            {b.floors} fl
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="formula-box">
          <div className="formula-title">G = P × B_w × M_f × M_w × M_e × M_d</div>
          {terms.map(([k, v]) => (
            <div className="metric-line" key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
          <div className="metric-line total">
            <span className="k">Daily waste score</span>
            <span className="v bad">{fmt(b.waste, 1)} kg/day</span>
          </div>
        </div>
        <p className="formula-note">
          P × B_w = {fmt(b.occupancy)} × {meta.rate} = {fmt(b.occupancy * meta.rate, 1)} kg base;{" "}
          multipliers stack the rest.
        </p>
      </div>
    </div>
  )
}
