const mongoose = require('../config/miniMongoose');

const wastePredictionSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ['bin', 'zone'],
      required: true,
    },
    targetId: {
      type: String, // Bin.binId or Zone code
      required: true,
      index: true,
    },
    forecastDate: { type: Date, required: true }, // the prediction's generation time
    horizon: {
      type: String,
      enum: ['1h', '6h', '12h', '24h', '48h', '7d'],
      required: true,
    },
    predictedFillPct: { type: Number, min: 0, max: 100, default: 0 }, // for bins
    predictedKg: { type: Number, default: 0 }, // for zones / estimated weight
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    overflowAt: { type: Date, default: null }, // predicted time bin reaches 100%
    contributors: [String], // factors that drove the prediction
    modelVersion: { type: String, default: 'rule-seasonal-v1' },
    // Phase H — feedback loop: backfilled once the forecast horizon passes.
    actualFillPct: { type: Number, min: 0, max: 100, default: null },
    actualRecordedAt: { type: Date, default: null },
    error: { type: Number, default: null }, // actualFillPct - predictedFillPct
  },
  { timestamps: true }
);

wastePredictionSchema.index({ targetType: 1, targetId: 1, horizon: 1, forecastDate: -1 });

module.exports = mongoose.model('WastePrediction', wastePredictionSchema);
