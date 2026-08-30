const mongoose = require('../config/miniMongoose');

const workerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    skills: {
      type: [String],
      enum: ['collection', 'sweeping', 'dumping-investigation', 'hazardous', 'driving'],
      default: ['collection'],
    },
    shift: {
      type: String,
      enum: ['morning', 'afternoon', 'night', 'flexible'],
      default: 'morning',
    },
    availability: { type: Boolean, default: true },
    maxWorkloadMin: { type: Number, default: 480 }, // daily max minutes
    workloadMin: { type: Number, default: 0 }, // currently assigned
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    // Fairness: cumulative load score for balancing across workers
    loadScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Worker', workerSchema);
