const mongoose = require('../config/miniMongoose');

const disposalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['dumping_ground', 'recycling', 'compost', 'transfer_station'],
      default: 'dumping_ground',
    },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    capacityKg: { type: Number, default: 100000 },
    remainingKg: { type: Number, default: 100000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DisposalFacility', disposalSchema);
