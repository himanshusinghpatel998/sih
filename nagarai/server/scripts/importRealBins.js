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
const { Zone, Bin, Landmark } = require('../models');
const mlServiceClient = require('../services/mlServiceClient');

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

// bins_master.csv's zone_type per bin — used to estimate footfall/commercial/
// residential density per zone, since the CSV has no direct footfall column.
// Values are illustrative but zone-differentiated (unlike the flat 0 every
// zone got before), so bin-optimizer/workforce/sweeping actually vary by area.
const ZONE_TYPE_PROFILE = {
  market: { footfallBase: 25000, commercial: 0.9, residential: 0.2 },
  commercial: { footfallBase: 20000, commercial: 0.85, residential: 0.15 },
  tourist: { footfallBase: 22000, commercial: 0.6, residential: 0.2 },
  mixed_use: { footfallBase: 15000, commercial: 0.5, residential: 0.5 },
  institutional: { footfallBase: 12000, commercial: 0.3, residential: 0.3 },
  residential_high: { footfallBase: 8000, commercial: 0.2, residential: 0.9 },
  residential_low: { footfallBase: 4000, commercial: 0.1, residential: 0.7 },
  industrial: { footfallBase: 3000, commercial: 0.4, residential: 0.1 },
};

// Rough bounding-box area in m² from a set of lat/lng points (good enough
// for the workforce sizing this feeds — not a real cadastral area).
const boundingAreaM2 = (points) => {
  if (!points.length) return 0;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const latSpanM = (Math.max(...lats) - Math.min(...lats)) * 111000;
  const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const lngSpanM = (Math.max(...lngs) - Math.min(...lngs)) * 111000 * Math.cos((avgLat * Math.PI) / 180);
  return Math.max(10000, Math.round(latSpanM * lngSpanM)); // floor so tiny zones aren't 0
};

const mode = (arr) => {
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
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
  // Aggregate bins_master.csv per zone: dominant zone_type (drives footfall/
  // commercial/residential density via ZONE_TYPE_PROFILE), average nearby
  // restaurant/market counts (drives Landmark seeding below), and a
  // bin-cluster centroid + bounding area (workforce sizing needs areaM2).
  const zonesByCode = {};
  const rowsByZone = new Map();
  for (const row of binsMaster) {
    if (!rowsByZone.has(row.zone_id)) rowsByZone.set(row.zone_id, []);
    rowsByZone.get(row.zone_id).push(row);
  }

  for (const [zoneId, rows] of rowsByZone) {
    const first = rows[0];
    const zoneType = mode(rows.map((r) => r.zone_type));
    const profile = ZONE_TYPE_PROFILE[zoneType] || ZONE_TYPE_PROFILE.mixed_use;
    const avgRestaurants = rows.reduce((s, r) => s + (Number(r.nearby_restaurants_count) || 0), 0) / rows.length;
    const avgMarkets = rows.reduce((s, r) => s + (Number(r.nearby_markets_count) || 0), 0) / rows.length;
    const points = rows.map((r) => ({ lat: Number(r.latitude), lng: Number(r.longitude) }));
    const center = {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
    };
    const populationDensity = Number(first.population_density_per_sqkm) || 0;
    // Footfall scales with the zone's real restaurant/market density on top
    // of its type baseline — a market zone with unusually many nearby food
    // spots reads busier than a market zone with few, instead of every zone
    // of the same type getting an identical number.
    const footfall = Math.round(profile.footfallBase * (1 + avgRestaurants / 20 + avgMarkets / 10));

    const doc = await Zone.findOneAndUpdate(
      { code: zoneId },
      {
        code: zoneId,
        name: first.zone_name,
        populationDensity,
        footfall,
        commercialDensity: profile.commercial,
        residentialDensity: profile.residential,
        center,
        areaM2: boundingAreaM2(points),
        zoneType,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    zonesByCode[zoneId] = { doc, zoneType, avgRestaurants, avgMarkets, points };
  }
  console.log(`✅ Upserted ${rowsByZone.size} zones (with real footfall/density/center derived from bins_master.csv)`);

  // --- Landmarks -----------------------------------------------------------
  // bins_master.csv never had Landmark rows of its own — restaurant/market
  // proximity was only ever a per-bin count column, so nothing downstream
  // that counts actual Landmark docs (sweeping's road-type inference,
  // bin-optimizer's nearbyFood signal) had anything to find. Materialize a
  // representative set per zone from those counts, placed at real bin
  // coordinates so they're geographically sane.
  await Landmark.deleteMany({});
  let landmarkCount = 0;
  for (const [zoneId, z] of Object.entries(zonesByCode)) {
    const marketN = Math.round(z.avgMarkets);
    const restaurantN = Math.round(z.avgRestaurants);
    for (let i = 0; i < marketN; i++) {
      const p = z.points[i % z.points.length];
      await Landmark.create({
        name: `${z.doc.name} Market ${i + 1}`,
        type: 'market',
        zone: z.doc._id,
        location: { lat: p.lat + (Math.random() - 0.5) * 0.001, lng: p.lng + (Math.random() - 0.5) * 0.001 },
        wasteWeight: 0.8,
        estimatedDailyVisitors: 800,
      });
      landmarkCount += 1;
    }
    for (let i = 0; i < restaurantN; i++) {
      const p = z.points[i % z.points.length];
      await Landmark.create({
        name: `${z.doc.name} Restaurant ${i + 1}`,
        type: 'restaurant',
        zone: z.doc._id,
        location: { lat: p.lat + (Math.random() - 0.5) * 0.001, lng: p.lng + (Math.random() - 0.5) * 0.001 },
        wasteWeight: 0.6,
        estimatedDailyVisitors: 300,
      });
      landmarkCount += 1;
    }
  }
  console.log(`✅ Seeded ${landmarkCount} landmarks (markets + restaurants) from real per-bin proximity counts`);

  // Flatten zonesByCode back to plain Zone docs for the bin-upsert loop below.
  for (const zoneId of Object.keys(zonesByCode)) zonesByCode[zoneId] = zonesByCode[zoneId].doc;

  // --- Starting fill level ---------------------------------------------
  // The trained model has a real per-bin history (fill_percentage_end_of_day
  // from its training data) and returns it as `currentFillPct` when called
  // with no override — a far more realistic starting point than a flat 0%
  // for every bin, which is what every bin used to get here. Falls back to
  // a plausible random spread if ml-service isn't running during import.
  let currentFillByBin = {};
  const mlUp = await mlServiceClient.isHealthy().catch(() => false);
  if (mlUp) {
    try {
      const predictions = await mlServiceClient.predictBatch({});
      for (const p of predictions) {
        if (!p.error && p.currentFillPct != null) currentFillByBin[p.binId] = p.currentFillPct;
      }
      console.log(`✅ Seeded starting fill levels from the trained model for ${Object.keys(currentFillByBin).length} bins`);
    } catch (err) {
      console.warn('⚠️ Could not fetch starting fill levels from ml-service, using random fallback:', err.message);
    }
  } else {
    console.warn('⚠️ ml-service not running — using a random fallback for starting fill levels (rerun this script with ml-service up for realistic values)');
  }
  const fallbackFill = () => Math.round(10 + Math.random() * 45); // 10-55%, plausible mid-cycle spread

  // --- Bins ----------------------------------------------------------------
  let count = 0;
  for (const row of binsMaster) {
    const zone = zonesByCode[row.zone_id];
    const cluster = clusterByBin[row.bin_id] || {};
    const startFill = currentFillByBin[row.bin_id] != null ? currentFillByBin[row.bin_id] : fallbackFill();
    await Bin.findOneAndUpdate(
      { binId: row.bin_id },
      {
        binId: row.bin_id,
        zone: zone ? zone._id : null,
        location: { lat: Number(row.latitude), lng: Number(row.longitude) },
        address: `${row.zone_name} (${row.zone_type})`,
        capacityL: Number(row.bin_capacity_liters) || 240,
        hasSensor: row.has_iot_sensor === 'True' || row.has_iot_sensor === 'true',
        currentLevel: startFill,
        status: startFill >= 70 ? 'red' : startFill >= 40 ? 'yellow' : 'green',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  console.log(`✅ Upserted ${count} real bins (matching the trained model's bin universe)`);

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch((err) => {
  console.error('❌ importRealBins failed:', err);
  process.exit(1);
});
