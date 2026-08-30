import type { Engine } from "@/hooks/useWasteEngine"
import { fmt } from "@/lib/geo"

export function PlacementPanel({ engine }: { engine: Engine }) {
  const { placement, setPlacement, metrics } = engine
  const trace = engine.placementTrace
  const optimised = trace.length > 0

  const coverage = Math.max(0, Math.min(100, metrics.coveragePct))
  const ring = `conic-gradient(#2a9d8f ${coverage}%, #eef3f0 ${coverage}% 100%)`

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Bin placement optimisation</h2>
          <p>Greedy MCLP · drag/drop, click to add/remove</p>
        </div>
        {optimised && <span className="opt-badge">Optimised</span>}
      </div>

      {optimised && (
        <div className="opt-hero">
          <div className="opt-ring" style={{ background: ring }}>
            <div className="opt-ring-core">
              <b>{fmt(metrics.coveragePct, 0)}%</b>
              <span>covered</span>
            </div>
          </div>
          <div className="opt-hero-info">
            <strong>
              {metrics.numBins} bins placed · {fmt(metrics.totalDemand, 0)} kg/day served
            </strong>
            <span className="opt-reason">{engine.placementStopReason}</span>
            <div className="opt-mini">
              <span>unserved <b className={metrics.unservedPct > 15 ? "bad" : ""}>{fmt(metrics.unservedPct, 1)}%</b></span>
              <span>avg walk <b>{fmt(metrics.avgWalk, 0)} m</b></span>
              <span>overflow <b className={metrics.overThreshold > 0 ? "bad" : ""}>{metrics.overThreshold}</b></span>
            </div>
          </div>
        </div>
      )}

      <div className="panel-body">
        <div className="ctrl-group">
          <label htmlFor="dmax">
            Max walking distance (D_max) <b>{placement.Dmax} m</b>
          </label>
          <input
            id="dmax"
            type="range"
            min={20}
            max={150}
            step={5}
            value={placement.Dmax}
            onChange={(e) => {
              setPlacement({ ...placement, Dmax: +e.target.value })
              engine.recompute()
            }}
          />
          <em className="ctrl-hint">Larger zones = fewer bins needed · see coverage rings on the map</em>
        </div>
        <div className="ctrl-group">
          <label htmlFor="cap">
            Bin capacity <b>{placement.capacity} L</b>
          </label>
          <select
            id="cap"
            value={placement.capacity}
            onChange={(e) => {
              setPlacement({ ...placement, capacity: +e.target.value })
              engine.recompute()
            }}
          >
            {[120, 240, 360, 660, 1100].map((v) => (
              <option key={v} value={v}>
                {v} L
              </option>
            ))}
          </select>
        </div>
        <div className="ctrl-group">
          <label htmlFor="autoBins">Bin budget</label>
          <label className="toggle-row">
            <input
              id="autoBins"
              type="checkbox"
              checked={placement.autoBins}
              onChange={(e) => setPlacement({ ...placement, autoBins: e.target.checked })}
            />
            <span>
              Auto-select number of bins (up to 100){" "}
              <em className="auto-hint">— lets the optimiser figure it out</em>
            </span>
          </label>
        </div>
        {!placement.autoBins && (
          <div className="ctrl-group">
            <label htmlFor="maxBins">
              Max bins <b>{placement.maxBins}</b>
            </label>
            <input
              id="maxBins"
              type="range"
              min={5}
              max={100}
              step={5}
              value={placement.maxBins}
              onChange={(e) => setPlacement({ ...placement, maxBins: +e.target.value })}
            />
          </div>
        )}
        {engine.processing && (
          <div className="compute-box">
            <div className="compute-step">
              <span className="compute-spinner" />
              <span>{engine.processingLabel || "Computing…"}</span>
            </div>
            <div className="progress-track">
              <i style={{ width: `${Math.min(100, Math.max(2, engine.progressPct))}%` }} />
            </div>
          </div>
        )}
        <button className="primary-btn" onClick={engine.runPlacement} disabled={engine.processing}>
          {engine.processing ? "Optimising…" : "Run optimisation"}
        </button>
        {optimised && (
          <button className="text-button block" onClick={engine.resetPlacement}>
            Clear suggested bins & restart →
          </button>
        )}
        <p className="formula-note">
          Bins land on the highest-uncovered-demand spots and stop at ~95% coverage, the
          budget, or a hard limit of 100 total bins — so the layout always looks deliberate.
        </p>
      </div>

      {optimised && (
        <div className="panel-body border-top">
          <h3>Placement process</h3>
          <div className="trace-bars">
            {trace.slice(0, 30).map((step, i) => (
              <div
                className="trace-bar"
                key={step.binId}
                title={`${step.binId}: +${step.gainPct.toFixed(1)}% → ${step.coveredPct.toFixed(1)}% coverage`}
              >
                <i style={{ width: `${Math.min(100, step.coveredPct)}%` }} />
                <span>{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="trace-list">
            {trace.slice(0, 30).map((step, i) => (
              <div className="metric-line" key={step.binId}>
                <span className="k">
                  <b>{i + 1}.</b> {step.binId}
                </span>
                <span className="v">+{step.gainPct.toFixed(1)}% · {step.coveredPct.toFixed(0)}% covered</span>
              </div>
            ))}
            {trace.length > 30 && <p className="empty-note">… {trace.length - 30} more bins</p>}
          </div>
        </div>
      )}

      <div className="panel-body border-top">
        <h3>Coverage metrics</h3>
        <div className="metric-line">
          <span className="k">Coverage</span>
          <span className={`v ${metrics.coveragePct >= 90 ? "good" : metrics.coveragePct < 70 ? "bad" : ""}`}>
            {fmt(metrics.coveragePct, 1)}%
          </span>
        </div>
        <div className="metric-line">
          <span className="k">Unserved demand</span>
          <span className={`v ${metrics.unservedPct > 15 ? "bad" : ""}`}>
            {fmt(metrics.unservedWeight, 1)} kg ({fmt(metrics.unservedPct, 1)}%)
          </span>
        </div>
        <div className="metric-line">
          <span className="k">Number of bins</span>
          <span className="v">{metrics.numBins}</span>
        </div>
        <div className="metric-line">
          <span className="k">Avg. walking distance</span>
          <span className="v">{fmt(metrics.avgWalk, 0)} m</span>
        </div>
        <div className="metric-line">
          <span className="k">Bins over 85% fill</span>
          <span className={`v ${metrics.overThreshold > 0 ? "bad" : ""}`}>{metrics.overThreshold}</span>
        </div>
        <div className="metric-line">
          <span className="k">Bins under 70% fill</span>
          <span className="v">{metrics.underThreshold}</span>
        </div>
      </div>
      <div className="panel-body border-top">
        <h3>Fill legend</h3>
        <div className="legend-item">
          <span className="swatch" style={{ background: "#2a9d8f" }} />
          Healthy ≤70%
        </div>
        <div className="legend-item">
          <span className="swatch" style={{ background: "#f2a93b" }} />
          Filling 70–85%
        </div>
        <div className="legend-item">
          <span className="swatch" style={{ background: "#e4572e" }} />
          Overflow risk &gt;85%
        </div>
        <p className="formula-note">
          Ring arc = current fill; colour = risk level. Solid bubbles are each bin&apos;s
          D_max service zone — hover a bubble for how many buildings & how much trash it covers.
        </p>
      </div>
    </div>
  )
}
