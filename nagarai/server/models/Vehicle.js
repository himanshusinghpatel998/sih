const mongoose = require('../config/miniMongoose');

const vehicleSchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, unique: true, trim: true },
    // Matches services/truckFleet.js's TRUCK_TYPES tiers, by real payload capacity:
    // mini-truck 1-3t, compactor-small 3-6t, compactor-standard 6-10t,
    // compactor-large 10-15t, heavy-duty 15-20t+.
    type: {
      type: String,
      enum: ['mini-truck', 'compactor-small', 'compactor-standard', 'compactor-large', 'heavy-duty'],
      default: 'compactor-small',
    },
    capacityKg: { type: Number, required: true, default: 2000 },
    fuelConsumptionKm: { type: Number, default: 4 }, // km per litre
    status: {
      type: String,
      enum: ['available', 'on-route', 'maintenance', 'breakdown', 'off-duty'],
      default: 'available',
    },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      default: null,
    },
    assignedZone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    lastMaintenance: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vehicle', vehicleSchema);
