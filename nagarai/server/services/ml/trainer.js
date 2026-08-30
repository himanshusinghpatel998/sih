/**
 * NagarAI ML Trainer scaffolding (Phase 4b)
 *
 * Consumes the synthetic dataset produced by dataGenerator.js and produces a
 * serialized model that the prediction engine's `strategy: 'ml'` hook can use.
 *
 * Backends:
 *   - baseline : native JS fallback (no ML deps). Fits per-zone/per-hour mean
 *                generation and a simple overflow threshold — enough to produce
 *                predictions and feature importances for the demo.
 *   - xgboost  / lightgbm : optional real ML backends. Enabled by setting
 *                ML_ENGINE=xgboost (or lightgbm) and having the package installed.
 *
 * The exported feature set matches the prediction engine's feature vector.
 */

const FEATURES = [
  'hour', 'day_of_week', 'month', 'season', 'weekend', 'event_type',
  'expected_crowd', 'rainfall', 'temperature', 'population_density',
  'footfall', 'nearby_restaurants', 'nearby_markets',
  'previous_waste_kg', 'previous_fill_rate', 'days_since_last_collection',
  'bin_capacity', 'latitude', 'longitude',
];

/**
 * Normalize/one-hot a dataset row into the numeric feature vector used by ML.
 * Returns { features: number[], labels: { wasteKg, fillPct } }.
 */
const featurizeRow = (row) => {
  const seasonMap = { winter: 0, spring: 1, summer: 2, monsoon: 3, autumn: 4 };
  const features = [
    row.hour || 0,
    row.day_of_week || 0,
    row.month || 0,
    seasonMap[row.season] != null ? seasonMap[row.season] : 2,
    row.weekend ? 1 : 0,
    eventTypeToInt[row.event_type] != null ? eventTypeToInt[row.event_type] : 0,
    row.expected_crowd || 0,
    row.rainfall ? 1 : 0,
    row.temperature || 30,
    row.population_density || 0,
    row.footfall || 0,
    row.nearby_restaurants || 0,
    row.nearby_markets || 0,
    row.previous_waste_kg || 0,
    row.previous_fill_rate || 0,
    row.days_since_last_collection || 0,
    row.bin_capacity || 240,
    row.latitude || 0,
    row.longitude || 0,
  ];
  return {
    features,
    label: {
      wasteKg: row.waste_collected_kg || 0,
      fillPct: row.fill_percentage || 0,
    },
  };
};

const eventTypeToInt = {
  festival: 1, concert: 2, sports: 3, fair: 4, wedding: 5,
  religious: 6, political: 7, university: 8, market: 9, holiday: 10, other: 11,
};

// Feature importance approximation for baseline: normalized std-dev weighting
const computeBaselineImportance = (rows) => {
  const sums = FEATURES.map(() => 0);
  const sumsq = FEATURES.map(() => 0);
  const n = rows.length || 1;
  for (const row of rows) {
    const { features } = featurizeRow(row);
    features.forEach((v, i) => {
      sums[i] += v;
      sumsq[i] += v * v;
    });
  }
  const importance = {};
  FEATURES.forEach((f, i) => {
    const mean = sums[i] / n;
    const variance = Math.max(0, sumsq[i] / n - mean * mean);
    importance[f] = Math.sqrt(variance);
  });
  return importance;
};

/**
 * Baseline trainer: fits per-(zone,hour) mean waste and a fill threshold.
 * Returns a serializable model object compatible with the 'ml' prediction hook.
 */
const trainBaseline = async (rows) => {
  const zoneHour = {};
  let globalMean = 0;
  let globalCount = 0;
  for (const row of rows) {
    const key = `${row.zone_id}:${row.hour}`;
    if (!zoneHour[key]) zoneHour[key] = { sum: 0, n: 0 };
    zoneHour[key].sum += row.waste_collected_kg || 0;
    zoneHour[key].n += 1;
    globalMean += row.waste_collected_kg || 0;
    globalCount += 1;
  }
  globalMean = globalCount ? globalMean / globalCount : 24;

  for (const k of Object.keys(zoneHour)) {
    zoneHour[k].mean = zoneHour[k].sum / Math.max(1, zoneHour[k].n);
  }

  // Compute mean fill rate per zone for overflow thresholding
  const zoneFill = {};
  for (const row of rows) {
    const z = row.zone_id;
    if (!zoneFill[z]) zoneFill[z] = { sum: 0, n: 0 };
    zoneFill[z].sum += row.fill_percentage || 0;
    zoneFill[z].n += 1;
  }

  return {
    backend: 'baseline',
    trainedAt: new Date().toISOString(),
    numRows: rows.length,
    zoneHour,
    zoneFill,
    globalMean,
    importance: computeBaselineImportance(rows),
    // Real ML backends attach model bytes here
    model: null,
  };
};

/**
 * Backend-aware trainer entry point.
 * @param {object[]} rows - feature rows (from dataGenerator)
 * @param {object} opts  - { engine: 'baseline' | 'xgboost' | 'lightgbm', outputFile }
 */
const train = async (rows, opts = {}) => {
  const engine = opts.engine || process.env.ML_ENGINE || 'baseline';

  if (engine === 'baseline') {
    return trainBaseline(rows);
  }

  if (engine === 'xgboost' || engine === 'lightgbm') {
    // Real ML backend. The package must be installed & enabled explicitly.
    try {
      const libName = engine === 'xgboost' ? 'xgboost' : 'lightgbm';
      const lib = require(libName);
      const vectors = rows.map((r) => featurizeRow(r));
      return await lib.train(vectors, { engine, outputFile: opts.outputFile, features: FEATURES });
    } catch (err) {
      throw new Error(
        `ML_ENGINE=${engine} requires the '${engine === 'xgboost' ? 'xgboost' : 'lightgbm'}' package installed. ` +
        `Falling back or installing the package is recommended. Got: ${err.message}`
      );
    }
  }

  throw new Error(`Unknown ML_ENGINE: ${engine}`);
};

module.exports = { train, trainBaseline, featurizeRow, FEATURES, computeBaselineImportance };
