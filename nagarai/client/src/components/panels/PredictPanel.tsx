import type { Engine } from "@/hooks/useWasteEngine"

export function PredictPanel({ engine }: { engine: Engine }) {
  const { forecastHours, setForecastHours, projections, bins } = engine
  const overflowing = projections.filter((p) => p.overflow)
  const warning = projections.filter((p) => p.warning)

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Bin fill forecast</h2>
          <p>Linear projection using each bin&apos;s allocation rate</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="ctrl-group">
          <label htmlFor="hours">
            Horizon <b>+{forecastHours} h</b>
          </label>
          <input
            id="hours"
            type="range"
            min={0}
            max={168}
            step={6}
            value={forecastHours}
            onChange={(e) => setForecastHours(+e.target.value)}
          />
        </div>
        <p className="formula-note">
          Projected fill = current fill + (allocated/capacity) × hours/24
        </p>
      </div>
      <div className="panel-body border-top">
        <h3>Alerts</h3>
        {overflowing.length === 0 && warning.length === 0 ? (
          <p className="empty-note">No overflow risk at this horizon.</p>
        ) : (
          <>
            {overflowing.map((p) => (
              <div className="alert-item" key={p.bin.id}>
                {p.bin.id} will overflow {p.eta !== null ? `in ~${Math.round(p.eta)}h` : "now"}
              </div>
            ))}
            {warning.map((p) => (
              <div className="alert-item warn" key={p.bin.id}>
                {p.bin.id} projected at {Math.round(p.proj * 100)}% fill
              </div>
            ))}
          </>
        )}
      </div>
      <div className="panel-footer">
        <h3>Fleet recap</h3>
        <div className="metric-line">
          <span className="k">Bins projected &gt;85%</span>
          <span className={`v ${warning.length + overflowing.length > 0 ? "bad" : ""}`}>
            {warning.length + overflowing.length}
          </span>
        </div>
        <div className="metric-line">
          <span className="k">Bins projected overflow</span>
          <span className={`v ${overflowing.length > 0 ? "bad" : ""}`}>{overflowing.length}</span>
        </div>
        <div className="metric-line">
          <span className="k">Total bins</span>
          <span className="v">{bins.length}</span>
        </div>
      </div>
    </div>
  )
}
