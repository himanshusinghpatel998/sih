const mongoose = require('../config/miniMongoose');

const binSchema = new mongoose.Schema(
  {
    binId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    address: { type: String, default: '' },
    capacityL: { type: Number, required: true, default: 240 }, // 120/240/660/1100
    // Current fill as percentage (0-100), from IoT sensor or last known estimate
    currentLevel: { type: Number, min: 0, max: 100, default: 0 },
    hasSensor: { type: Boolean, default: false },
    sensorType: { type: String, default: 'ultrasonic' },
    status: {
      type: String,
      enum: ['green', 'yellow', 'red', 'maintenance'],
      default: 'green',
    },
    lastCollection: { type: Date, default: null },
    overflowCount: { type: Number, default: 0 },
    // Optional reference to existing IoT bin data model
    iotRef: { type: mongoose.Schema.Types.ObjectId, ref: 'BinData', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bin', binSchema);
