import './waste-ops.css';
import { useWasteEngine } from '../../hooks/useWasteEngine';
import { WasteMap } from '../../components/map/WasteMap';
import { HeatPanel } from '../../components/panels/HeatPanel';
import { PlacementPanel } from '../../components/panels/PlacementPanel';
import { RoutesPanel } from '../../components/panels/RoutesPanel';
import { PredictPanel } from '../../components/panels/PredictPanel';
import { PersonaExplorer } from '../../components/panels/PersonaExplorer';
import { fmt } from '../../lib/geo';

function WasteOpsMapView() {
  const engine = useWasteEngine();
  const view = engine.view;

  const viewTitles = {
    heat: 'Generation heatmap',
    routes: 'Collector routes',
    placement: 'Bin placement lab',
    predictions: 'Fill predictions',
  };

  return (
    <div className="app-shell">
      <main className="main-content">
        <section className="map-section">
          <div className="section-head">
            <div className="section-title">
              <h2>{viewTitles[view]}</h2>
              <p>
                {engine.buildings.length} buildings · {engine.metrics.numBins} bins ·{' '}
                {engine.centers.length} centres · {fmt(engine.metrics.totalDemand, 0)} kg/day ·{' '}
                {engine.dataStatus.badge}
              </p>
            </div>
            <div className="view-tabs">
              <button
                className={view === 'heat' ? 'selected' : ''}
                onClick={() => engine.setView('heat')}
              >
                Heatmap
              </button>
              <button
                className={view === 'routes' ? 'selected' : ''}
                onClick={() => engine.setView('routes')}
              >
                Routes
              </button>
              <button
                className={view === 'placement' ? 'selected' : ''}
                onClick={() => engine.setView('placement')}
              >
                Placement
              </button>
              <button
                className={view === 'predictions' ? 'selected' : ''}
                onClick={() => engine.setView('predictions')}
              >
                Predictions
              </button>
            </div>
          </div>

          <div className="map-layout">
            <div className="map-canvas">
              <WasteMap engine={engine} />
              <div className="map-legend">
                <strong>
                  {view === 'heat' || view === 'placement'
                    ? engine.showBubbles
                      ? 'Waste per building · bubble size = kg/day'
                      : 'Generation density'
                    : view === 'predictions'
                      ? 'Predicted fill'
                      : 'Route direction'}
                </strong>
                {view === 'heat' || view === 'placement' ? (
                  <>
                    {engine.showHeatmap ? <span className="heat-scale" /> : null}
                    {engine.showBubbles ? (
                      <span className="bubble-scale">
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="heat-scale" />
                )}
                <span>
                  {view === 'heat' || view === 'placement'
                    ? 'Low · High'
                    : view === 'predictions'
                      ? 'Empty · Full'
                      : 'Depot → route'}
                </span>
              </div>
            </div>

            <div className="map-side">
              {view === 'heat' ? <HeatPanel engine={engine} /> : null}
              {view === 'placement' ? <PlacementPanel engine={engine} /> : null}
              {view === 'routes' ? <RoutesPanel engine={engine} /> : null}
              {view === 'predictions' ? <PredictPanel engine={engine} /> : null}
              <PersonaExplorer engine={engine} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function WasteOpsTab() {
  return <WasteOpsMapView />;
}
