import type { Engine } from "@/hooks/useWasteEngine"
import { fmt } from "@/lib/geo"
import { ROUTE_PALETTE } from "../map/icons"

export function RoutesPanel({ engine }: { engine: Engine }) {
  const { routeParams, setRouteParams, routes } = engine
  const eligible = engine.bins.filter((b) => b.fillRatio >= routeParams.fillGate).length
  const served = routes.reduce((s, r) => s + r.stops.length, 0)
  const uncollected = Math.max(0, eligible - served)
  const totalDist = routes.reduce((s, r) => s + r.distance, 0)
  const totalLoad = routes.reduce((s, r) => s + r.load, 0)

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Collection route optimisation</h2>
          <p>Capacitated VRP · nearest-neighbour + OSRM road path</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="ctrl-group">
          <label htmlFor="tcap">
            Truck capacity <b>{routeParams.truckCapacity} L</b>
          </label>
          <input
            id="tcap"
            type="range"
            min={1000}
            max={8000}
            step={250}
            value={routeParams.truckCapacity}
            onChange={(e) => setRouteParams({ ...routeParams, truckCapacity: +e.target.value })}
          />
        </div>
        <div className="ctrl-group">
          <label htmlFor="ntruck">
            Number of trucks <b>{routeParams.numTrucks}</b>
          </label>
          <input
            id="ntruck"
            type="range"
            min={1}
            max={6}
            step={1}
            value={routeParams.numTrucks}
            onChange={(e) => setRouteParams({ ...routeParams, numTrucks: +e.target.value })}
          />
        </div>
        <div className="ctrl-group">
          <label htmlFor="gate">
            Collect bins above fill <b>{Math.round(routeParams.fillGate * 100)}%</b>
          </label>
          <input
            id="gate"
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={routeParams.fillGate}
            onChange={(e) => setRouteParams({ ...routeParams, fillGate: +e.target.value })}
          />
        </div>
        <button className="primary-btn" onClick={() => engine.runRoutes()}>
          Optimise routes
        </button>
        <p className="formula-note">
          Route = depot → nearest eligible bins → nearest collection centre, respecting truck capacity.
        </p>
      </div>
      <div className="panel-body border-top">
        <h3>Manifest</h3>
        {routes.length === 0 ? (
          <p className="empty-note">No routes yet — run optimisation.</p>
        ) : (
          routes.map((r, ri) => (
            <div className="manifest-truck" key={r.truckId}>
              <div className="manifest-head">
                <span style={{ color: ROUTE_PALETTE[ri % ROUTE_PALETTE.length] }}>{r.truckId}</span>
                <span>
                  {(r.distance / 1000).toFixed(2)} km · {fmt(r.load)} / {routeParams.truckCapacity} L
                </span>
              </div>
              <div className={`manifest-mode ${r.mode === "osrm" ? "" : "warn"}`}>
                {r.mode === "osrm" ? "✓ real road-network route (OSRM)" : "⚠ straight-line fallback"} · dump @ {r.endLabel || "depot"}
              </div>
              <div className="manifest-stops">
                {r.stops.map((s, i) => (
                  <div key={s.id}>
                    <span>
                      {i + 1}. {s.id}
                    </span>
                    <span>{Math.round(s.fillRatio * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="panel-footer">
        <h3>Fleet totals</h3>
        <div className="metric-line">
          <span className="k">Trucks dispatched</span>
          <span className="v">{routes.length}</span>
        </div>
        <div className="metric-line">
          <span className="k">Total distance</span>
          <span className="v">{fmt(totalDist / 1000, 2)} km</span>
        </div>
        <div className="metric-line">
          <span className="k">Total volume collected</span>
          <span className="v">{fmt(totalLoad)} L</span>
        </div>
        <div className="metric-line">
          <span className="k">Bins left uncollected</span>
          <span className={`v ${uncollected > 0 ? "bad" : "good"}`}>{uncollected}</span>
        </div>
      </div>
    </div>
  )
}
