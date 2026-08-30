import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Trash2, AlertTriangle, CalendarClock, Cpu, Truck, Users2,
  FlaskConical, Wind, Camera, Sparkles, MapPin, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import NagaraiMap, { ROUTE_COLORS } from '../../components/map/NagaraiMap';
import API from '../../services/api';
import {
  runPredictions, getEvents, getBins, optimizeBins, getBinRecommendations,
  generateRoutes, deployRoutes, advanceDay, getWorkforce, getIncidents, getMLStatus,
  analyzeSweeping, getSweepingPlan, deploySweeping, detectCctvFrame,
} from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import AnimatedStat from '../../components/ui/AnimatedStat';
import TabTransition from '../../components/ui/TabTransition';
import { cn } from '../../lib/utils';
import { CITY_NAME, CITY_CENTER, CITY_DEFAULT_ZOOM } from '../../lib/cityConfig';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const pctTone = (p) => (p >= 70 ? 'text-danger-600 dark:text-danger-400' : p >= 40 ? 'text-signal-600 dark:text-signal-400' : 'text-success-600 dark:text-success-400');
const riskVariant = (p) => (p >= 70 ? 'danger' : p >= 40 ? 'warning' : 'success');
const riskLabel = (p) => (p >= 70 ? 'HIGH' : p >= 40 ? 'MED' : 'LOW');
const statusVariant = (status) => {
  const s = (status || '').toLowerCase();
  if (['completed', 'resolved'].includes(s)) return 'success';
  if (['in-progress', 'in_progress', 'assigned'].includes(s)) return 'warning';
  return 'muted';
};

const CHART_COLORS = { danger: '#ef4444', warning: '#f59e0b', success: '#22c55e' };

const TABS = [
  { key: 'overview', label: 'Overview', icon: Sparkles },
  { key: 'prediction', label: 'Predictions', icon: Cpu },
  { key: 'routes', label: 'Routes & Fleet', icon: Truck },
  { key: 'bins', label: 'Bin Optimizer', icon: Trash2 },
  { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { key: 'workforce', label: 'Workforce', icon: Users2 },
  { key: 'simulator', label: 'What-If', icon: FlaskConical },
  { key: 'sweeping', label: 'Sweeping', icon: Wind },
  { key: 'cctv', label: 'CCTV', icon: Camera },
];

function SectionTitle({ children }) {
  return <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">{children}</h3>;
}

function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>;
}
function Td({ children, className }) {
  return <td className={cn('px-3 py-2 text-sm', className)}>{children}</td>;
}

function DirtBar({ score }) {
  const tone = score >= 60 ? 'bg-danger-500' : score >= 35 ? 'bg-signal-500' : 'bg-success-500';
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <motion.div
        className={cn('h-full rounded-full', tone)}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

export default function NagaraiCommandCenter() {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [bins, setBins] = useState([]);
  const [escalated, setEscalated] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [events, setEvents] = useState([]);
  const [workforce, setWorkforce] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [mlStatus, setMlStatus] = useState(null);
  const [engineUsed, setEngineUsed] = useState(null);
  const [busy, setBusy] = useState('');
  const [predTable, setPredTable] = useState([]);
  const [simResult, setSimResult] = useState(null);
  const [simForm, setSimForm] = useState({ eventType: '', expectedAttendance: 0, weather: 'clear', hours: 24, collectionFrequencyHrs: 0 });
  const [sweepNeeds, setSweepNeeds] = useState([]);
  const [sweepPlan, setSweepPlan] = useState(null);
  const [cctvForm, setCctvForm] = useState({ lat: String(CITY_CENTER.lat), lng: String(CITY_CENTER.lng), file: null, preview: null });
  const [routeMeta, setRouteMeta] = useState({ engine: null, workerAssignmentEngine: null, depot: null, criticalBins: 0, opportunisticBins: 0 });
  const [dayResult, setDayResult] = useState(null);
  const [cctvResult, setCctvResult] = useState(null);

  const loadCity = useCallback(async () => {
    try {
      const [b, ev, w, inc, ml] = await Promise.all([
        getBins(), getEvents({ upcoming: 1 }), getWorkforce(), getIncidents(), getMLStatus(),
      ]);
      setBins(b.data || []);
      setEvents(ev.data || []);
      setWorkforce(w.data || []);
      setIncidents(inc.data || []);
      setMlStatus(ml.data || null);
      return { bins: b.data || [], events: ev.data || [] };
    } catch (e) {
      setErr('Could not load city data — is the server running & seeded?');
      return { bins: [], events: [] };
    }
  }, []);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { bins: binList } = await loadCity();
      try {
        const pred = await runPredictions({ weather: 'clear' });
        const results = (pred.data && pred.data.results) || [];
        setEngineUsed(pred.data?.engine || 'rule');
        const escalatedList = results
          .filter((r) => r.riskScore >= 55 || (r.predictions && r.predictions['24h'] && r.predictions['24h'].predictedFillPct >= 80))
          .sort((a, b) => b.riskScore - a.riskScore);
        setEscalated(escalatedList);
        setBins((prev) => (binList.length ? prev : binList));
      } catch (e) {
        setErr('Prediction engine unavailable — check MONGO_URI / ML_SERVICE_URL.');
      }
      setLoading(false);
    })();
  }, [loadCity]);

  const handleGenerate = async () => {
    setBusy('generate'); setErr(null);
    try {
      const r = await generateRoutes({ weather: 'clear' });
      setRoutes((r.data && r.data.routes) || []);
      setUnassigned((r.data && r.data.unassigned) || []);
      setRouteMeta({
        engine: r.data?.engine || null,
        workerAssignmentEngine: null,
        depot: r.data?.depot || null,
        criticalBins: r.data?.criticalBins || 0,
        opportunisticBins: r.data?.opportunisticBins || 0,
      });
      toast.success(`Routes generated${r.data?.engine === 'ortools' ? ' (OR-Tools)' : ''}`);
    } catch (e) { setErr('Route generation failed.'); toast.error('Route generation failed'); }
    setBusy('');
  };

  const handleDeploy = async () => {
    setBusy('deploy'); setErr(null);
    try {
      const r = await deployRoutes({ weather: 'clear' });
      setRoutes((r.data && r.data.routes) || []);
      setUnassigned((r.data && r.data.unassigned) || []);
      setRouteMeta({
        engine: r.data?.engine || null,
        workerAssignmentEngine: r.data?.workerAssignmentEngine || null,
        depot: r.data?.depot || null,
        criticalBins: r.data?.criticalBins || 0,
        opportunisticBins: r.data?.opportunisticBins || 0,
      });
      setDayResult(null);
      toast.success(`Routes deployed — ${r.data?.tasksCreated ?? 0} task(s) created`);
    } catch (e) { setErr('Deploy failed.'); toast.error('Deploy failed'); }
    setBusy('');
  };

  // Closes the loop: bins on today's deployed routes get reset (collected),
  // every other bin's predicted growth carries forward as tomorrow's
  // starting fill — so leftover trash compounds instead of vanishing, and
  // the next "Run prediction" reflects it.
  const handleAdvanceDay = async () => {
    setBusy('advance'); setErr(null);
    try {
      const collectedBinIds = routes.flatMap((r) => (r.stops || []).map((s) => s.binId));
      const r = await advanceDay({ collectedBinIds, weather: 'clear' });
      setDayResult(r.data);
      setRoutes([]);
      setUnassigned([]);
      setRouteMeta({ engine: null, workerAssignmentEngine: null, depot: null });
      toast.success(`Day advanced — ${r.data.collected} bin(s) collected, ${r.data.advanced} carried over`);
    } catch (e) { setErr('Advance day failed.'); toast.error('Advance day failed'); }
    setBusy('');
  };

  const handleOptimizeBins = async () => {
    setBusy('bins'); setErr(null);
    try {
      await optimizeBins();
      const recs = await getBinRecommendations();
      setRecommendations(recs.data || []);
      toast.success('Bin optimization complete');
    } catch (e) { setErr('Bin optimization failed.'); toast.error('Bin optimization failed'); }
    setBusy('');
  };

  const runSimulation = async () => {
    setBusy('sim'); setErr(null); setSimResult(null);
    try {
      const res = await API.post('/simulate', simForm);
      setSimResult(res.data);
    } catch (e) { setErr('Simulation failed.'); toast.error('Simulation failed'); }
    setBusy('');
  };

  const handleAnalyzeSweeping = async () => {
    setBusy('sweep'); setErr(null);
    try {
      const res = await analyzeSweeping({ weather: 'clear' });
      setSweepNeeds(res.data.needs || []);
      toast.success(`${res.data.count} zone sweeping recommendations generated`);
    } catch (e) { setErr('Sweeping analysis failed.'); toast.error('Sweeping analysis failed'); }
    setBusy('');
  };

  // Preview only — builds the TSP sweep route from open litter incidents +
  // high-footfall zones, no tasks created yet.
  const handlePlanSweeping = async () => {
    setBusy('sweepplan'); setErr(null);
    try {
      const res = await getSweepingPlan();
      setSweepPlan(res.data);
      if (!res.data.candidates) toast('No litter incidents or high-footfall zones need sweeping right now.');
      else toast.success(`Sweep route planned — ${res.data.segments.length} sweeper segment(s)`);
    } catch (e) { setErr('Sweeping plan failed.'); toast.error('Sweeping plan failed'); }
    setBusy('');
  };

  // Same plan, but persists CollectionTask(type: 'sweeping') per segment,
  // assigned to available sweeping-skilled workers.
  const handleDeploySweeping = async () => {
    setBusy('sweepdeploy'); setErr(null);
    try {
      const res = await deploySweeping();
      setSweepPlan(res.data);
      toast.success(`Deployed ${res.data.tasksCreated} sweeper task(s)`);
    } catch (e) { setErr('Sweeping deploy failed.'); toast.error('Sweeping deploy failed'); }
    setBusy('');
  };

  const handleCctvDetect = async () => {
    if (!cctvForm.file) return toast.error('Choose an image first');
    setBusy('cctv'); setErr(null); setCctvResult(null);
    try {
      const fd = new FormData();
      fd.append('image', cctvForm.file);
      fd.append('lat', cctvForm.lat);
      fd.append('lng', cctvForm.lng);
      const res = await detectCctvFrame(fd);
      setCctvResult(res.data);
      if (res.data.detection.garbageDetected) toast.warning('Garbage detected — incident auto-created');
      else toast.success('Frame clear — no incident created');
    } catch (e) { setErr('CCTV detection failed.'); toast.error('CCTV detection failed'); }
    setBusy('');
  };

  const mapBins = (bins.length ? bins : escalated).map((b) => ({
    binId: b.binId,
    _id: b._id,
    zone: b.zone,
    location: b.location,
    currentLevel: b.currentLevel != null ? b.currentLevel : (b.currentLevel === undefined && b.riskScore != null ? b.riskScore : undefined),
    short: b.binId ? b.binId.toString().replace(/^BIN-?/, '') : undefined,
    riskScore: escalated.find((r) => r.binId === b.binId)?.riskScore ?? b.riskScore,
  }));

  const heatPoints = mapBins
    .filter((b) => b.location && b.location.lat != null)
    .map((b) => ({ lat: b.location.lat, lng: b.location.lng, intensity: Math.max(0.05, (b.riskScore != null ? b.riskScore : b.currentLevel || 0) / 100) }));

  const activeIncidents = incidents.filter((i) => ['open', 'assigned', 'in-progress'].includes(i.status));
  const totalDemand = routes.reduce((s, r) => s + (r.totalDemandKg || 0), 0);
  const fleetSize = new Set(routes.map((r) => r.vehicle)).size;

  const escalatedChartData = escalated.slice(0, 8).map((r) => ({
    bin: r.binId.replace(/^BIN0*/, '#'),
    risk: r.riskScore,
    fill24h: r.predictions?.['24h']?.predictedFillPct || 0,
  }));

  const simCurve = simResult?.trajectories?.[0]?.curve || [];

  return (
    <div className="min-h-screen space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </span>
            NagarAI Command Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Predictive municipal waste &amp; sanitation intelligence — {CITY_NAME}
          </p>
        </div>
        <Badge variant={engineUsed === 'xgboost-live' ? 'success' : 'muted'} className="h-fit">
          <Cpu className="h-3 w-3" /> {engineUsed === 'xgboost-live' ? 'Live XGBoost models' : 'Rule engine (fallback)'}
        </Badge>
      </motion.div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === key ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === key && (
              <motion.div layoutId="tab-pill" className="absolute inset-0 rounded-lg bg-primary" transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} />
            )}
            <span className="relative flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {err && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-lg bg-danger-500/10 px-4 py-2.5 text-sm text-danger-600 dark:text-danger-400"
          >
            {err}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && <p className="text-sm text-muted-foreground">Loading city state…</p>}

      <TabTransition tabKey={tab}>
      {/* ============ OVERVIEW ============ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <AnimatedStat icon={Trash2} label="Bins tracked" value={bins.length} tone="brand" />
            <AnimatedStat icon={AlertTriangle} label="Overflow-risk (24h)" value={escalated.length} tone="danger" />
            <AnimatedStat icon={Sparkles} label="Active incidents" value={activeIncidents.length} tone="signal" />
            <AnimatedStat icon={CalendarClock} label="Upcoming events" value={events.length} tone="brand" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Live city map</CardTitle></CardHeader>
              <CardContent>
                <NagaraiMap bins={mapBins} heat={heatPoints} routes={routes} center={CITY_CENTER} zoom={CITY_DEFAULT_ZOOM} height="360px" />
                {!mapBins.length && <p className="mt-2 text-sm text-muted-foreground">No bin coordinates available yet.</p>}
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span className="text-success-500">● low</span>
                  <span className="text-signal-500">● med</span>
                  <span className="text-danger-500">● high</span>
                  <span>(heat = waste density)</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Predicted overflow hotspots</CardTitle></CardHeader>
              <CardContent>
                {escalatedChartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={escalatedChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="bin" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="fill24h" name="24h fill %" radius={[4, 4, 0, 0]}>
                        {escalatedChartData.map((d, i) => (
                          <Cell key={i} fill={d.risk >= 70 ? CHART_COLORS.danger : d.risk >= 40 ? CHART_COLORS.warning : CHART_COLORS.success} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-2 max-h-56 overflow-auto">
                  <table className="w-full">
                    <thead><tr><Th>Bin</Th><Th>Zone</Th><Th>24h fill</Th><Th>Risk</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {escalated.slice(0, 10).map((r) => (
                        <tr key={r.binId}>
                          <Td className="font-mono-data font-medium">{r.binId}</Td>
                          <Td className="text-muted-foreground">{r.zone || '—'}</Td>
                          <Td className={pctTone(r.predictions?.['24h']?.predictedFillPct || 0)}>
                            {r.predictions?.['24h']?.predictedFillPct != null ? `${r.predictions['24h'].predictedFillPct}%` : '—'}
                          </Td>
                          <Td><Badge variant={riskVariant(r.riskScore)}>{riskLabel(r.riskScore)} {r.riskScore}</Badge></Td>
                        </tr>
                      ))}
                      {!escalated.length && <tr><Td className="text-muted-foreground">No overflow-risk bins right now.</Td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Upcoming events &amp; sanitation impact</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full">
                <thead><tr><Th>Event</Th><Th>Type</Th><Th>Attendance</Th><Th>Spike</Th><Th>Extra bins</Th><Th>Extra vehicles</Th><Th>Peak</Th></tr></thead>
                <tbody className="divide-y divide-border">
                  {events.map((ev) => (
                    <tr key={ev._id}>
                      <Td className="font-medium">{ev.name}</Td>
                      <Td className="text-muted-foreground">{ev.type}</Td>
                      <Td>{fmt(ev.expectedAttendance)}</Td>
                      <Td className="text-danger-600 dark:text-danger-400">{ev.wasteMultiplier}×</Td>
                      <Td>{ev.recommended?.extraBins || '—'}</Td>
                      <Td>{ev.recommended?.extraVehicles || '—'}</Td>
                      <Td className="text-muted-foreground">{ev.recommended ? `${ev.recommended.peakWasteStart}:00–${ev.recommended.peakWasteEnd}:00` : '—'}</Td>
                    </tr>
                  ))}
                  {!events.length && <tr><Td className="text-muted-foreground">No upcoming events.</Td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============ PREDICTIONS ============ */}
      {tab === 'prediction' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="h-4 w-4" /> Prediction engine {engineUsed === 'xgboost-live' ? '— real XGBoost models' : '— rule/seasonal'}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Fill % across 1h/6h/12h/24h/48h/7d for every bin.</p>
            <Button
              onClick={async () => {
                setBusy('pred'); setErr(null);
                try { const r = await runPredictions({ weather: 'clear' }); setPredTable(r.data?.results || []); setEngineUsed(r.data?.engine || 'rule'); }
                catch { setErr('Prediction failed.'); }
                setBusy('');
              }}
              disabled={busy === 'pred'}
            >
              {busy === 'pred' && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === 'pred' ? 'Running…' : 'Run prediction now'}
            </Button>
            <div className="max-h-[28rem] overflow-auto">
              {predTable.length ? (
                <table className="w-full">
                  <thead><tr><Th>Bin</Th><Th>Zone</Th><Th>Now</Th><Th>6h</Th><Th>12h</Th><Th>24h</Th><Th>48h</Th><Th>Risk</Th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {predTable.map((r) => (
                      <tr key={r.binId}>
                        <Td className="font-mono-data font-medium">{r.binId}</Td>
                        <Td className="text-muted-foreground">{r.zone || '—'}</Td>
                        <Td>{r.currentLevel}%</Td>
                        <Td className={pctTone(r.predictions?.['6h']?.predictedFillPct)}>{r.predictions?.['6h']?.predictedFillPct}%</Td>
                        <Td className={pctTone(r.predictions?.['12h']?.predictedFillPct)}>{r.predictions?.['12h']?.predictedFillPct}%</Td>
                        <Td className={pctTone(r.predictions?.['24h']?.predictedFillPct)}>{r.predictions?.['24h']?.predictedFillPct}%</Td>
                        <Td>{r.predictions?.['48h']?.predictedFillPct}%</Td>
                        <Td><Badge variant={riskVariant(r.riskScore)}>{r.riskScore}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-muted-foreground">Click "Run prediction now" to populate.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ ROUTES ============ */}
      {tab === 'routes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleGenerate} disabled={!!busy}>{busy === 'generate' ? 'Generating…' : 'Generate routes'}</Button>
            <Button variant="outline" onClick={handleDeploy} disabled={!!busy}>{busy === 'deploy' ? 'Deploying…' : 'Deploy routes → create tasks'}</Button>
            <Button variant="outline" onClick={handleAdvanceDay} disabled={!!busy || !routes.length}>
              {busy === 'advance' ? 'Advancing…' : 'Complete today\'s collection → advance day'}
            </Button>
            {routeMeta.engine && (
              <Badge variant={routeMeta.engine === 'ortools' ? 'success' : 'muted'}>
                <Cpu className="h-3 w-3" /> {routeMeta.engine === 'ortools' ? 'OR-Tools optimizer' : 'Greedy CVRP (fallback)'}
              </Badge>
            )}
            {routeMeta.workerAssignmentEngine && (
              <Badge variant={routeMeta.workerAssignmentEngine === 'ml-service' ? 'success' : 'muted'}>
                <Users2 className="h-3 w-3" /> {routeMeta.workerAssignmentEngine === 'ml-service' ? 'Skill-matched crews' : 'Round-robin crews'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The loop: <strong>Run prediction</strong> (Predictions tab) finds risk → bins ≥90% full (or ≥90 predicted risk) become
            mandatory stops, right-sized trucks (1–20t tiers) are dispatched for them, and bins at 70–89% get folded into
            whichever route already passes within 600m — <strong>Complete today's collection</strong> then resets the bins that
            were picked up and carries every other bin's predicted growth into tomorrow's starting level.
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <AnimatedStat label="Critical bins (≥90%)" value={routeMeta.criticalBins} tone="danger" icon={AlertTriangle} />
            <AnimatedStat label="Opportunistic (70-89%)" value={routeMeta.opportunisticBins} tone="signal" icon={Trash2} />
            <AnimatedStat label="Vehicles in plan" value={fleetSize} tone="brand" icon={Truck} />
            <AnimatedStat label="Total load (kg)" value={totalDemand} tone="brand" icon={Trash2} />
            <AnimatedStat label="Unassigned bins" value={unassigned.length} tone="danger" icon={AlertTriangle} />
          </div>
          {dayResult && (
            <Card>
              <CardHeader><CardTitle>Day advanced</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Collected (reset)</span><div className="text-lg font-semibold text-success-600 dark:text-success-400">{dayResult.collected}</div></div>
                  <div><span className="text-muted-foreground">Carried over (grew)</span><div className="text-lg font-semibold text-signal-600 dark:text-signal-400">{dayResult.advanced}</div></div>
                  <div><span className="text-muted-foreground">Untouched (no zone)</span><div className="text-lg font-semibold">{dayResult.untouched}</div></div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Run a new prediction to see tomorrow's risk based on this.</p>
              </CardContent>
            </Card>
          )}
          {routes.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Route overlay — each color is one vehicle, numbered stops are visit order</CardTitle></CardHeader>
              <CardContent>
                <NagaraiMap
                  bins={mapBins}
                  routes={routes}
                  depot={routeMeta.depot}
                  routeStopMarkers
                  center={CITY_CENTER}
                  zoom={CITY_DEFAULT_ZOOM}
                  height="420px"
                />
              </CardContent>
            </Card>
          )}
          {routes.map((r, i) => {
            const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
            const criticalCount = (r.stops || []).filter((s) => s.tier !== 'opportunistic').length;
            const onWayCount = (r.stops || []).filter((s) => s.tier === 'opportunistic').length;
            return (
              <Card key={r.vehicle}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                    <Truck className="h-4 w-4" />
                    {r.truckLabel || r.vehicle}
                    <Badge variant="muted" className="font-mono-data text-[10px]">{r.matchedVehicleNo || r.vehicle}</Badge>
                    <Badge variant="success">{r.utilizationPct ?? 0}% loaded</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {criticalCount} critical stop{criticalCount === 1 ? '' : 's'}
                    {onWayCount > 0 && <> + {onWayCount} picked up on the way</>} ·{' '}
                    {fmt(r.totalDemandKg)} / {fmt(r.vehicleCapacityKg)} kg · {fmt(r.roadDistanceM ?? r.totalDistanceM)} m
                    {r.roadDurationS ? ` · ~${Math.round(r.roadDurationS / 60)} min` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.stops?.map((s, si) => (
                      <Badge
                        key={s.binId}
                        variant={s.tier === 'opportunistic' ? 'muted' : riskVariant(s.priority || 0)}
                        className={cn('gap-1', s.tier === 'opportunistic' && 'border-dashed')}
                        title={s.tier === 'opportunistic' ? 'Picked up on the way (not a mandatory stop)' : 'Critical — mandatory stop'}
                      >
                        <span
                          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ background: color }}
                        >
                          {si + 1}
                        </span>
                        {s.binId}
                        {s.tier === 'opportunistic' && <span className="text-[9px] opacity-70">on the way</span>}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!routes.length && !busy && <p className="text-sm text-muted-foreground">Generate routes to see the plan.</p>}
        </div>
      )}

      {/* ============ BIN OPTIMIZER ============ */}
      {tab === 'bins' && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Where should bins physically go? For every zone, this scores the zone center plus each nearby landmark
            (market, restaurant...) on predicted waste, footfall, food-business density, overflow history, population,
            and distance from existing bins — then recommends <strong>add</strong> a new bin (high demand, no bin nearby),
            <strong> upgrade</strong> capacity (existing bin too small for demand), <strong>relocate</strong> (oversized bin
            in a low-demand spot), or no action. This is about bin <em>placement/sizing</em>, separate from Routes & Fleet's
            day-to-day collection planning.
          </p>
          <Button onClick={handleOptimizeBins} disabled={!!busy}>{busy === 'bins' ? 'Optimizing…' : 'Run Bin Demand Score optimization'}</Button>
          <Card>
            <CardHeader><CardTitle>Recommended actions</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full">
                <thead><tr><Th>Action</Th><Th>Zone</Th><Th>Demand</Th><Th>Capacity</Th><Th>Coverage</Th><Th>Reason</Th><Th>Priority</Th></tr></thead>
                <tbody className="divide-y divide-border">
                  {recommendations.map((r, i) => (
                    <tr key={r._id || i}>
                      <Td><Badge variant={r.action === 'add_bin' ? 'danger' : r.action === 'upgrade_capacity' ? 'warning' : 'success'}>{r.action?.replace(/_/g, ' ')}</Badge></Td>
                      <Td>{r.zone?.name || r.zone?.code || '—'}</Td>
                      <Td>{r.predictedDemandLDay != null ? `${fmt(r.predictedDemandLDay)} L` : '—'}</Td>
                      <Td>{r.recommendedCapacityL ? `${r.recommendedCapacityL} L` : '—'}</Td>
                      <Td>{r.currentCoverage || '—'}</Td>
                      <Td className="text-xs text-muted-foreground">{r.reason}</Td>
                      <Td>{r.priority}</Td>
                    </tr>
                  ))}
                  {!recommendations.length && <tr><Td className="text-muted-foreground">Run optimization to see recommended bin actions.</Td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============ INCIDENTS ============ */}
      {tab === 'incidents' && (
        <Card>
          <CardHeader><CardTitle>Sanitation incidents ({activeIncidents.length} active)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full">
              <thead><tr><Th>ID</Th><Th>Source</Th><Th>Type</Th><Th>Status</Th><Th>Priority</Th><Th>Dup</Th><Th>Zone</Th></tr></thead>
              <tbody className="divide-y divide-border">
                {incidents.map((i) => (
                  <tr key={i._id}>
                    <Td className="font-mono-data font-medium">{i.incidentId}</Td>
                    <Td>{i.source === 'cctv' ? <Badge variant="muted"><Camera className="h-3 w-3" /> cctv</Badge> : i.source}</Td>
                    <Td className="text-muted-foreground">{i.type?.replace(/_/g, ' ')}</Td>
                    <Td><Badge variant={statusVariant(i.status)}>{i.status}</Badge></Td>
                    <Td><Badge variant={riskVariant(i.priority)}>{i.priority}</Badge></Td>
                    <Td>{i.duplicateCount > 1 ? i.duplicateCount : '—'}</Td>
                    <Td className="text-muted-foreground">{i.zone?.code || i.zone || '—'}</Td>
                  </tr>
                ))}
                {!incidents.length && <tr><Td className="text-muted-foreground">No incidents reported yet.</Td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ============ WORKFORCE ============ */}
      {tab === 'workforce' && (
        <Card>
          <CardHeader><CardTitle>Staffing needs by zone</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Resource planning, not a live schedule: for each zone, this estimates how many collectors, vehicles,
              sweepers, and supervisors are needed to keep up with that zone's predicted daily waste (from footfall and
              bin density) and current event multiplier — a capacity-planning number for "do we have enough people,"
              separate from Routes & Fleet's actual truck dispatch for today.
            </p>
            <table className="w-full">
              <thead><tr><Th>Zone</Th><Th>Name</Th><Th>Bins</Th><Th>Footfall</Th><Th>Event</Th><Th>Collectors</Th><Th>Vehicles</Th><Th>Sweepers</Th><Th>Total</Th></tr></thead>
              <tbody className="divide-y divide-border">
                {workforce.map((w, i) => (
                  <tr key={w.zone || i}>
                    <Td className="font-medium">{w.zone}</Td>
                    <Td className="text-muted-foreground">{w.name}</Td>
                    <Td>{w.bins}</Td>
                    <Td>{fmt(w.footfall)}</Td>
                    <Td>{w.eventMultiplier}×</Td>
                    <Td>{w.staffing.collectors}</Td>
                    <Td>{w.staffing.vehicles}</Td>
                    <Td>{w.staffing.sweepers}</Td>
                    <Td className="font-semibold">{w.staffing.totalStaff}</Td>
                  </tr>
                ))}
                {!workforce.length && <tr><Td className="text-muted-foreground">No zone data.</Td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ============ SIMULATOR ============ */}
      {tab === 'simulator' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> What-If Simulator</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <select className="rounded-lg border border-border bg-card px-3 py-2 text-sm" value={simForm.eventType} onChange={(e) => setSimForm({ ...simForm, eventType: e.target.value })}>
                <option value="">No event</option>
                <option value="festival">Festival</option>
                <option value="concert">Concert</option>
                <option value="sports">Sports</option>
                <option value="fair">Fair</option>
                <option value="market">Market</option>
              </select>
              <input className="rounded-lg border border-border bg-card px-3 py-2 text-sm" type="number" placeholder="Expected attendance" value={simForm.expectedAttendance} onChange={(e) => setSimForm({ ...simForm, expectedAttendance: parseInt(e.target.value) || 0 })} />
              <select className="rounded-lg border border-border bg-card px-3 py-2 text-sm" value={simForm.weather} onChange={(e) => setSimForm({ ...simForm, weather: e.target.value })}>
                <option value="clear">Clear</option>
                <option value="rain">Rain</option>
                <option value="heavy_rain">Heavy rain</option>
              </select>
              <input className="rounded-lg border border-border bg-card px-3 py-2 text-sm" type="number" min="1" max="168" placeholder="Hours" value={simForm.hours} onChange={(e) => setSimForm({ ...simForm, hours: parseInt(e.target.value) || 24 })} />
              <input className="rounded-lg border border-border bg-card px-3 py-2 text-sm" type="number" min="0" max="24" placeholder="Collection freq (hrs)" value={simForm.collectionFrequencyHrs} onChange={(e) => setSimForm({ ...simForm, collectionFrequencyHrs: parseInt(e.target.value) || 0 })} />
            </div>
            <Button onClick={runSimulation} disabled={busy === 'sim'}>{busy === 'sim' ? 'Simulating…' : 'Run Simulation'}</Button>

            {simResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 border-t border-border pt-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <AnimatedStat label="Bins simulated" value={simResult.summary.binsSimulated} tone="brand" />
                  <AnimatedStat label="Overflows" value={simResult.summary.overflows} tone="danger" />
                  <AnimatedStat label="Peak waste (kg)" value={simResult.summary.peakInventoryKg} tone="signal" />
                  <AnimatedStat label="First overflow (hr)" value={simResult.summary.firstOverflowHour ?? 0} tone="brand" />
                </div>
                {simCurve.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>Sample trajectory — {simResult.trajectories[0].binId}</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={simCurve}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} unit="h" />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} unit="%" />
                          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="fillPct" stroke="#0d9488" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader><CardTitle>Staffing needed for scenario</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full">
                      <thead><tr><Th>Zone</Th><Th>Bins</Th><Th>Event</Th><Th>Collectors</Th><Th>Vehicles</Th><Th>Sweepers</Th><Th>Total</Th></tr></thead>
                      <tbody className="divide-y divide-border">
                        {simResult.staffing.map((s, i) => (
                          <tr key={s.zone || i}>
                            <Td className="font-medium">{s.zone} <span className="text-muted-foreground">{s.name}</span></Td>
                            <Td>{s.bins}</Td>
                            <Td>{s.eventMultiplier}×</Td>
                            <Td>{s.staffing.collectors}</Td>
                            <Td>{s.staffing.vehicles}</Td>
                            <Td>{s.staffing.sweepers}</Td>
                            <Td className="font-semibold">{s.staffing.totalStaff}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============ SWEEPING ============ */}
      {tab === 'sweeping' && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Two separate steps. <strong>Analysis</strong> scores how quickly each zone's roads get dirty (footfall,
            commercial density, markets, events, weather) and recommends a sweep frequency — 1x/week for a quiet
            residential road up to 3x daily for a busy market street. <strong>Plan/Deploy</strong> is the actual
            dispatch: it builds a sweeper route through open litter incidents and high-footfall zones (a TSP tour from
            the depot, split into ≤25km shifts) and, on Deploy, creates real sweeping tasks assigned to workers with the
            sweeping skill.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleAnalyzeSweeping} disabled={!!busy}>
              {busy === 'sweep' ? 'Analyzing…' : 'Run Predictive Sweeping analysis'}
            </Button>
            <Button variant="outline" onClick={handlePlanSweeping} disabled={!!busy}>
              {busy === 'sweepplan' ? 'Planning…' : 'Preview sweep route'}
            </Button>
            <Button variant="outline" onClick={handleDeploySweeping} disabled={!!busy}>
              {busy === 'sweepdeploy' ? 'Deploying…' : 'Deploy sweepers → create tasks'}
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wind className="h-4 w-4" /> Road Dirt Accumulation Score by zone</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full">
                <thead><tr><Th>Zone</Th><Th>Road type</Th><Th>Dirt score</Th><Th>Frequency</Th><Th>Peak window</Th><Th>Why</Th></tr></thead>
                <tbody className="divide-y divide-border">
                  {sweepNeeds.map((n) => (
                    <tr key={n._id}>
                      <Td className="font-medium">{n.zone?.name || n.zone?.code || '—'}</Td>
                      <Td className="text-muted-foreground">{n.roadType?.replace(/_/g, ' ')}</Td>
                      <Td><div className="flex items-center gap-2"><DirtBar score={n.dirtScore} /><span className="font-mono-data text-xs">{n.dirtScore}</span></div></Td>
                      <Td><Badge variant={n.dirtScore >= 60 ? 'danger' : n.dirtScore >= 35 ? 'warning' : 'success'}>{n.frequencyLabel}</Badge></Td>
                      <Td className="text-muted-foreground">{n.peakStartHour}:00–{n.peakEndHour}:00</Td>
                      <Td className="text-xs text-muted-foreground">{n.contributors?.join(', ')}</Td>
                    </tr>
                  ))}
                  {!sweepNeeds.length && <tr><Td className="text-muted-foreground">Run the analysis to see per-zone sweeping recommendations.</Td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {sweepPlan && (
            <Card>
              <CardHeader>
                <CardTitle>Sweep route {sweepPlan.tasksCreated ? `— ${sweepPlan.tasksCreated} task(s) deployed` : '(preview)'}</CardTitle>
              </CardHeader>
              <CardContent>
                {!sweepPlan.candidates ? (
                  <p className="text-sm text-muted-foreground">
                    No open litter incidents and no zone currently above the high-footfall threshold — nothing to sweep proactively right now.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {sweepPlan.candidates} stop{sweepPlan.candidates === 1 ? '' : 's'} · {sweepPlan.totalDistanceKm} km total ·{' '}
                      {sweepPlan.segments.length} sweeper shift{sweepPlan.segments.length === 1 ? '' : 's'}
                    </p>
                    <div className="space-y-3">
                      {sweepPlan.segments.map((s, i) => (
                        <div key={i} className="rounded-lg border border-border p-3">
                          <p className="mb-1 text-sm font-medium">Shift {i + 1} — {s.distanceKm} km · ~{s.estimatedHrs}h</p>
                          <div className="flex flex-wrap gap-1.5">
                            {s.stops.map((st, si) => (
                              <Badge key={si} variant={st.type === 'incident' ? 'danger' : 'muted'} className="gap-1">
                                {st.type === 'incident' ? <AlertTriangle className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                                {st.source}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ============ CCTV ============ */}
      {tab === 'cctv' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4" /> Simulate a CCTV frame</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload a frame from a fixed camera location. Runs a YOLOv8n object-density detector via ml-service (falls back to a pixel-clutter heuristic if that service is unreachable — check "Method" below to see which one ran) — it flags visual clutter and auto-creates an incident, demonstrating the full closed-loop flow.
              </p>
              <input
                type="file" accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setCctvForm((f) => ({ ...f, file, preview: file ? URL.createObjectURL(file) : null }));
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
              />
              {cctvForm.preview && <img src={cctvForm.preview} alt="preview" className="max-h-48 rounded-lg border border-border object-cover" />}
              <div className="grid grid-cols-2 gap-3">
                <input className="rounded-lg border border-border bg-card px-3 py-2 text-sm" placeholder="Camera latitude" value={cctvForm.lat} onChange={(e) => setCctvForm((f) => ({ ...f, lat: e.target.value }))} />
                <input className="rounded-lg border border-border bg-card px-3 py-2 text-sm" placeholder="Camera longitude" value={cctvForm.lng} onChange={(e) => setCctvForm((f) => ({ ...f, lng: e.target.value }))} />
              </div>
              <Button onClick={handleCctvDetect} disabled={busy === 'cctv'}>{busy === 'cctv' ? 'Analyzing…' : 'Analyze frame'}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Detection result</CardTitle></CardHeader>
            <CardContent>
              {!cctvResult && <p className="text-sm text-muted-foreground">Analyze a frame to see the AI detection output.</p>}
              {cctvResult && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={cctvResult.detection.garbageDetected ? 'danger' : 'success'}>
                      {cctvResult.detection.garbageDetected ? 'Garbage detected' : 'Clear'}
                    </Badge>
                    <Badge variant="muted">{Math.round(cctvResult.detection.confidence * 100)}% confidence</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Severity</dt><dd>{cctvResult.detection.severity}</dd>
                    <dt className="text-muted-foreground">Estimated area</dt><dd>{cctvResult.detection.estimatedAreaM2} m²</dd>
                    <dt className="text-muted-foreground">Method</dt>
                    <dd>
                      <Badge variant={cctvResult.detection.method?.startsWith('yolo') ? 'success' : 'muted'} className="text-xs">
                        {cctvResult.detection.method?.startsWith('yolo') ? 'YOLOv8n (live)' : 'Heuristic (fallback)'}
                      </Badge>
                    </dd>
                  </dl>
                  {cctvResult.incident && (
                    <div className="rounded-lg bg-muted p-3 text-sm">
                      Incident <span className="font-mono-data font-medium">{cctvResult.incident.incidentId}</span> created, priority {cctvResult.incident.priority}
                      {cctvResult.task && <> — task <span className="font-mono-data">{cctvResult.task.taskId}</span> dispatched.</>}
                    </div>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      </TabTransition>
    </div>
  );
}
