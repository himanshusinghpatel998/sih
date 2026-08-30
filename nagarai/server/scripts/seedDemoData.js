#!/usr/bin/env node
/**
 * Demo-data seeder — makes sure EVERY view the user sees has data.
 *
 * Populates all the "derived" collections that drive the Admin / Collector /
 * Citizen (student) dashboards and the NagarAI Command Center:
 *
 *   StoreItem, Order, OrderLog, Reward, Complaint, WasteIncident,
 *   SweepingNeed, BinRecommendation, Notification, BinData, CollectionTask
 *
 * plus ensures a demo Citizen login exists and enriches Bin sensors.
 *
 * Run:  node scripts/seedDemoData.js
 *
 * Idempotent: clears only the demo collections above (keeps base city seed:
 * users/zones/bins/vehicles/workers/events/landmarks/facilities).
 */

require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('../config/miniMongoose');
const {
  User,
  Zone,
  Bin,
  Vehicle,
  Worker,
  Complaint,
  WasteIncident,
  SweepingNeed,
  BinRecommendation,
  CollectionTask,
} = require('../models');
const StoreItem = require('../models/StoreItem');
const Order = require('../models/Order');
const OrderLog = require('../models/OrderLog');
const Reward = require('../models/Reward');
const Notification = require('../models/Notification');
const BinData = require('../models/BinData');
const DisposalFacility = require('../models/DisposalFacility');
const { createNotification } = require('../controllers/notificationController');

const DEMO_CITIZEN = { email: 'citizen@nagarai.test', password: 'citizen123', name: 'Aisha Khan', block: 'A', rewardPoints: 380 };

const STORE_ITEMS = [
  { name: 'Reusable Water Bottle', description: 'Stainless steel 750ml bottle to cut single-use plastic.', category: 'accessories', pointsRequired: 180, stock: 25, image: 'https://placehold.co/300x300/E8F5E9/123524?text=Bottle' },
  { name: 'Eco Tote Bag', description: 'Durable cotton tote for plastic-free shopping.', category: 'home', pointsRequired: 120, stock: 40, image: 'https://placehold.co/300x300/FFF3E0/4E342E?text=Tote' },
  { name: 'Plant Sapling Kit', description: 'Neem sapling with soil + pot for your balcony.', category: 'garden', pointsRequired: 250, stock: 15, image: 'https://placehold.co/300x300/E8F5E9/1B5E20?text=Sapling' },
  { name: 'Notebook Set', description: 'Pack of 3 recycled-paper notebooks.', category: 'stationery', pointsRequired: 80, stock: 30, image: 'https://placehold.co/300x300/E3F2FD/0D47A1?text=Notebooks' },
  { name: 'Rechargeable Fan', description: 'USB rechargeable table fan for summer.', category: 'home', pointsRequired: 350, stock: 8, image: 'https://placehold.co/300x300/E1F5FE/01579B?text=Fan' },
  { name: 'Seed Pack (5 varieties)', description: 'Tomato, chilli, coriander, mint & basil seeds.', category: 'garden', pointsRequired: 60, stock: 50, image: 'https://placehold.co/300x300/F1F8E9/33691E?text=Seeds' },
  { name: 'Home Compost Bin', description: 'Turn kitchen waste into rich compost.', category: 'home', pointsRequired: 450, stock: 10, image: 'https://placehold.co/300x300/EFEBE9/3E2723?text=Compost' },
  { name: 'Hydro Flask', description: 'Insulated 1L steel flask, keeps drinks cool.', category: 'accessories', pointsRequired: 300, stock: 12, image: 'https://placehold.co/300x300/EDE7F6/311B92?text=Flask' },
];

const COMPLAINT_POOL = [
  { location: 'Near Central Veg Market, Old Market', wasteType: 'Mixed Waste', description: 'Trash piled up beside the market entrance for 2 days.', block: 'A' },
  { location: 'Streetlight 12, College Road', wasteType: 'Plastic Waste', description: 'Plastic bags scattered along the service lane.', block: 'A' },
  { location: 'Railway Station East Exit', wasteType: 'Mixed Waste', description: 'Overflowing bins near the ticket counter.', block: 'A' },
  { location: 'Park Avenue, Residential North', wasteType: 'Construction Debris', description: 'Construction debris dumped on the footpath.', block: 'A' },
  { location: 'Food Street Lane 2', wasteType: 'Food Waste', description: 'Spoiled food waste dumped behind the stalls.', block: 'B' },
  { location: 'Riverside Walkway', wasteType: 'Garden Waste', description: 'Broken tree branches and leaf piles left unswept.', block: 'B' },
  { location: 'Sunrise Mall Service Road', wasteType: 'Mixed Waste', description: 'Cartons and wrappers behind the mall dumpster.', block: 'B' },
  { location: 'Gandhi Grounds Gate 3', wasteType: 'Mixed Waste', description: 'Litter after weekend flea market.', block: 'C' },
];

const INCIDENT_POOL = [
  { source: 'citizen', type: 'overflow', status: 'open', priority: 88, description: 'Bin overflowing at market gate for two days.' },
  { source: 'cctv', type: 'illegal_dumping', status: 'assigned', priority: 92, description: 'Vehicle seen dumping debris at night on service road.' },
  { source: 'iot', type: 'overflow', status: 'in-progress', priority: 95, description: 'Sensor level 96% — collection in progress.' },
  { source: 'prediction', type: 'garbage_accumulation', status: 'open', priority: 76, description: 'Predicted accumulation ahead of festival weekend.' },
  { source: 'citizen', type: 'road_litter', status: 'resolved', priority: 42, description: 'Litter on footpath — cleaned by sweep crew.' },
  { source: 'cctv', type: 'unclean_road', status: 'open', priority: 58, description: 'Dirt accumulation detected on college road.' },
  { source: 'admin', type: 'damaged_bin', status: 'resolved', priority: 49, description: 'Damaged bin replaced near railway station.' },
  { source: 'citizen', type: 'missing_bin', status: 'open', priority: 61, description: 'No bin present near park entrance.' },
  { source: 'iot', type: 'overflow', status: 'resolved', priority: 71, description: 'Sensor spike resolved after collection round.' },
  { source: 'prediction', type: 'garbage_accumulation', status: 'assigned', priority: 82, description: 'High footfall zone forecast — preemptive route.' },
];

const SWEEPING_POOL = [
  { roadType: 'market', dirtScore: 78, frequencyLabel: 'daily', frequencyPerWeek: 7, peakStartHour: 9, peakEndHour: 12, priority: 88, contributors: ['high footfall', 'market stalls', 'event multiplier'] },
  { roadType: 'food_street', dirtScore: 85, frequencyLabel: '2x/day', frequencyPerWeek: 14, peakStartHour: 18, peakEndHour: 23, priority: 92, contributors: ['food waste', 'night crowd', 'street vendors'] },
  { roadType: 'main', dirtScore: 62, frequencyLabel: '3x/week', frequencyPerWeek: 3, peakStartHour: 8, peakEndHour: 10, priority: 74, contributors: ['commuter flow', 'nearby mall'] },
  { roadType: 'residential', dirtScore: 38, frequencyLabel: '2x/week', frequencyPerWeek: 2, peakStartHour: 7, peakEndHour: 9, priority: 45, contributors: ['leaf litter', 'pet waste'] },
  { roadType: 'park', dirtScore: 51, frequencyLabel: '3x/week', frequencyPerWeek: 3, peakStartHour: 16, peakEndHour: 19, priority: 55, contributors: ['weekend visitors', 'religious gathering'] },
  { roadType: 'highway', dirtScore: 44, frequencyLabel: '2x/week', frequencyPerWeek: 2, peakStartHour: 7, peakEndHour: 11, priority: 40, contributors: ['dust from traffic', 'roadside vendors'] },
  { roadType: 'main', dirtScore: 70, frequencyLabel: 'daily', frequencyPerWeek: 7, peakStartHour: 10, peakEndHour: 14, priority: 80, contributors: ['market spillover', 'bus stop crowd'] },
  { roadType: 'residential', dirtScore: 30, frequencyLabel: '1x/week', frequencyPerWeek: 1, peakStartHour: 8, peakEndHour: 10, priority: 25, contributors: ['low footfall', 'morning commuters'] },
];

const BIN_RECOMMENDATIONS = [
  { action: 'add_bin', predictedDemandLDay: 1400, recommendedCapacityL: 1100, currentCoverage: 'poor', reason: 'High demand with zero nearby coverage.', priority: 90 },
  { action: 'upgrade_capacity', predictedDemandLDay: 980, recommendedCapacityL: 660, currentCoverage: 'adequate', reason: '240L fills within hours; upgrade to 660L.', priority: 78 },
  { action: 'add_bin', predictedDemandLDay: 1150, recommendedCapacityL: 660, currentCoverage: 'poor', reason: 'Food street generates >1t/day waste.', priority: 86 },
  { action: 'add_bin', predictedDemandLDay: 820, recommendedCapacityL: 660, currentCoverage: 'poor', reason: 'Railway exit lacks collection points.', priority: 70 },
  { action: 'upgrade_capacity', predictedDemandLDay: 720, recommendedCapacityL: 660, currentCoverage: 'adequate', reason: 'Grows during events; upgrade for headroom.', priority: 60 },
  { action: 'reduce_capacity', predictedDemandLDay: 150, recommendedCapacityL: 240, currentCoverage: 'excess', reason: 'Under-utilised area can share collection routes.', priority: 20 },
];

const REWARD_ACTIVITIES = [
  'Waste Photo Complaint',
  'Volunteer Clean-Up Drive',
  'Segregation Champion',
  'Reporting Illegal Dumping',
  'Community Swachh Drive',
];

const BLOCKS = ['A', 'B', 'C', 'D', 'E'];

const rand = (min, max) => Math.round(min + Math.random() * (max - min));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (d) => new Date(Date.now() - d * 86400000);

const seedDemoData = async () => {
  await connectDB();
  console.log('\n Seeding demo data for all views...\n');

  // ---- Load base city ----
  const [zones, bins, vehicles, workers, collectors, admins] = await Promise.all([
    Zone.find().lean(),
    Bin.find().lean(),
    Vehicle.find().lean(),
    Worker.find().lean(),
    User.find({ role: 'collector' }).lean(),
    User.find({ role: 'admin' }).lean(),
  ]);
  if (!zones.length || !bins.length) {
    console.log(' Base city missing — run `node seed.js` first.');
    process.exit(1);
  }
  const admin = admins[0];
  const zoneByCode = Object.fromEntries(zones.map((z) => [z.code, z._id]));
  const binsByZone = {};
  bins.forEach((b) => {
    const code = b.zone && zoneByCode[Object.keys(zoneByCode).find((c) => String(zoneByCode[c]) === String(b.zone))];
    const key = code || zones[0].code;
    (binsByZone[key] = binsByZone[key] || []).push(b);
  });

  // ---- Ensure demo citizen (student role = Citizen portal) ----
  let citizen = await User.findOne({ email: DEMO_CITIZEN.email });
  if (!citizen) {
    citizen = await User.create({
      name: DEMO_CITIZEN.name,
      email: DEMO_CITIZEN.email,
      password: DEMO_CITIZEN.password,
      role: 'student',
      block: DEMO_CITIZEN.block,
      rewardPoints: DEMO_CITIZEN.rewardPoints,
      dept: 'Old Market',
    });
    console.log(` Created demo citizen: ${DEMO_CITIZEN.email} / ${DEMO_CITIZEN.password}`);
  } else {
    citizen.rewardPoints = DEMO_CITIZEN.rewardPoints;
    await citizen.save();
  }

  // ---- Clear demo collections (idempotent) ----
  const demoModels = [StoreItem, Order, OrderLog, Reward, Complaint, WasteIncident, SweepingNeed, BinRecommendation, Notification, BinData, CollectionTask];
  for (const m of demoModels) await m.deleteMany({});
  console.log(' Cleared demo collections');

  // ================= STORE ITEMS =================
  const storeItems = [];
  for (const s of STORE_ITEMS) storeItems.push(await StoreItem.create({ ...s, isActive: true }));
  console.log(` Store items: ${storeItems.length}`);

  // ================= ORDERS + LOGS =================
  const orderDefs = [
    { block: 'A', status: 'pending', pickupCode: 'A1B2C3', assigned: null },
    { block: 'A', status: 'pending', pickupCode: 'K7M9Q2', assigned: null },
    { block: 'A', status: 'approved', pickupCode: 'P4R6T8', assigned: null },
    { block: 'A', status: 'ready_for_pickup', pickupCode: 'X9Y1Z4', assigned: 0 },
    { block: 'A', status: 'delivered', pickupCode: 'W2V3U5', assigned: 0 },
    { block: 'B', status: 'ready_for_pickup', pickupCode: 'H8J4K6', assigned: 4 },
    { block: 'B', status: 'delivered', pickupCode: 'N3M6L9', assigned: 4 },
    { block: 'C', status: 'pending', pickupCode: 'R7S2T5', assigned: null },
    { block: 'A', status: 'delivered', pickupCode: 'E4F6G8', assigned: 0 },
  ];
  const orders = [];
  for (let i = 0; i < orderDefs.length; i++) {
    const def = orderDefs[i];
    const item = storeItems[i % storeItems.length];
    const collector = def.assigned != null ? collectors[def.assigned] || collectors[def.assigned % collectors.length] : null;
    const isDelivered = def.status === 'delivered';
    const order = await Order.create({
      orderId: 'ORD-' + String(1001 + i),
      userName: citizen.name,
      user: citizen._id,
      block: def.block,
      item: item._id,
      itemName: item.name,
      pointsUsed: item.pointsRequired,
      status: def.status,
      assignedTo: collector ? collector._id : null,
      assignedCollectorName: collector ? collector.name : null,
      pickupLocation: 'Admin Office / College Store Room',
      pickupTime: '10 AM – 5 PM',
      pickupCode: def.pickupCode,
      expiresAt: daysAgo(-2),
      deliveredAt: isDelivered ? daysAgo(rand(1, 4)) : undefined,
      rewardGiven: isDelivered ? true : false,
    });
    orders.push(order);
    if (isDelivered) {
      await OrderLog.create({ orderId: order.orderId, action: 'delivered', performedBy: collector ? collector._id : admin._id, details: 'pickup verified', timestamp: order.deliveredAt });
    } else {
      await OrderLog.create({ orderId: order.orderId, action: 'viewed', performedBy: admin._id, details: 'created via demo seed', timestamp: daysAgo(1) });
    }
  }
  console.log(` Orders: ${orders.length} (+${orders.filter((o) => o.rewardGiven).length} delivered)`);

  // ================= REWARDS =================
  const rewards = [];
  for (let i = 0; i < 7; i++) {
    rewards.push(await Reward.create({
      user: citizen._id,
      activity: pick(REWARD_ACTIVITIES),
      points: rand(20, 60),
      date: daysAgo(rand(0, 20)),
    }));
  }
  for (const c of collectors.slice(0, 3)) {
    rewards.push(await Reward.create({
      user: c._id,
      activity: `Delivered Order ${pick(orders.filter((o) => o.rewardGiven))?.orderId || 'ORD'}`,
      points: 20,
      date: daysAgo(rand(1, 5)),
    }));
  }
  console.log(` Rewards: ${rewards.length}`);

  // ================= COMPLAINTS =================
  const complaints = [];
  const complaintStatuses = ['pending', 'in-progress', 'in_progress', 'completed', 'completed', 'rejected', 'pending', 'in-progress', 'completed', 'pending'];
  for (let i = 0; i < COMPLAINT_POOL.length; i++) {
    const c = COMPLAINT_POOL[i];
    const status = complaintStatuses[i];
    const collector = collectors.find((col) => col.block === c.block) || collectors[i % collectors.length];
    const complaint = await Complaint.create({
      complaintId: 'CMP-' + String(2001 + i),
      user: i % 3 === 0 ? admin._id : citizen._id,
      location: c.location,
      locationData: { address: c.location },
      wasteType: c.wasteType,
      description: c.description,
      block: c.block,
      assignedTo: status === 'completed' || status === 'in-progress' || status === 'in_progress' || status === 'rejected' ? collector._id : collector._id,
      status,
      type: i % 3 === 0 ? (i % 6 === 0 ? 'iot' : 'scan') : 'complaint',
      statusHistory: [
        {
          status: 'pending',
          note: 'Report received',
          updatedBy: admin._id,
          timestamp: daysAgo(rand(1, 8)),
        },
        ...(status !== 'pending' ? [{
          status,
          note: 'Updated by collector',
          updatedBy: collector._id,
          timestamp: daysAgo(rand(0, 3)),
        }] : []),
      ],
      rewardGiven: status === 'completed',
    });
    complaints.push(complaint);
  }
  console.log(` Complaints: ${complaints.length}`);

  // ================= WASTE INCIDENTS =================
  const incidents = [];
  for (let i = 0; i < INCIDENT_POOL.length; i++) {
    const inc = INCIDENT_POOL[i];
    const zoneCode = zones[i % zones.length].code;
    const zoneBins = binsByZone[zoneCode] || bins;
    const bin = zoneBins[i % zoneBins.length];
    const incident = await WasteIncident.create({
      incidentId: 'INC-' + String(5001 + i),
      source: inc.source,
      type: inc.type,
      zone: zoneByCode[zoneCode],
      bin: bin ? bin._id : null,
      location: bin ? bin.location : zones[i % zones.length].center,
      description: inc.description,
      extentKg: rand(20, 400),
      priority: inc.priority,
      status: inc.status,
      duplicateCount: inc.source === 'citizen' && i % 2 === 0 ? rand(2, 4) : 1,
      reporter: admin._id,
      verificationScore: inc.status === 'resolved' ? rand(70, 98) : null,
    });
    incidents.push(incident);
  }
  console.log(` Waste incidents: ${incidents.length}`);

  // ================= SWEEPING NEEDS =================
  const sweepingNeeds = [];
  for (let i = 0; i < SWEEPING_POOL.length; i++) {
    const s = SWEEPING_POOL[i];
    const zone = zones[i % zones.length];
    sweepingNeeds.push(await SweepingNeed.create({
      zone: zone._id,
      location: zone.center,
      roadType: s.roadType,
      dirtScore: s.dirtScore,
      frequencyPerWeek: s.frequencyPerWeek,
      frequencyLabel: s.frequencyLabel,
      peakStartHour: s.peakStartHour,
      peakEndHour: s.peakEndHour,
      priority: s.priority,
      contributors: s.contributors,
      eventMultiplier: s.priority >= 80 ? 1.5 : 1,
    }));
  }
  console.log(` Sweeping needs: ${sweepingNeeds.length}`);

  // ================= BIN RECOMMENDATIONS =================
  const recommendations = [];
  for (let i = 0; i < BIN_RECOMMENDATIONS.length; i++) {
    const r = BIN_RECOMMENDATIONS[i];
    const zone = zones[i % zones.length];
    recommendations.push(await BinRecommendation.create({
      zone: { code: zone.code, name: zone.name },
      location: zone.center,
      action: r.action,
      recommendedCapacityL: r.recommendedCapacityL,
      predictedDemandLDay: r.predictedDemandLDay,
      currentCoverage: r.currentCoverage,
      reason: r.reason,
      priority: r.priority,
      status: 'pending',
    }));
  }
  console.log(` Bin recommendations: ${recommendations.length}`);

  // ================= COLLECTION TASKS =================
  const tasks = [];
  const taskDefs = [
    { type: 'collection', status: 'assigned', priority: 88, worker: 0, minutes: 45 },
    { type: 'collection', status: 'in-progress', priority: 95, worker: 1, minutes: 30 },
    { type: 'incident-response', status: 'assigned', priority: 92, worker: 2, minutes: 60 },
    { type: 'sweeping', status: 'pending', priority: 70, worker: 3, minutes: 120 },
    { type: 'collection', status: 'pending', priority: 66, worker: 4, minutes: 35 },
    { type: 'verification', status: 'pending', priority: 52, worker: 5, minutes: 20 },
    { type: 'collection', status: 'completed', priority: 60, worker: 0, minutes: 40 },
    { type: 'incident-response', status: 'completed', priority: 85, worker: 1, minutes: 55 },
    { type: 'sweeping', status: 'in-progress', priority: 80, worker: 2, minutes: 100 },
    { type: 'collection', status: 'pending', priority: 74, worker: 3, minutes: 25 },
  ];
  for (let i = 0; i < taskDefs.length; i++) {
    const t = taskDefs[i];
    const zone = zones[i % zones.length];
    const zoneBins = binsByZone[zone.code] || bins;
    const bin = zoneBins[i % zoneBins.length];
    const worker = workers[t.worker % workers.length];
    const vehicle = vehicles[i % vehicles.length];
    const linkedIncident = t.type === 'incident-response' ? incidents.find((x) => x.status !== 'resolved') : null;
    const task = await CollectionTask.create({
      taskId: 'TASK-' + String(3001 + i),
      type: t.type,
      zone: zone._id,
      bin: t.type === 'collection' || t.type === 'verification' ? bin._id : null,
      incident: linkedIncident ? linkedIncident._id : null,
      location: (bin && bin.location) || zone.center,
      estimatedWorkMin: t.minutes,
      assignedTo: [worker._id],
      vehicle: vehicle._id,
      priority: t.priority,
      status: t.status,
      dueAt: daysAgo((t.status === 'completed' ? -1 : 0) - rand(0, 2)),
      verificationScore: t.type === 'verification' ? (t.status === 'completed' ? rand(70, 95) : null) : null,
    });
    tasks.push(task);
  }
  console.log(` Collection tasks: ${tasks.length}`);

  // ================= NOTIFICATIONS =================
  const notifDefs = [
    { user: citizen, message: 'Welcome to the Citizen Portal! Report waste and earn points.', type: 'user' },
    { user: citizen, message: 'Complaint CMP-2001 received. Crew is on the way.', type: 'complaint' },
    { user: citizen, message: 'You earned 45 pts for Waste Photo Complaint.', type: 'reward' },
  ];
  for (const c of collectors) {
    notifDefs.push({ user: c, message: 'New sanitation complaint in your block.', type: 'complaint' });
  }
  notifDefs.push({ user: admin, message: 'IoT alert: Bin BIN-100 reached 96% in Block A.', type: 'iot' });
  for (const n of notifDefs) {
    await createNotification(n.user._id, n.message, n.type);
  }
  console.log(` Notifications: ${notifDefs.length}`);

  // ================= BIN DATA (IoT) =================
  const binReadings = [];
  const sensorBins = bins.slice(0, 18);
  sensorBins.forEach((b, i) => {
    binReadings.push({
      binId: b.binId,
      block: BLOCKS[i % BLOCKS.length],
      level: Math.min(98, Math.max(8, b.currentLevel || rand(20, 90))),
    });
  });
  for (const r of binReadings) await BinData.create(r);
  console.log(` IoT bin readings: ${binReadings.length}`);

  // ================= UPDATE BINS (sensors / last collection) =================
  let updated = 0;
  for (const b of bins) {
    if (updated < 18) {
      b.hasSensor = true;
      b.lastCollection = daysAgo(rand(0, 2));
      await Bin.findByIdAndUpdate(b._id, { hasSensor: true, lastCollection: b.lastCollection });
      updated++;
    }
  }
  console.log(` Bins flagged as sensor-enabled: ${updated}`);

  console.log('\n Demo data seed complete!');
  console.log('──────────────────────────────────────────');
  console.log(' Demo Citizen: citizen@nagarai.test / citizen123 (Block A)');
  console.log(' Existing admin:  admin@nagarai.test / admin123');
  console.log(' Existing collector: worker1@nagarai.test / worker123');
  console.log('──────────────────────────────────────────');

  await mongoose.disconnect();
  process.exit(0);
};

seedDemoData().catch((err) => {
  console.error(' SeedDemoData error:', err);
  process.exit(1);
});