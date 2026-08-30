/**
 * HTTP client for the Python ml-service (real trained XGBoost models).
 * Every call is wrapped so a dead/unreachable service degrades gracefully —
 * callers should catch and fall back to the rule-based predictionEngine.
 */
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS) || 25000;

const client = axios.create({ baseURL: ML_SERVICE_URL, timeout: TIMEOUT_MS });

let lastHealthOk = null;
let lastHealthCheckAt = 0;
const HEALTH_CACHE_MS = 10000;

const isHealthy = async () => {
  const now = Date.now();
  if (lastHealthOk !== null && now - lastHealthCheckAt < HEALTH_CACHE_MS) return lastHealthOk;
  try {
    await client.get('/health');
    lastHealthOk = true;
  } catch (err) {
    lastHealthOk = false;
  }
  lastHealthCheckAt = now;
  return lastHealthOk;
};

const predictBin = async (binId, currentFillOverride) => {
  const params = currentFillOverride != null ? { current_fill: currentFillOverride } : {};
  const { data } = await client.get(`/predict/bin/${encodeURIComponent(binId)}`, { params });
  return data;
};

const predictBatch = async (overrides = {}) => {
  const { data } = await client.post('/predict/batch', { overrides });
  return data.predictions;
};

// CCTV frame → YOLOv8n object-density detection (Phase F).
const detectFrame = async (buffer, filename = 'frame.jpg') => {
  const FormData = require('form-data');
  const fd = new FormData();
  fd.append('file', buffer, { filename, contentType: 'image/jpeg' });
  const { data } = await client.post('/detect/frame', fd, {
    headers: fd.getHeaders(),
    timeout: TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return data;
};

// ─── Routing (wraps ml/routing/* via ml-service) ──────────────────────────

const getDemandScores = async (bins) => {
  const { data } = await client.post('/routes/demand-scores', { bins });
  return data.scores;
};

const optimizeRoutes = async (bins, fleet) => {
  const { data } = await client.post('/routes/optimize', { bins, fleet });
  return data;
};

const getBinRecommendations = async (bins) => {
  const { data } = await client.post('/routes/recommendations', { bins });
  return data;
};

const assignWorkers = async (routesResult, workers) => {
  const { data } = await client.post('/routes/assign-workers', { routes: routesResult, workers });
  return data;
};

const rerouteInsertBin = async (routesResult, bins, binId, scores, currentLocation) => {
  const { data } = await client.post('/routes/reroute/insert-bin', {
    routes: routesResult, bins, binId, scores, currentLocation,
  });
  return data;
};

const rerouteBreakdown = async (routesResult, bins, vehicleId) => {
  const { data } = await client.post('/routes/reroute/breakdown', { routes: routesResult, bins, vehicleId });
  return data;
};

const rerouteTraffic = async (routesResult, bins, vehicleId, delayMinutes, affectedStops) => {
  const { data } = await client.post('/routes/reroute/traffic', {
    routes: routesResult, bins, vehicleId, delayMinutes, affectedStops,
  });
  return data;
};

module.exports = {
  isHealthy,
  predictBin,
  predictBatch,
  detectFrame,
  getDemandScores,
  optimizeRoutes,
  getBinRecommendations,
  assignWorkers,
  rerouteInsertBin,
  rerouteBreakdown,
  rerouteTraffic,
  ML_SERVICE_URL,
};
