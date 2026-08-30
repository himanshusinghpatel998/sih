const fs = require('fs');
const path = require('path');

const ML_DIR = path.join(__dirname, '..', '..', 'data', 'ml');

const ensureDir = () => {
  if (!fs.existsSync(ML_DIR)) fs.mkdirSync(ML_DIR, { recursive: true });
};

const toCsv = (rows) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const header = cols.join(',');
  const lines = rows.map((r) => cols.map((c) => (r[c] == null ? '' : r[c])).join(','));
  return [header, ...lines].join('\n');
};

const exportDataset = (rows, { name = 'dataset' } = {}) => {
  ensureDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(ML_DIR, `${name}-${ts}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(rows, null, 2));
  fs.writeFileSync(`${base}.csv`, toCsv(rows));
  return { json: `${base}.json`, csv: `${base}.csv`, count: rows.length };
};

const saveModel = (model, { name = 'model', engine = 'baseline' } = {}) => {
  ensureDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ML_DIR, `${name}-${engine}-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(model, null, 2));
  return file;
};

module.exports = { exportDataset, saveModel, ML_DIR, toCsv };
