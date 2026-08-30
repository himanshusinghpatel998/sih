/**
 * Imports the real trained-model bin universe (ml/bins_master.csv +
 * ml/bin_cluster_mapping.csv) into MongoDB, so live Bin/Zone documents use
 * the exact same bin_id the XGBoost models were trained on. This is what
 * makes /api/predictions "real" instead of talking about bins the model has
 * never seen.
 *
 * Run:  node scripts/importRealBins.js
 * Safe to re-run — upserts by binId/zone code.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('../config/miniMongoose');
const connectDB = require('../config/db');
const { Zone, Bin } = require('../models');

const ML_DIR = path.join(__dirname, '..', '..', '..', 'ml');
const BINS_MASTER = path.join(ML_DIR, 'bins_master.csv');
const CLUSTER_MAPPING = path.join(ML_DIR, 'bin_cluster_mapping.csv');

const parseCsv = (text) => {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
};

const run = async () => {
  await connectDB();

  const binsMaster = parseCsv(fs.readFileSync(BINS_MASTER, 'utf8'));
  const clusterMap = parseCsv(fs.readFileSync(CLUSTER_MAPPING, 'utf8'));
  const clusterByBin = {};
  for (const row of clusterMap) {
    clusterByBin[row.bin_id] = { clusterId: row.bin_cluster_id, clusterLabel: row.cluster_label };
  }

  // --- Zones -------------------------------------------------------------
  const zonesByCode = {};
  const uniqueZones = new Map();
  for (const row of binsMaster) {
    if (!uniqueZones.has(row.zone_id)) {
      uniqueZones.set(row.zone_id, {
        code: row.zone_id,
        name: row.zone_name,
        populationDensity: Number(row.population_density_per_sqkm) || 0,
      });
    }
  }
  for (const z of uniqueZones.values()) {
    const doc = await Zone.findOneAndUpdate(
      { code: z.code },
      {
        code: z.code,
        name: z.name,
        populationDensity: z.populationDensity,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    zonesByCode[z.code] = doc;
  }
  console.log(` Upserted ${uniqueZones.size} zones`);

  // --- Bins ----------------------------------------------------------------
  let count = 0;
  for (const row of binsMaster) {
    const zone = zonesByCode[row.zone_id];
    const cluster = clusterByBin[row.bin_id] || {};
    await Bin.findOneAndUpdate(
      { binId: row.bin_id },
      {
        binId: row.bin_id,
        zone: zone ? zone._id : null,
        location: { lat: Number(row.latitude), lng: Number(row.longitude) },
        address: `${row.zone_name} (${row.zone_type})`,
        capacityL: Number(row.bin_capacity_liters) || 240,
        hasSensor: row.has_iot_sensor === 'True' || row.has_iot_sensor === 'true',
        currentLevel: 0,
        status: 'green',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  console.log(` Upserted ${count} real bins (matching the trained model's bin universe)`);

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch((err) => {
  console.error(' importRealBins failed:', err);
  process.exit(1);
});
