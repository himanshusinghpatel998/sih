/**
 * Seed script — creates a mock city with zones, bins, landmarks, vehicles,
 * workers, disposal facilities and an admin login.
 *
 * Run:  node seed.js
 *
 * Requires MONGO_URI to be set in server/.env
 */
require('dotenv').config();
const mongoose = require('./config/miniMongoose');
const connectDB = require('./config/db');
const {
  User,
  Zone,
  Landmark,
  Bin,
  Vehicle,
  Worker,
  Event,
  DisposalFacility,
  WastePrediction,
  BinRecommendation,
  Route,
  CollectionTask,
  WasteIncident,
} = require('./models');

const MOCK_CITY = { name: 'NagarCity', center: { lat: 19.076, lng: 72.8777 } };

// ---- Zones (with densities/footfall) ----
const ZONES = [
  { code: 'Z1', name: 'Old Market', populationDensity: 12000, commercialDensity: 0.9, residentialDensity: 0.4, footfall: 42000 },
  { code: 'Z2', name: 'College Road', populationDensity: 9000, commercialDensity: 0.6, residentialDensity: 0.6, footfall: 25000 },
  { code: 'Z3', name: 'Railway Area', populationDensity: 8000, commercialDensity: 0.5, residentialDensity: 0.3, footfall: 31000 },
  { code: 'Z4', name: 'Residential North', populationDensity: 6000, commercialDensity: 0.2, residentialDensity: 0.9, footfall: 8000 },
  { code: 'Z5', name: 'Food Street', populationDensity: 11000, commercialDensity: 0.95, residentialDensity: 0.3, footfall: 38000 },
  { code: 'Z6', name: 'Riverside Park', populationDensity: 4000, commercialDensity: 0.3, residentialDensity: 0.5, footfall: 15000 },
];

// Small geographic offsets from city center per zone (lat ~0.01 = ~1.1km)
const ZONE_OFFSET = {
  Z1: { lat: -0.012, lng: -0.008 },
  Z2: { lat: 0.004, lng: 0.012 },
  Z3: { lat: -0.006, lng: 0.02 },
  Z4: { lat: 0.016, lng: -0.01 },
  Z5: { lat: 0.002, lng: -0.018 },
  Z6: { lat: 0.02, lng: 0.02 },
};

const LANDMARKS = [
  { name: 'Central Veg Market', type: 'market', zone: 'Z1', wasteWeight: 0.9 },
  { name: 'Sharma Restaurant', type: 'restaurant', zone: 'Z1', wasteWeight: 0.7 },
  { name: 'City College', type: 'college', zone: 'Z2', wasteWeight: 0.8 },
  { name: 'Railway Station', type: 'railway_station', zone: 'Z3', wasteWeight: 0.95 },
  { name: 'Sunrise Mall', type: 'mall', zone: 'Z3', wasteWeight: 0.6 },
  { name: 'Riverside Food Court', type: 'food_street', zone: 'Z5', wasteWeight: 0.9 },
  { name: 'Nagar General Hospital', type: 'hospital', zone: 'Z4', wasteWeight: 0.5 },
  { name: 'Gandhi Grounds', type: 'religious', zone: 'Z6', wasteWeight: 0.6 },
];

// Bins per zone with capacities (L) and current fill levels
const BIN_CAPACITIES = [120, 240, 660, 1100];
const BINS_BY_ZONE = {
  Z1: [660, 1100, 240, 240, 1100, 660],
  Z2: [240, 660, 240, 1100],
  Z3: [1100, 660, 240, 1100, 240],
  Z4: [240, 240, 660],
  Z5: [1100, 1100, 660, 240, 660],
  Z6: [240, 240],
};

const VEHICLES = [
  { no: 'V-101', type: 'truck', capacityKg: 5000 },
  { no: 'V-102', type: 'compactor', capacityKg: 8000 },
  { no: 'V-103', type: 'mini-truck', capacityKg: 2000 },
  { no: 'V-104', type: 'truck', capacityKg: 5000 },
  { no: 'V-105', type: 'electric', capacityKg: 1500 },
  { no: 'V-106', type: 'three-wheeler', capacityKg: 800 },
];

const WORKERS = [
  { name: 'Ramesh', email: 'worker1@nagarai.test', skills: ['collection', 'driving'], shift: 'morning' },
  { name: 'Suresh', email: 'worker2@nagarai.test', skills: ['sweeping', 'collection'], shift: 'morning' },
  { name: 'Manoj', email: 'worker3@nagarai.test', skills: ['collection'], shift: 'afternoon' },
  { name: 'Priya', email: 'worker4@nagarai.test', skills: ['sweeping'], shift: 'morning' },
  { name: 'Vikram', email: 'worker5@nagarai.test', skills: ['collection', 'driving'], shift: 'afternoon' },
  { name: 'Anita', email: 'worker6@nagarai.test', skills: ['sweeping', 'collection'], shift: 'night' },
];

const seed = async () => {
  await connectDB();
  console.log('🌱 Seeding NagarAI mock city...\n');

  // Clear existing docs (idempotent re-seed)
  const models = [User, Zone, Landmark, Bin, Vehicle, Worker, Event, DisposalFacility, WastePrediction, BinRecommendation, Route, CollectionTask, WasteIncident];
  for (const m of models) await m.deleteMany({});
  console.log('🧹 Cleared existing data');

  // ---- Users ----
  const admin = await User.create({
    name: 'Municipal Admin',
    email: 'admin@nagarai.test',
    password: 'admin123',
    role: 'admin',
    rewardPoints: 0,
  });

  const workerUsers = [];
  for (const w of WORKERS) {
    const user = await User.create({
      name: w.name,
      email: w.email,
      password: 'worker123',
      role: 'collector',
      block: 'A',
      rewardPoints: 0,
    });
    workerUsers.push({ user, ...w });
  }
  console.log(`👤 Users: 1 admin, ${workerUsers.length} collectors`);

  // ---- Zones ----
  const zoneDocs = {};
  for (const z of ZONES) {
    const off = ZONE_OFFSET[z.code];
    zoneDocs[z.code] = await Zone.create({
      name: z.name,
      code: z.code,
      center: { lat: MOCK_CITY.center.lat + off.lat, lng: MOCK_CITY.center.lng + off.lng },
      populationDensity: z.populationDensity,
      commercialDensity: z.commercialDensity,
      residentialDensity: z.residentialDensity,
      footfall: z.footfall,
    });
  }
  console.log(`🗺️  Zones: ${ZONES.length}`);

  // ---- Landmarks ----
  for (const l of LANDMARKS) {
    const off = ZONE_OFFSET[l.zone];
    await Landmark.create({
      name: l.name,
      type: l.type,
      zone: zoneDocs[l.zone]._id,
      location: {
        lat: MOCK_CITY.center.lat + off.lat + (Math.random() - 0.5) * 0.004,
        lng: MOCK_CITY.center.lng + off.lng + (Math.random() - 0.5) * 0.004,
      },
      wasteWeight: l.wasteWeight,
      estimatedDailyVisitors: Math.round(500 + Math.random() * 5000),
    });
  }
  console.log(`🏷️  Landmarks: ${LANDMARKS.length}`);

  // ---- Bins ----
  let binSeq = 100;
  for (const [zoneCode, caps] of Object.entries(BINS_BY_ZONE)) {
    const off = ZONE_OFFSET[zoneCode];
    const zone = zoneDocs[zoneCode];
    for (const cap of caps) {
      const binId = 'BIN-' + binSeq++;
      // Spread bins within the zone; some already nearing full for a good demo
      const level = Math.min(98, Math.max(5, Math.round(20 + Math.random() * 70)));
      const status = level >= 70 ? 'red' : level <= 20 ? 'green' : 'yellow';
      await Bin.create({
        binId,
        zone: zone._id,
        location: {
          lat: MOCK_CITY.center.lat + off.lat + (Math.random() - 0.5) * 0.01,
          lng: MOCK_CITY.center.lng + off.lng + (Math.random() - 0.5) * 0.01,
        },
        capacityL: cap,
        currentLevel: level,
        status,
        overflowCount: level >= 70 ? Math.floor(Math.random() * 4) : 0,
      });
    }
  }
  const binCount = Object.values(BINS_BY_ZONE).reduce((a, c) => a + c.length, 0);
  console.log(`🗑️  Bins: ${binCount}`);

  // ---- Vehicles ----
  for (const v of VEHICLES) {
    await Vehicle.create({
      vehicleNo: v.no,
      type: v.type,
      capacityKg: v.capacityKg,
      fuelConsumptionKm: v.type === 'electric' ? 0 : 4,
      status: 'available',
      location: { lat: MOCK_CITY.center.lat, lng: MOCK_CITY.center.lng },
    });
  }
  console.log(`🚛 Vehicles: ${VEHICLES.length}`);

  // ---- Workers ----
  for (const wu of workerUsers) {
    const off = ZONE_OFFSET[ZONES[Math.floor(Math.random() * ZONES.length)].code];
    await Worker.create({
      userId: wu.user._id,
      zone: zoneDocs[ZONES[Math.floor(Math.random() * ZONES.length)].code]._id,
      skills: wu.skills,
      shift: wu.shift,
      availability: true,
      location: { lat: MOCK_CITY.center.lat + off.lat, lng: MOCK_CITY.center.lng + off.lng },
    });
  }
  console.log(`👷 Workers: ${workerUsers.length}`);

  // ---- Disposal facility ----
  const disposal = await DisposalFacility.create({
    name: 'NagarCity Dumping Ground',
    type: 'dumping_ground',
    location: { lat: MOCK_CITY.center.lat + 0.03, lng: MOCK_CITY.center.lng + 0.03 },
    capacityKg: 1000000,
    remainingKg: 800000,
  });

  // ---- A sample upcoming event (good for the killer demo) ----
  const eventStart = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
  await Event.create({
    name: 'NagarCity Food & Cultural Festival',
    type: 'festival',
    description: 'Major city festival with food stalls and cultural programs.',
    zone: zoneDocs['Z5']._id,
    location: zoneDocs['Z5'].center,
    startDate: eventStart,
    endDate: new Date(eventStart.getTime() + 2 * 24 * 60 * 60 * 1000),
    startHour: 16,
    endHour: 23,
    expectedAttendance: 25000,
    wasteMultiplier: 2.8,
    status: 'upcoming',
  });
  console.log(`🎪 Events: 1 (upcoming festival)`);

  console.log('\n✅ Seed complete!');
  console.log('──────────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Admin:    admin@nagarai.test  / admin123');
  console.log(`  Collector: ${WORKERS[0].email} / worker123`);
  console.log('──────────────────────────────────────────');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
