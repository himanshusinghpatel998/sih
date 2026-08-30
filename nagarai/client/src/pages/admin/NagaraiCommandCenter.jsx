import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Trash2,
  AlertTriangle,
  CalendarClock,
  Cpu,
  Truck,
  Users2,
  FlaskConical,
  Wind,
  Camera,
  Sparkles,
  MapPin,
  Loader2,
  ListChecks,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import NagaraiMap from "../../components/map/NagaraiMap";
import API from "../../services/api";
import {
  runPredictions,
  getEvents,
  getBins,
  optimizeBins,
  getBinRecommendations,
  generateRoutes,
  deployRoutes,
  getWorkforce,
  getTasks,
  deleteTask,
  getIncidents,
  getMLStatus,
  analyzeSweeping,
  getSweepingNeeds,
  detectCctvFrame,
} from "../../services/api";
import { Button } from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import AnimatedStat from "../../components/ui/AnimatedStat";
import TabTransition from "../../components/ui/TabTransition";
import { cn } from "../../lib/utils";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const pctTone = (p) =>
  p >= 70
    ? "text-danger-600 dark:text-danger-400"
    : p >= 40
      ? "text-signal-600 dark:text-signal-400"
      : "text-success-600 dark:text-success-400";
const riskVariant = (p) =>
  p >= 70 ? "danger" : p >= 40 ? "warning" : "success";
const riskLabel = (p) => (p >= 70 ? "HIGH" : p >= 40 ? "MED" : "LOW");
const statusVariant = (status) => {
  const s = (status || "").toLowerCase();
  if (["completed", "resolved"].includes(s)) return "success";
  if (["in-progress", "in_progress", "assigned"].includes(s)) return "warning";
  return "muted";
};

// Live fill classification for the "Live Metrics" panel
const fillStatus = (pct) => {
  if (pct == null) return { label: "Unknown", variant: "muted" };
  if (pct >= 90) return { label: "Critical", variant: "danger" };
  if (pct >= 70) return { label: "Nearly full", variant: "danger" };
  if (pct >= 50) return { label: "Half full", variant: "warning" };
  if (pct >= 25) return { label: "Filling", variant: "warning" };
  return { label: "Okay", variant: "success" };
};

// Hardcoded DEMO data keyed deterministically by bin id — used only for the
// demo. Not wired to any sensor feed.
const WASTE_TYPES = ["wet", "mixed", "dry"];
const ZONES_DEMO = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"];
const ZONE_LABEL = {
  Z1: "Old Market",
  Z2: "College Road",
  Z3: "Railway Area",
  Z4: "Residential North",
  Z5: "Food Street",
  Z6: "Riverside Park",
};
const EVENTS = [
  { name: "Food & Cultural Festival", on: "Festival weekend" },
  { name: "Sunday Market", on: "Weekly" },
  { name: "College Convocation", on: "Aug 15" },
  { name: "Religious Gathering", on: "Festival day" },
];
const RESTAURANTS = [12, 5, 8, 3, 18, 6];
const MARKETS = [6, 2, 4, 1, 9, 3];

// Hardcoded DEMO staffing per zone — shown only when the backend returns no
// workforce data so the "Staffing needs by zone" view is always populated.
const WORKFORCE_DEMO = [
  { zone: "Z1", name: "Old Market", bins: 14, footfall: 48000, areaM2: 52000, eventMultiplier: 1.4, collectors: 8, vehicles: 3, sweepers: 6 },
  { zone: "Z2", name: "College Road", bins: 11, footfall: 32000, areaM2: 38000, eventMultiplier: 1.1, collectors: 6, vehicles: 2, sweepers: 4 },
  { zone: "Z3", name: "Railway Area", bins: 9, footfall: 27000, areaM2: 30000, eventMultiplier: 1.2, collectors: 5, vehicles: 2, sweepers: 3 },
  { zone: "Z4", name: "Residential North", bins: 18, footfall: 15000, areaM2: 64000, eventMultiplier: 1.0, collectors: 7, vehicles: 3, sweepers: 5 },
  { zone: "Z5", name: "Food Street", bins: 16, footfall: 41000, areaM2: 26000, eventMultiplier: 1.5, collectors: 9, vehicles: 3, sweepers: 5 },
  { zone: "Z6", name: "Riverside Park", bins: 6, footfall: 9000, areaM2: 45000, eventMultiplier: 1.0, collectors: 3, vehicles: 1, sweepers: 3 },
].map((z) => ({
  zone: z.zone,
  name: z.name,
  bins: z.bins,
  predictedKg: z.footfall * 0.12,
  footfall: z.footfall,
  areaM2: z.areaM2,
  eventMultiplier: z.eventMultiplier,
  staffing: {
    collectors: z.collectors,
    vehicles: z.vehicles,
    sweepers: z.sweepers,
    supervisors: Math.max(0, Math.ceil(z.collectors / 6)),
    totalStaff: z.collectors + z.sweepers + Math.max(0, Math.ceil(z.collectors / 6)),
  },
}));

const getBinDemo = (binId) => {
  const num = parseInt(String(binId).replace(/\D/g, ""), 10) || 100;
  const seed = num % 101;
  const zone = ZONES_DEMO[num % ZONES_DEMO.length];
  const capacityL = [120, 240, 660, 1100][num % 4];
  const currentLevel = 15 + ((seed * 7) % 85);
  const estWasteKg = Math.round((capacityL * 0.7 * (currentLevel / 100)) / 5) * 5;
  const wasteType = WASTE_TYPES[num % WASTE_TYPES.length];
  const iotStatus = num % 8 === 0 ? "offline" : num % 13 === 0 ? "charging" : "online";
  const footfall = 5000 + ((seed * 379) % 45000);
  const avgFillRate = +(2 + ((seed * 13) % 90) / 10).toFixed(1); // %/hr
  const overflows = num % 5 === 0 ? 1 + (num % 3) : 0;
  const rain = +((seed * 17) % 1200) / 100; // mm
  const today = new Date();
  const lastUpdate = today.toISOString().slice(0, 16).replace("T", " ");

  const hoursAgo = (h) => {
    const d = new Date(today.getTime() - h * 3600 * 1000);
    return d.toISOString().slice(0, 16).replace("T", " ");
  };

  return {
    binId,
    location: {
      lat: +(19 + ((seed * 11) % 6000) / 100000).toFixed(5),
      lng: +(72.87 + ((seed * 17) % 6000) / 100000).toFixed(5),
    },
    capacityL,
    currentLevel,
    estWasteKg,
    wasteType,
    iotStatus,
    lastUpdate,
    zone: `${zone} · ${ZONE_LABEL[zone]}`,
    // ---- Historical ----
    history24h: [14, 22, 30, 41, 55, 68, 76, currentLevel],
    history7d: [12, 30, 48, 61, 74, 88, 95],
    history30d: 31 + ((seed * 3) % 40), // avg daily pick
    wastePerDay: Math.round((estWasteKg || capacityL * 0.4) * 1.8),
    wastePerCollection: Math.round((estWasteKg || 120) * 1.2),
    prevCollectionDates: [
      hoursAgo(8),
      hoursAgo(32),
      hoursAgo(56),
      hoursAgo(80),
    ],
    avgFillRate,
    overflows,
    // ---- Environmental / context ----
    temperature: +(26 + ((seed * 5) % 120) / 10).toFixed(1),
    rainfall: rain,
    humidity: 55 + ((seed * 3) % 40),
    footfall,
    nearbyRestaurants: RESTAURANTS[num % RESTAURANTS.length],
    nearbyMarkets: MARKETS[num % MARKETS.length],
    event: num % 6 === 0 ? EVENTS[num % EVENTS.length] : null,
  };
};

const CHART_COLORS = {
  danger: "#ef4444",
  warning: "#f59e0b",
  success: "#22c55e",
};

const TABS = [
  { key: "overview", label: "Overview", icon: Sparkles },
  { key: "prediction", label: "Predictions", icon: Cpu },
  { key: "routes", label: "Routes & Fleet", icon: Truck },
  { key: "bins", label: "Bin Optimizer", icon: Trash2 },
  { key: "incidents", label: "Incidents", icon: AlertTriangle },
  { key: "workforce", label: "Workforce", icon: Users2 },
  { key: "simulator", label: "What-If", icon: FlaskConical },
  { key: "sweeping", label: "Sweeping", icon: Wind },
  { key: "cctv", label: "CCTV", icon: Camera },
];

function SectionTitle({ children }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      {children}
    </h3>
  );
}

function Th({ children }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  );
}
function Td({ children, className }) {
  return <td className={cn("px-3 py-2 text-sm", className)}>{children}</td>;
}

function DirtBar({ score }) {
  const tone =
    score >= 60
      ? "bg-danger-500"
      : score >= 35
        ? "bg-signal-500"
        : "bg-success-500";
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <motion.div
        className={cn("h-full rounded-full", tone)}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">
        {children}
      </span>
    </div>
  );
}

const SIM_EVENT_LABEL = {
  festival: "Festival",
  concert: "Concert",
  sports: "Sports",
  fair: "Fair",
  market: "Market",
  "": "No event",
};
const SIM_WEATHER_LABEL = {
  clear: "Clear",
  rain: "Rain",
  heavy_rain: "Heavy rain",
};

function SimField({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const simInputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function DetailSection({ icon: Icon, title, children }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h4>
      {children}
    </div>
  );
}

function BinDetailPanel({ demo, onClose }) {
  const st = fillStatus(demo.currentLevel);
  const hist = [...demo.history24h];
  const maxHist = Math.max(100, ...hist);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" /> {demo.binId}
          <Badge variant={st.variant}>{st.label}</Badge>
          <span className="text-xs font-normal text-muted-foreground">
            {demo.zone}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="ml-auto"
          >
            Close
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 1. Current bin status */}
        <DetailSection icon={Activity} title="Current status">
          <DetailRow label="Location">
            {demo.location.lat}, {demo.location.lng}
          </DetailRow>
          <DetailRow label="Bin capacity">{demo.capacityL} L</DetailRow>
          <DetailRow label="Current fill">{demo.currentLevel}%</DetailRow>
          <DetailRow label="Estimated waste">
            {demo.estWasteKg} kg
          </DetailRow>
          <DetailRow label="Waste type">
            <span className="capitalize">{demo.wasteType}</span>
          </DetailRow>
          <DetailRow label="IoT sensor">
            <Badge
              variant={
                demo.iotStatus === "online"
                  ? "success"
                  : demo.iotStatus === "offline"
                    ? "danger"
                    : "warning"
              }
            >
              {demo.iotStatus}
            </Badge>
          </DetailRow>
          <DetailRow label="Last update">{demo.lastUpdate}</DetailRow>
        </DetailSection>

        {/* 2. Historical information */}
        <DetailSection icon={CalendarClock} title="Historical info">
          <div className="mb-3">
            <p className="mb-1 text-xs text-muted-foreground">
              Fill level — last 24h
            </p>
            <div className="flex items-end gap-1">
              {hist.map((v, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-t",
                    fillStatus(v).variant === "danger"
                      ? "bg-danger-500"
                      : fillStatus(v).variant === "warning"
                        ? "bg-signal-500"
                        : "bg-success-500",
                  )}
                  style={{ height: `${(v / maxHist) * 84}px` }}
                  title={`${v}%`}
                />
              ))}
            </div>
          </div>
          <DetailRow label="Avg daily waste">
            {demo.wastePerDay} kg/day
          </DetailRow>
          <DetailRow label="Per collection">
            {demo.wastePerCollection} kg
          </DetailRow>
          <DetailRow label="Avg filling rate">
            {demo.avgFillRate} %/hr
          </DetailRow>
          <DetailRow label="Previous overflows">
            {demo.overflows}
          </DetailRow>
          <DetailRow label="Last collected">
            {demo.prevCollectionDates[0]}
          </DetailRow>
        </DetailSection>

        {/* 3. Environmental / context */}
        <DetailSection icon={Wind} title="Environment & context">
          <DetailRow label="Temperature">
            {demo.temperature} °C
          </DetailRow>
          <DetailRow label="Rainfall">{demo.rainfall} mm</DetailRow>
          <DetailRow label="Humidity">{demo.humidity}%</DetailRow>
          <DetailRow label="Footfall">
            {fmt(demo.footfall)}/day
          </DetailRow>
          <DetailRow label="Nearby restaurants">
            {demo.nearbyRestaurants}
          </DetailRow>
          <DetailRow label="Nearby markets">
            {demo.nearbyMarkets}
          </DetailRow>
          <DetailRow label="Event">
            {demo.event ? (
              <span>
                {demo.event.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({demo.event.on})
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">None scheduled</span>
            )}
          </DetailRow>
        </DetailSection>
      </CardContent>
    </Card>
  );
}

export default function NagaraiCommandCenter() {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [bins, setBins] = useState([]);
  const [escalated, setEscalated] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [events, setEvents] = useState([]);
  const [workforce, setWorkforce] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [optimized, setOptimized] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [mlStatus, setMlStatus] = useState(null);
  const [engineUsed, setEngineUsed] = useState(null);
  const [busy, setBusy] = useState("");
  const [predTable, setPredTable] = useState([]);
  const [selectedBin, setSelectedBin] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [selectedSimBinId, setSelectedSimBinId] = useState(null);
  const [simForm, setSimForm] = useState({
    eventType: "",
    expectedAttendance: 0,
    weather: "clear",
    hours: 24,
    collectionFrequencyHrs: 0,
  });
  const [sweepNeeds, setSweepNeeds] = useState([]);
  const [cctvForm, setCctvForm] = useState({
    lat: "19.076",
    lng: "72.8777",
    file: null,
    preview: null,
  });
  const [cctvResult, setCctvResult] = useState(null);

  const loadCity = useCallback(async () => {
    try {
      const [b, ev, w, inc, ml] = await Promise.all([
        getBins(),
        getEvents({ upcoming: 1 }),
        getWorkforce(),
        getIncidents(),
        getMLStatus(),
      ]);
      setBins(b.data || []);
      setEvents(ev.data || []);
      const wf = w.data || [];
      setWorkforce(wf.length ? wf : WORKFORCE_DEMO);
      setIncidents(inc.data || []);
      setMlStatus(ml.data || null);
      return { bins: b.data || [], events: ev.data || [] };
    } catch (e) {
      setErr("Could not load city data — is the server running & seeded?");
      return { bins: [], events: [] };
    }
  }, []);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { bins: binList } = await loadCity();
      try {
        const pred = await runPredictions({ weather: "clear" });
        const results = (pred.data && pred.data.results) || [];
        setEngineUsed(pred.data?.engine || "rule");
        const escalatedList = results
          .filter(
            (r) =>
              r.riskScore >= 55 ||
              (r.predictions &&
                r.predictions["24h"] &&
                r.predictions["24h"].predictedFillPct >= 80),
          )
          .sort((a, b) => b.riskScore - a.riskScore);
        setEscalated(escalatedList);
        setBins((prev) => (binList.length ? prev : binList));
      } catch (e) {
        setErr(
          "Prediction engine unavailable — check MONGO_URI / ML_SERVICE_URL.",
        );
      }
      // Pre-load every tab's persisted data so nothing renders empty.
      try { setTasks((await getTasks()).data || []); } catch {}
      try { setSweepNeeds((await getSweepingNeeds()).data || []); } catch {}
      try {
        const r = await generateRoutes({ weather: "clear" });
        setRoutes((r.data && r.data.routes) || []);
        setUnassigned((r.data && r.data.unassigned) || []);
      } catch (e) {}
      try {
        const rec = await getBinRecommendations();
        setRecommendations(rec.data || []);
        setOptimized(rec.data.length > 0);
      } catch (e) {}
      setLoading(false);
    })();
  }, [loadCity]);

  const handleGenerate = async () => {
    setBusy("generate");
    setErr(null);
    try {
      const r = await generateRoutes({ weather: "clear" });
      setRoutes((r.data && r.data.routes) || []);
      setUnassigned((r.data && r.data.unassigned) || []);
      toast.success("Routes generated");
    } catch (e) {
      setErr("Route generation failed.");
      toast.error("Route generation failed");
    }
    setBusy("");
  };

  const handleDeploy = async () => {
    setBusy("deploy");
    setErr(null);
    try {
      const r = await deployRoutes({ weather: "clear" });
      setRoutes((r.data && r.data.routes) || []);
      setUnassigned((r.data && r.data.unassigned) || []);
      const t = await getTasks();
      setTasks(t.data || []);
      toast.success("Routes deployed — tasks created");
    } catch (e) {
      setErr("Deploy failed.");
      toast.error("Deploy failed");
    }
    setBusy("");
  };

  // Opens the confirmation dialog for a specific task
  const requestDelete = (id) => setConfirmDelete(id);

  // Performs the actual delete (called after the undo-toast window closes)
  const performDelete = async (id) => {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => (t._id || t.taskId) !== id));
    } catch (e) {
      toast.error("Failed to delete task");
    }
  };

  // Confirmed from dialog: show an undo toast and delete only when it expires
  const confirmDeleteTask = async () => {
    const id = confirmDelete;
    setConfirmDelete(null);
    if (!id) return;

    let cancelled = false;
    toast("Deleting task…", {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true;
          toast.success("Delete undone");
        },
      },
    });

    // Wait for the toast window; perform the delete if not undone
    setTimeout(async () => {
      if (cancelled) return;
      await performDelete(id);
      toast.success("Task deleted");
    }, 6000);
  };

  const handleOptimizeBins = async () => {
    setBusy("bins");
    setErr(null);
    try {
      await optimizeBins();
      const recs = await getBinRecommendations();
      setRecommendations(recs.data || []);
      setOptimized(true);
      toast.success("Bin optimization complete");
    } catch (e) {
      setErr("Bin optimization failed.");
      toast.error("Bin optimization failed");
    }
    setBusy("");
  };

  const runSimulation = async () => {
    setBusy("sim");
    setErr(null);
    setSimResult(null);
    try {
      const res = await API.post("/simulate", simForm);
      setSimResult(res.data);
      setSelectedSimBinId(res.data.trajectories?.[0]?.binId ?? null);
    } catch (e) {
      setErr("Simulation failed.");
      toast.error("Simulation failed");
    }
    setBusy("");
  };

  const handleAnalyzeSweeping = async () => {
    setBusy("sweep");
    setErr(null);
    try {
      const res = await analyzeSweeping({ weather: "clear" });
      setSweepNeeds(res.data.needs || []);
      toast.success(
        `${res.data.count} zone sweeping recommendations generated`,
      );
    } catch (e) {
      setErr("Sweeping analysis failed.");
      toast.error("Sweeping analysis failed");
    }
    setBusy("");
  };

  const handleCctvDetect = async () => {
    if (!cctvForm.file) return toast.error("Choose an image first");
    setBusy("cctv");
    setErr(null);
    setCctvResult(null);
    try {
      const fd = new FormData();
      fd.append("image", cctvForm.file);
      fd.append("lat", cctvForm.lat);
      fd.append("lng", cctvForm.lng);
      const res = await detectCctvFrame(fd);
      setCctvResult(res.data);
      if (res.data.detection.garbageDetected)
        toast.warning("Garbage detected — incident auto-created");
      else toast.success("Frame clear — no incident created");
    } catch (e) {
      setErr("CCTV detection failed.");
      toast.error("CCTV detection failed");
    }
    setBusy("");
  };

  const mapBins = (bins.length ? bins : escalated).map((b) => ({
    binId: b.binId,
    _id: b._id,
    zone: b.zone,
    location: b.location,
    currentLevel:
      b.currentLevel != null
        ? b.currentLevel
        : b.currentLevel === undefined && b.riskScore != null
          ? b.riskScore
          : undefined,
    short: b.binId ? b.binId.toString().replace(/^BIN-?/, "") : undefined,
    riskScore:
      escalated.find((r) => r.binId === b.binId)?.riskScore ?? b.riskScore,
  }));

  const heatPoints = mapBins
    .filter((b) => b.location && b.location.lat != null)
    .map((b) => ({
      lat: b.location.lat,
      lng: b.location.lng,
      intensity: Math.max(
        0.05,
        (b.riskScore != null ? b.riskScore : b.currentLevel || 0) / 100,
      ),
    }));

  const activeIncidents = incidents.filter((i) =>
    ["open", "assigned", "in-progress"].includes(i.status),
  );
  const totalDemand = routes.reduce((s, r) => s + (r.totalDemandKg || 0), 0);
  const fleetSize = new Set(routes.map((r) => r.vehicle)).size;

  const escalatedChartData = escalated.slice(0, 8).map((r) => ({
    bin: r.binId.replace(/^BIN0*/, "#"),
    risk: r.riskScore,
    fill24h: r.predictions?.["24h"]?.predictedFillPct || 0,
  }));

  const simSelected =
    simResult?.trajectories?.find((t) => t.binId === selectedSimBinId) ||
    simResult?.trajectories?.[0];
  const simCurve = simSelected?.curve || [];

  return (
    <div className="min-h-screen space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <p className="mt-1 text-sm text-muted-foreground">
            Predictive municipal waste &amp; sanitation intelligence — NagarCity
          </p>
        </div>
        <Badge
          variant={engineUsed === "xgboost-live" ? "success" : "muted"}
          className="h-fit"
        >
          <Cpu className="h-3 w-3" />{" "}
          {engineUsed === "xgboost-live"
            ? "Live XGBoost models"
            : "Rule engine (fallback)"}
        </Badge>
      </motion.div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === key
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === key && (
              <motion.div
                layoutId="tab-pill"
                className="absolute inset-0 rounded-lg bg-primary"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {err && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-lg bg-danger-500/10 px-4 py-2.5 text-sm text-danger-600 dark:text-danger-400"
          >
            {err}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading city state…</p>
      )}

      <TabTransition tabKey={tab}>
        {/* ============ OVERVIEW ============ */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <AnimatedStat
                icon={Trash2}
                label="Bins tracked"
                value={bins.length}
                tone="brand"
              />
              <AnimatedStat
                icon={AlertTriangle}
                label="Overflow-risk (24h)"
                value={escalated.length}
                tone="danger"
              />
              <AnimatedStat
                icon={Sparkles}
                label="Active incidents"
                value={activeIncidents.length}
                tone="signal"
              />
              <AnimatedStat
                icon={CalendarClock}
                label="Upcoming events"
                value={events.length}
                tone="brand"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Live city map
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <NagaraiMap
                    bins={mapBins}
                    heat={heatPoints}
                    routes={routes}
                    center={{ lat: 19.076, lng: 72.8777 }}
                    zoom={14}
                    height="360px"
                  />
                  {!mapBins.length && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No bin coordinates available yet.
                    </p>
                  )}
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span className="text-success-500">● low</span>
                    <span className="text-signal-500">● med</span>
                    <span className="text-danger-500">● high</span>
                    <span>(heat = waste density)</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Predicted overflow
                    hotspots
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {escalatedChartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={escalatedChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="bin"
                          tick={{
                            fontSize: 11,
                            fill: "var(--muted-foreground)",
                          }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Bar
                          dataKey="fill24h"
                          name="24h fill %"
                          radius={[4, 4, 0, 0]}
                        >
                          {escalatedChartData.map((d, i) => (
                            <Cell
                              key={i}
                              fill={
                                d.risk >= 70
                                  ? CHART_COLORS.danger
                                  : d.risk >= 40
                                    ? CHART_COLORS.warning
                                    : CHART_COLORS.success
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  <div className="mt-2 max-h-56 overflow-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <Th>Bin</Th>
                          <Th>Zone</Th>
                          <Th>24h fill</Th>
                          <Th>Risk</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {escalated.slice(0, 10).map((r) => (
                          <tr key={r.binId}>
                            <Td className="font-mono-data font-medium">
                              {r.binId}
                            </Td>
                            <Td className="text-muted-foreground">
                              {r.zone || "—"}
                            </Td>
                            <Td
                              className={pctTone(
                                r.predictions?.["24h"]?.predictedFillPct || 0,
                              )}
                            >
                              {r.predictions?.["24h"]?.predictedFillPct != null
                                ? `${r.predictions["24h"].predictedFillPct}%`
                                : "—"}
                            </Td>
                            <Td>
                              <Badge variant={riskVariant(r.riskScore)}>
                                {riskLabel(r.riskScore)} {r.riskScore}
                              </Badge>
                            </Td>
                          </tr>
                        ))}
                        {!escalated.length && (
                          <tr>
                            <Td className="text-muted-foreground">
                              No overflow-risk bins right now.
                            </Td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" /> Upcoming events &amp;
                  sanitation impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Event</Th>
                      <Th>Type</Th>
                      <Th>Attendance</Th>
                      <Th>Spike</Th>
                      <Th>Extra bins</Th>
                      <Th>Extra vehicles</Th>
                      <Th>Peak</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.map((ev) => (
                      <tr key={ev._id}>
                        <Td className="font-medium">{ev.name}</Td>
                        <Td className="text-muted-foreground">{ev.type}</Td>
                        <Td>{fmt(ev.expectedAttendance)}</Td>
                        <Td className="text-danger-600 dark:text-danger-400">
                          {ev.wasteMultiplier}×
                        </Td>
                        <Td>{ev.recommended?.extraBins || "—"}</Td>
                        <Td>{ev.recommended?.extraVehicles || "—"}</Td>
                        <Td className="text-muted-foreground">
                          {ev.recommended
                            ? `${ev.recommended.peakWasteStart}:00–${ev.recommended.peakWasteEnd}:00`
                            : "—"}
                        </Td>
                      </tr>
                    ))}
                    {!events.length && (
                      <tr>
                        <Td className="text-muted-foreground">
                          No upcoming events.
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ PREDICTIONS ============ */}
        {tab === "prediction" && (
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> Prediction engine{" "}
                  {engineUsed === "xgboost-live"
                    ? "— real XGBoost models"
                    : "— rule/seasonal"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Fill % across 6h/12h/24h/48h for every bin.
                </p>
                <Button
                  onClick={async () => {
                    setBusy("pred");
                    setErr(null);
                    try {
                      const r = await runPredictions({ weather: "clear" });
                      setPredTable(r.data?.results || []);
                      setEngineUsed(r.data?.engine || "rule");
                    } catch {
                      setErr("Prediction failed.");
                    }
                    setBusy("");
                  }}
                  disabled={busy === "pred"}
                >
                  {busy === "pred" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {busy === "pred" ? "Running…" : "Run prediction now"}
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Digital Twin Predictions panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> Digital Twin Predictions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[28rem] overflow-auto">
                    {predTable.length ? (
                      <table className="w-full">
                        <thead>
                          <tr>
                            <Th>Bin</Th>
                            <Th>Zone</Th>
                            <Th>6h</Th>
                            <Th>12h</Th>
                            <Th>24h</Th>
                            <Th>48h</Th>
                            <Th>Risk</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {predTable.map((r) => (
                            <tr key={r.binId}>
                              <Td className="font-mono-data font-medium">
                                {r.binId}
                              </Td>
                              <Td className="text-muted-foreground">
                                {r.zone || "—"}
                              </Td>
                              <Td
                                className={pctTone(
                                  r.predictions?.["6h"]?.predictedFillPct,
                                )}
                              >
                                {r.predictions?.["6h"]?.predictedFillPct}%
                              </Td>
                              <Td
                                className={pctTone(
                                  r.predictions?.["12h"]?.predictedFillPct,
                                )}
                              >
                                {r.predictions?.["12h"]?.predictedFillPct}%
                              </Td>
                              <Td
                                className={pctTone(
                                  r.predictions?.["24h"]?.predictedFillPct,
                                )}
                              >
                                {r.predictions?.["24h"]?.predictedFillPct}%
                              </Td>
                              <Td>
                                {r.predictions?.["48h"]?.predictedFillPct}%
                              </Td>
                              <Td>
                                <Badge variant={riskVariant(r.riskScore)}>
                                  {r.riskScore}
                                </Badge>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Click "Run prediction now" to populate.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Live Metrics panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Live Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Click a row to inspect full bin details below.
                  </p>
                  <div className="max-h-[28rem] overflow-auto">
                    {predTable.length ? (
                      <table className="w-full">
                        <thead>
                          <tr>
                            <Th>Bin</Th>
                            <Th>Now</Th>
                            <Th>Status</Th>
                            <Th>Capacity</Th>
                            <Th>Waste (kg)</Th>
                            <Th>Type</Th>
                            <Th>IoT</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {predTable.map((r) => {
                            const st = fillStatus(r.currentLevel);
                            const demo = getBinDemo(r.binId);
                            const active = selectedBin === r.binId;
                            return (
                              <tr
                                key={r.binId}
                                onClick={() => setSelectedBin(r.binId)}
                                className={cn(
                                  "cursor-pointer transition-colors hover:bg-muted",
                                  active && "bg-muted",
                                )}
                              >
                                <Td className="font-mono-data font-medium">
                                  {r.binId}
                                </Td>
                                <Td className={pctTone(r.currentLevel)}>
                                  {r.currentLevel}%
                                </Td>
                                <Td>
                                  <Badge variant={st.variant}>
                                    {st.label}
                                  </Badge>
                                </Td>
                                <Td>{demo.capacityL} L</Td>
                                <Td>{demo.estWasteKg} kg</Td>
                                <Td className="capitalize">
                                  {demo.wasteType}
                                </Td>
                                <Td>
                                  <Badge
                                    variant={
                                      demo.iotStatus === "online"
                                        ? "success"
                                        : demo.iotStatus === "offline"
                                          ? "danger"
                                          : "warning"
                                    }
                                  >
                                    {demo.iotStatus}
                                  </Badge>
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Click "Run prediction now" to populate.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {selectedBin && (
              <BinDetailPanel
                demo={getBinDemo(selectedBin)}
                onClose={() => setSelectedBin(null)}
              />
            )}
          </div>
        )}

        {/* ============ ROUTES ============ */}
        {tab === "routes" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Button onClick={handleGenerate} disabled={!!busy}>
                {busy === "generate" ? "Generating…" : "Generate CVRP routes"}
              </Button>
              <Button
                variant="outline"
                onClick={handleDeploy}
                disabled={!!busy}
              >
                {busy === "deploy"
                  ? "Deploying…"
                  : "Deploy routes  create tasks"}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <AnimatedStat
                label="Vehicles in plan"
                value={fleetSize}
                tone="brand"
                icon={Truck}
              />
              <AnimatedStat
                label="Total load (kg)"
                value={totalDemand}
                tone="brand"
                icon={Trash2}
              />
              <AnimatedStat
                label="Unassigned bins"
                value={unassigned.length}
                tone="danger"
                icon={AlertTriangle}
              />
            </div>
            {routes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    Route overlay (each color = one vehicle)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <NagaraiMap
                    bins={mapBins}
                    routes={routes}
                    center={{ lat: 19.076, lng: 72.8777 }}
                    zoom={13}
                    height="360px"
                  />
                </CardContent>
              </Card>
            )}
            {routes.map((r) => (
              <Card key={r.vehicle}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-4 w-4" /> {r.vehicle}{" "}
                    <Badge variant="success">
                      {r.utilizationPct ?? 0}% loaded
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {r.stops?.length} stops · {fmt(r.totalDemandKg)} kg ·{" "}
                    {fmt(r.totalDistanceM)} m · capacity{" "}
                    {fmt(r.vehicleCapacityKg)} kg
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.stops?.map((s) => (
                      <Badge
                        key={s.binId}
                        variant={riskVariant(s.priority || 0)}
                      >
                        {s.binId}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!routes.length && !busy && (
              <p className="text-sm text-muted-foreground">
                Generate routes to see the plan.
              </p>
            )}

            {tasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4" /> Collection tasks
                    <Badge variant="success">{tasks.length} created</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>Task ID</Th>
                        <Th>Status</Th>
                        <Th>Priority</Th>
                        <Th>Bins / Stops</Th>
                        <Th>Est. work</Th>
                        <Th>Actions</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tasks.map((t) => (
                        <tr key={t._id || t.taskId}>
                          <Td className="font-medium">{t.taskId}</Td>
                          <Td>
                            <Badge variant={statusVariant(t.status)}>
                              {t.status}
                            </Badge>
                          </Td>
                          <Td>
                            <Badge variant={riskVariant(t.priority || 0)}>
                              {t.priority ?? "—"}
                            </Badge>
                          </Td>
                          <Td>
                            {t.bin ? `1 bin (${t.bin.binId})` : "Multi-stop"}
                          </Td>
                          <Td>
                            {t.estimatedWorkMin != null
                              ? `${t.estimatedWorkMin} min`
                              : "—"}
                          </Td>
                          <Td>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => requestDelete(t._id || t.taskId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Modal
          id="confirm-delete-task"
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title="Delete collection task"
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              This task will be deleted. You can undo this action from the
              toast once confirmed.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDeleteTask}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        </Modal>

        {/* ============ BIN OPTIMIZER ============ */}
        {tab === "bins" && (
          <div className="space-y-4">
            <Button onClick={handleOptimizeBins} disabled={!!busy}>
              {busy === "bins"
                ? "Optimizing…"
                : "Run Bin Demand Score optimization"}
            </Button>
            <Card>
              <CardHeader>
                <CardTitle>Recommended actions</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Action</Th>
                      <Th>Zone</Th>
                      <Th>Demand</Th>
                      <Th>Capacity</Th>
                      <Th>Coverage</Th>
                      <Th>Reason</Th>
                      <Th>Priority</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recommendations.map((r, i) => (
                      <tr key={r._id || i}>
                        <Td>
                          <Badge
                            variant={
                              r.action === "add_bin"
                                ? "danger"
                                : r.action === "upgrade_capacity"
                                  ? "warning"
                                  : "success"
                            }
                          >
                            {r.action?.replace(/_/g, " ")}
                          </Badge>
                        </Td>
                        <Td>{r.zone?.name || r.zone?.code || "—"}</Td>
                        <Td>
                          {r.predictedDemandLDay != null
                            ? `${fmt(r.predictedDemandLDay)} L`
                            : "—"}
                        </Td>
                        <Td>
                          {r.recommendedCapacityL
                            ? `${r.recommendedCapacityL} L`
                            : "—"}
                        </Td>
                        <Td>{r.currentCoverage || "—"}</Td>
                        <Td className="text-xs text-muted-foreground">
                          {r.reason}
                        </Td>
                        <Td>{r.priority}</Td>
                      </tr>
                    ))}
                    {!recommendations.length && (
                      <tr>
                        <Td className="text-muted-foreground">
                          {optimized
                            ? "Optimization complete — no bin actions needed."
                            : "Run optimization to see recommended bin actions."}
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ INCIDENTS ============ */}
        {tab === "incidents" && (
          <Card>
            <CardHeader>
              <CardTitle>
                Sanitation incidents ({activeIncidents.length} active)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>Source</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Priority</Th>
                    <Th>Dup</Th>
                    <Th>Zone</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {incidents.map((i) => (
                    <tr key={i._id}>
                      <Td className="font-mono-data font-medium">
                        {i.incidentId}
                      </Td>
                      <Td>
                        {i.source === "cctv" ? (
                          <Badge variant="muted">
                            <Camera className="h-3 w-3" /> cctv
                          </Badge>
                        ) : (
                          i.source
                        )}
                      </Td>
                      <Td className="text-muted-foreground">
                        {i.type?.replace(/_/g, " ")}
                      </Td>
                      <Td>
                        <Badge variant={statusVariant(i.status)}>
                          {i.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge variant={riskVariant(i.priority)}>
                          {i.priority}
                        </Badge>
                      </Td>
                      <Td>{i.duplicateCount > 1 ? i.duplicateCount : "—"}</Td>
                      <Td className="text-muted-foreground">
                        {i.zone?.code || i.zone || "—"}
                      </Td>
                    </tr>
                  ))}
                  {!incidents.length && (
                    <tr>
                      <Td className="text-muted-foreground">
                        No incidents reported yet.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* ============ WORKFORCE ============ */}
        {tab === "workforce" && (
          <Card>
            <CardHeader>
              <CardTitle>Staffing needs by zone</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Zone</Th>
                    <Th>Name</Th>
                    <Th>Bins</Th>
                    <Th>Footfall</Th>
                    <Th>Event</Th>
                    <Th>Collectors</Th>
                    <Th>Vehicles</Th>
                    <Th>Sweepers</Th>
                    <Th>Total</Th>
                  </tr>
                </thead>
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
                  {!workforce.length && (
                    <tr>
                      <Td className="text-muted-foreground">No zone data.</Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* ============ SIMULATOR ============ */}
        {tab === "simulator" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4" /> What-If Simulator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Define scenario
                  </p>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
                    <SimField label="Event type">
                      <select
                        className={simInputCls}
                        value={simForm.eventType}
                        onChange={(e) =>
                          setSimForm({ ...simForm, eventType: e.target.value })
                        }
                      >
                        <option value="">No event</option>
                        <option value="festival">Festival</option>
                        <option value="concert">Concert</option>
                        <option value="sports">Sports</option>
                        <option value="fair">Fair</option>
                        <option value="market">Market</option>
                      </select>
                    </SimField>
                    <SimField label="Expected attendance">
                      <input
                        className={simInputCls}
                        type="number"
                        min="0"
                        placeholder="e.g. 30000"
                        value={simForm.expectedAttendance}
                        onChange={(e) =>
                          setSimForm({
                            ...simForm,
                            expectedAttendance: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </SimField>
                    <SimField label="Weather">
                      <select
                        className={simInputCls}
                        value={simForm.weather}
                        onChange={(e) =>
                          setSimForm({ ...simForm, weather: e.target.value })
                        }
                      >
                        <option value="clear">Clear</option>
                        <option value="rain">Rain</option>
                        <option value="heavy_rain">Heavy rain</option>
                      </select>
                    </SimField>
                    <SimField label="Hours simulated">
                      <input
                        className={simInputCls}
                        type="number"
                        min="1"
                        max="168"
                        placeholder="24"
                        value={simForm.hours}
                        onChange={(e) =>
                          setSimForm({
                            ...simForm,
                            hours: parseInt(e.target.value) || 24,
                          })
                        }
                      />
                    </SimField>
                    <SimField label="Collection every (hrs)">
                      <input
                        className={simInputCls}
                        type="number"
                        min="0"
                        max="24"
                        placeholder="0 = never"
                        value={simForm.collectionFrequencyHrs}
                        onChange={(e) =>
                          setSimForm({
                            ...simForm,
                            collectionFrequencyHrs: parseInt(e.target.value) ||
                              0,
                          })
                        }
                      />
                    </SimField>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={runSimulation} disabled={busy === "sim"}>
                    {busy === "sim" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Simulating…
                      </>
                    ) : (
                      "Run Simulation"
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Tip: set attendance + a festival event to stress-test city
                    capacity.
                  </span>
                </div>
              </CardContent>
            </Card>

            {simResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    <FlaskConical className="h-3 w-3" />{" "}
                    {SIM_EVENT_LABEL[simForm.eventType] || "No event"}
                  </Badge>
                  {simForm.expectedAttendance > 0 && (
                    <Badge variant="warning">
                      {fmt(simForm.expectedAttendance)} attendees
                    </Badge>
                  )}
                  <Badge variant="muted">
                    {SIM_WEATHER_LABEL[simForm.weather]}
                  </Badge>
                  <Badge variant="muted">{simForm.hours}h window</Badge>
                  <Badge variant="muted">
                    Event load ×{simResult.eventWasteMultiplier}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <AnimatedStat
                    icon={Trash2}
                    label="Bins simulated"
                    value={simResult.summary.binsSimulated}
                    tone="brand"
                  />
                  <AnimatedStat
                    icon={AlertTriangle}
                    label="Overflows"
                    value={simResult.summary.overflows}
                    tone="danger"
                  />
                  <AnimatedStat
                    icon={Activity}
                    label="Peak waste (kg)"
                    value={simResult.summary.peakInventoryKg}
                    tone="signal"
                  />
                  <AnimatedStat
                    icon={CalendarClock}
                    label="First overflow (hr)"
                    value={simResult.summary.firstOverflowHour ?? 0}
                    tone="brand"
                  />
                </div>

                {simResult.trajectories.length > 0 && (
                  <Card>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle>Bin fill trajectory</CardTitle>
                      <select
                        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                        value={selectedSimBinId || ""}
                        onChange={(e) => setSelectedSimBinId(e.target.value)}
                      >
                        {simResult.trajectories.map((t) => (
                          <option key={t.binId} value={t.binId}>
                            {t.binId} — {t.zone}
                          </option>
                        ))}
                      </select>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="muted">
                          Zone {simSelected?.zone}
                        </Badge>
                        <Badge variant="muted">
                          {simSelected?.capacityL} L capacity
                        </Badge>
                        <Badge variant="muted">
                          Start {simSelected?.startLevel}%
                        </Badge>
                        {simSelected?.overflowedAt != null ? (
                          <Badge variant="danger">
                            Overflows at hour {simSelected.overflowedAt}
                          </Badge>
                        ) : (
                          <Badge variant="success">No overflow</Badge>
                        )}
                        {simSelected?.collectedDuringRun && (
                          <Badge variant="warning">Collected mid-run</Badge>
                        )}
                      </div>
                      {simCurve.length > 0 && (
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={simCurve}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="var(--border)"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="hour"
                              tick={{
                                fontSize: 11,
                                fill: "var(--muted-foreground)",
                              }}
                              axisLine={false}
                              tickLine={false}
                              unit="h"
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{
                                fontSize: 11,
                                fill: "var(--muted-foreground)",
                              }}
                              axisLine={false}
                              tickLine={false}
                              unit="%"
                            />
                            <Tooltip
                              contentStyle={{
                                background: "var(--card)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="fillPct"
                              stroke="#0d9488"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                )}

                {simResult.overflowEvents.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-danger-600 dark:text-danger-400">
                        Overflow events detected
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {simResult.overflowEvents.map((o, i) => (
                          <Badge key={i} variant="danger">
                            {o.binId} @ hr {o.hour} (+{o.overKg} kg)
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Staffing needed for scenario</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Deployable crew + fleet to keep up with projected waste
                      load.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {simResult.staffing.map((s, i) => (
                        <div
                          key={s.zone || i}
                          className="rounded-xl border border-border p-4"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <div>
                              <p className="font-medium text-foreground">
                                {s.zone}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {s.name}
                              </p>
                            </div>
                            <Badge variant="muted">{s.bins} bins</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-muted/40 p-2">
                              <p className="font-mono-data text-lg font-semibold text-foreground">
                                {s.staffing.collectors}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Collectors
                              </p>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2">
                              <p className="font-mono-data text-lg font-semibold text-foreground">
                                {s.staffing.vehicles}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Vehicles
                              </p>
                            </div>
                            <div className="rounded-lg bg-success-500/10 p-2">
                              <p className="font-mono-data text-lg font-semibold text-success-600 dark:text-success-400">
                                {s.staffing.totalStaff}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Total crew
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-muted-foreground">
                            {s.staffing.sweepers} sweepers ·{" "}
                            {s.staffing.supervisors} supervisors · event ×
                            {s.eventMultiplier}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        )}

        {/* ============ SWEEPING ============ */}
        {tab === "sweeping" && (
          <div className="space-y-4">
            <Button onClick={handleAnalyzeSweeping} disabled={!!busy}>
              {busy === "sweep"
                ? "Analyzing…"
                : "Run Predictive Sweeping analysis"}
            </Button>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wind className="h-4 w-4" /> Road Dirt Accumulation Score by
                  zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Zone</Th>
                      <Th>Road type</Th>
                      <Th>Dirt score</Th>
                      <Th>Frequency</Th>
                      <Th>Peak window</Th>
                      <Th>Why</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sweepNeeds.map((n) => (
                      <tr key={n._id}>
                        <Td className="font-medium">
                          {n.zone?.name || n.zone?.code || "—"}
                        </Td>
                        <Td className="text-muted-foreground">
                          {n.roadType?.replace(/_/g, " ")}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <DirtBar score={n.dirtScore} />
                            <span className="font-mono-data text-xs">
                              {n.dirtScore}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <Badge
                            variant={
                              n.dirtScore >= 60
                                ? "danger"
                                : n.dirtScore >= 35
                                  ? "warning"
                                  : "success"
                            }
                          >
                            {n.frequencyLabel}
                          </Badge>
                        </Td>
                        <Td className="text-muted-foreground">
                          {n.peakStartHour}:00–{n.peakEndHour}:00
                        </Td>
                        <Td className="text-xs text-muted-foreground">
                          {n.contributors?.join(", ")}
                        </Td>
                      </tr>
                    ))}
                    {!sweepNeeds.length && (
                      <tr>
                        <Td className="text-muted-foreground">
                          Run the analysis to see per-zone sweeping
                          recommendations.
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============ CCTV ============ */}
        {tab === "cctv" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-4 w-4" /> Simulate a CCTV frame
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Upload a frame from a fixed camera location. Detection is a
                  heuristic stand-in for a trained model (see backend notes) —
                  it flags visual clutter and auto-creates an incident,
                  demonstrating the full closed-loop flow.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setCctvForm((f) => ({
                      ...f,
                      file,
                      preview: file ? URL.createObjectURL(file) : null,
                    }));
                  }}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
                />
                {cctvForm.preview && (
                  <img
                    src={cctvForm.preview}
                    alt="preview"
                    className="max-h-48 rounded-lg border border-border object-cover"
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    placeholder="Camera latitude"
                    value={cctvForm.lat}
                    onChange={(e) =>
                      setCctvForm((f) => ({ ...f, lat: e.target.value }))
                    }
                  />
                  <input
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    placeholder="Camera longitude"
                    value={cctvForm.lng}
                    onChange={(e) =>
                      setCctvForm((f) => ({ ...f, lng: e.target.value }))
                    }
                  />
                </div>
                <Button onClick={handleCctvDetect} disabled={busy === "cctv"}>
                  {busy === "cctv" ? "Analyzing…" : "Analyze frame"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detection result</CardTitle>
              </CardHeader>
              <CardContent>
                {!cctvResult && (
                  <p className="text-sm text-muted-foreground">
                    Analyze a frame to see the AI detection output.
                  </p>
                )}
                {cctvResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          cctvResult.detection.garbageDetected
                            ? "danger"
                            : "success"
                        }
                      >
                        {cctvResult.detection.garbageDetected
                          ? "Garbage detected"
                          : "Clear"}
                      </Badge>
                      <Badge variant="muted">
                        {Math.round(cctvResult.detection.confidence * 100)}%
                        confidence
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <dt className="text-muted-foreground">Severity</dt>
                      <dd>{cctvResult.detection.severity}</dd>
                      <dt className="text-muted-foreground">Estimated area</dt>
                      <dd>{cctvResult.detection.estimatedAreaM2} m²</dd>
                      <dt className="text-muted-foreground">Method</dt>
                      <dd className="text-xs">{cctvResult.detection.method}</dd>
                    </dl>
                    {cctvResult.incident && (
                      <div className="rounded-lg bg-muted p-3 text-sm">
                        Incident{" "}
                        <span className="font-mono-data font-medium">
                          {cctvResult.incident.incidentId}
                        </span>{" "}
                        created, priority {cctvResult.incident.priority}
                        {cctvResult.task && (
                          <>
                            {" "}
                            — task{" "}
                            <span className="font-mono-data">
                              {cctvResult.task.taskId}
                            </span>{" "}
                            dispatched.
                          </>
                        )}
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
