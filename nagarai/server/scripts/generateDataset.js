#!/usr/bin/env node
/**
 * CLI: generate the synthetic training dataset (+ optionally train a baseline).
 *
 *   node scripts/generateDataset.js [--days=30] [--train] [--engine=baseline]
 *
 * Works WITHOUT a database (uses a built-in mock city layout), so it can run
 * before MONGO_URI is configured. To enrich from the real seed data instead,
 * set MONGO_URI and pass --from-db.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { generateDataset } = require('../services/ml/dataGenerator');
const { train } = require('../services/ml/trainer');
const { exportDataset, saveModel } = require('../services/ml/exportDataset');

const parseArgs = () => {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    args[k] = v === undefined ? true : v;
  }
  return args;
};

// Built-in mock city (mirrors seed.js) usable with no DB
const mockCity = () => {
  const c = { lat: 19.076, lng: 72.8777 };
  const zones = [
    { _id: 'z1', code: 'Z1', name: 'Central Market', footfall: 30000, commercialDensity: 0.7, residentialDensity: 0.4, populationDensity: 12000, nearbyRestaurants: 9, nearbyMarkets: 4 },
    { _id: 'z2', code: 'Z2', name: 'Old Colony', footfall: 12000, commercialDensity: 0.3, residentialDensity: 0.9, populationDensity: 20000, nearbyRestaurants: 3, nearbyMarkets: 2 },
    { _id: 'z3', code: 'Z3', name: 'Tech Park', footfall: 18000, commercialDensity: 0.5, residentialDensity: 0.5, populationDensity: 8000, nearbyRestaurants: 6, nearbyMarkets: 2 },
  ];
  let n = 0;
  const bins = zones.flatMap((z, zi) =>
    Array.from({ length: 8 }, (_, bi) => ({
      _id: `b${zi}${bi}`, binId: `BIN-${100 + n++}`, zone: z._id,
      capacityL: [120, 240, 240, 240, 660][bi % 5],
      location: { lat: c.lat + zi * 0.01 + bi * 0.001, lng: c.lng + bi * 0.002 },
    }))
  );
  const eventsByZone = {
    Z1: [{ type: 'festival', startDate: new Date(Date.now() + 2 * 86400000), endDate: new Date(Date.now() + 4 * 86400000) }],
  };
  return { zones, bins, eventsByZone };
};

const run = async () => {
  const args = parseArgs();
  const days = parseInt(args.days) || 30;
  const fromDb = !!args['from-db'];

  let zones, bins, eventsByZone;
  if (fromDb) {
    const { connectDB } = require('../config/db');
    await connectDB();
    const m = require('../models');
    zones = await m.Zone.find().lean();
    bins = await m.Bin.find().lean();
    const events = await m.Event.find({ status: { $in: ['upcoming', 'active'] } }).lean();
    eventsByZone = {};
    for (const ev of events) {
      const z = zones.find((z2) => String(z2._id) === String(ev.zone));
      if (z) (eventsByZone[z.code] = eventsByZone[z.code] || []).push(ev);
    }
  } else {
    ({ zones, bins, eventsByZone } = mockCity());
  }

  console.log(`Generating ${days} days of hourly data for ${bins.length} bins...`);
  const rows = await generateDataset({ zones, bins, eventsByZone, days });
  const exported = exportDataset(rows, { name: 'nagarai' });
  console.log(`Exported ${exported.count} rows ->`);
  console.log(`  ${exported.json}`);
  console.log(`  ${exported.csv}`);

  if (args.train) {
    const engine = args.engine || 'baseline';
    console.log(`Training model (${engine})...`);
    const model = await train(rows, { engine, outputFile: exported.json });
    const trainedFile = saveModel(model, { engine });
    console.log(`Model saved -> ${trainedFile}`);
  }
};

run().then(() => process.exit(0)).catch((e) => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});
