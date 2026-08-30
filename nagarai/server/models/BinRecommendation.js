const mongoose = require('../config/miniMongoose');

// Recommendation on bin infrastructure: add a bin, upgrade capacity, relocate,
// or take no action — based on predicted demand vs current coverage.
const binRecommendationSchema = new mongoose.Schema(
  {
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', index: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, default: '' },
    },
    action: {
      type: String,
      enum: ['add_bin', 'upgrade_capacity', 'relocate_bin', 'reduce_capacity', 'no_action'],
      required: true,
    },
    existingBin: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', default: null },
    recommendedCapacityL: { type: Number, default: null },
    predictedDemandLDay: { type: Number, default: 0 },
    currentCoverage: {
      type: String,
      enum: ['poor', 'adequate', 'good', 'excess'],
      default: 'adequate',
    },
    reason: { type: String, default: '' },
    priority: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'applied'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BinRecommendation', binRecommendationSchema);
