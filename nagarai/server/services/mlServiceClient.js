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

module.exports = { isHealthy, predictBin, predictBatch, ML_SERVICE_URL };
