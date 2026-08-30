const mongoose = require('../config/miniMongoose');

// Generated optimized collection route for a vehicle. Contains an ordered list
// of stops (depot -> bins -> disposal). Stored so workers/drivers can view their
// daily route and so we can show "old vs AI" comparisons.
const routeSchema = new mongoose.Schema(
  {
    routeId: { type: String, required: true, unique: true, trim: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    depot: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    disposal: { type: mongoose.Schema.Types.ObjectId, ref: 'DisposalFacility', default: null },
    stops: [
      {
        sequence: { type: Number },
        type: { type: String, enum: ['depot', 'bin', 'disposal'] },
        ref: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', default: null },
        location: {
          lat: { type: Number },
          lng: { type: Number },
        },
        predictedDemandKg: { type: Number, default: 0 },
      },
    ],
    totalDistanceM: { type: Number, default: 0 },
    totalLoadKg: { type: Number, default: 0 },
    // For old-vs-AI comparison in the demo
    savedDistanceM: { type: Number, default: 0 },
    savedTimeMin: { type: Number, default: 0 },
    estimatedFuelL: { type: Number, default: 0 },
    isDynamic: { type: Boolean, default: false }, // true if re-routed due to urgency
    status: {
      type: String,
      enum: ['draft', 'active', 'completed', 'cancelled'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Route', routeSchema);
