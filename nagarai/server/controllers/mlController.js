const fs = require('fs');
const path = require('path');
const { generateDataset, hourlyKg } = require('../services/ml/dataGenerator');
const { train, featurizeRow } = require('../services/ml/trainer');
const { exportDataset, saveModel, ML_DIR } = require('../services/ml/exportDataset');

// Load the most recent baseline (or any engine) model file
const loadSnapshot = async (ofTypes = []) => {
  const files = fs.existsSync(ML_DIR) ? fs.readdirSync(ML_DIR) : [];
  const modelFiles = files.filter((f) => f.startsWith('model-') && f.endsWith('.json'));
  const sorted = modelFiles.sort();
  // pick latest matching engine
  for (const f of [...sorted].reverse()) {
    if (!ofTypes.length || ofTypes.some((t) => f.includes(`-${t}-`))) {
      return JSON.parse(fs.readFileSync(path.join(ML_DIR, f), 'utf8'));
    }
  }
  return null;
};

// @desc  Generate + export the synthetic training dataset (from DB seed)
// @route POST /api/ml/generate
const generate = async (req, res) => {
  try {
    const [Zone, Bin, Event] = [require('../models').Zone, require('../models').Bin, require('../models').Event];
    const zones = await Zone.find().lean();
    const bins = await Bin.find().lean();
    const events = await Event.find({ status: { $in: ['upcoming', 'active'] } }).lean();
    const eventsByZone = {};
    for (const ev of events) {
      const z = zones.find((z2) => String(z2._id) === String(ev.zone));
      if (z) (eventsByZone[z.code] = eventsByZone[z.code] || []).push(ev);
    }
    const days = parseInt(req.body.days) || 30;
    const rows = await generateDataset({ zones, bins, eventsByZone, days });
    const exported = exportDataset(rows, { name: 'nagarai' });
    res.json({ count: rows.length, ...exported });
  } catch (err) {
    console.error(' [ML] generate error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Train a model from the dataset (baseline now; xgboost/lightgbm via ML_ENGINE)
// @route POST /api/ml/train
const trainEndpoint = async (req, res) => {
  try {
    const rowsFile = req.body.datasetFile;
    let rows;
    if (rowsFile && fs.existsSync(rowsFile)) {
      rows = JSON.parse(fs.readFileSync(rowsFile, 'utf8'));
    } else {
      // otherwise use the latest exported dataset
      const files = fs.existsSync(ML_DIR) ? fs.readdirSync(ML_DIR) : [];
      const latest = files.filter((f) => f.startsWith('nagarai-') && f.endsWith('.json')).sort().pop();
      if (!latest) return res.status(400).json({ message: 'No dataset found. Run generation first.' });
      rows = JSON.parse(fs.readFileSync(path.join(ML_DIR, latest), 'utf8'));
    }
    const engine = req.body.engine || process.env.ML_ENGINE || 'baseline';
    const model = await train(rows, { engine });
    const file = saveModel(model, { engine });
    res.json({ backend: model.backend, rows: model.numRows, modelFile: file });
  } catch (err) {
    console.error(' [ML] train error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Status: available backends + feature schema
// @route GET /api/ml/status
const status = async (req, res) => {
  const files = fs.existsSync(ML_DIR) ? fs.readdirSync(ML_DIR) : [];
  let modelFile = null;
  try { modelFile = await loadSnapshot(); } catch (e) {}
  res.json({
    engine: process.env.ML_ENGINE || 'baseline',
    backendsSupported: ['baseline', 'xgboost', 'lightgbm'],
    featureSchema: require('../services/ml/trainer').FEATURES,
    latestModel: modelFile ? { backend: modelFile.backend, trainedAt: modelFile.trainedAt, numRows: modelFile.numRows } : null,
    files: files,
  });
};

module.exports = { generate, trainEndpoint, status, loadSnapshot };
