const mongoose = require('../config/miniMongoose');

const vehicleSchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, unique: true, trim: true },
    type: {
      type: String,
      enum: ['mini-truck', 'truck', 'compactor', 'electric', 'three-wheeler'],
      default: 'truck',
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
