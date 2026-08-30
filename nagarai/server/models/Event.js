const mongoose = require('../config/miniMongoose');

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['festival', 'concert', 'sports', 'fair', 'wedding', 'religious', 'political', 'university', 'market', 'holiday', 'other'],
      default: 'other',
    },
    description: { type: String, default: '' },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    startHour: { type: Number, default: 10 }, // local hour
    endHour: { type: Number, default: 22 },
    expectedAttendance: { type: Number, default: 0 },
    // Waste multiplier computed from attendance + historical impact, e.g. 2.8
    wasteMultiplier: { type: Number, default: 1 },
    // Derived resource recommendations (populated by event intelligence engine)
    recommended: {
      extraBins: { type: Number, default: 0 },
      extraVehicles: { type: Number, default: 0 },
      extraSweepers: { type: Number, default: 0 },
      collectionFrequencyHrs: { type: Number, default: null },
      peakWasteStart: { type: Number, default: null },
      peakWasteEnd: { type: Number, default: null },
    },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'cancelled'],
      default: 'upcoming',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
