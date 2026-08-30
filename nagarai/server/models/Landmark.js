const mongoose = require('../config/miniMongoose');

// Landmarks influence waste behavior. A cluster of restaurants increases
// predicted organic/plastic waste; schools/colleges add paper waste, etc.
const landmarkSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        'restaurant',
        'cafe',
        'food_street',
        'market',
        'school',
        'college',
        'hospital',
        'railway_station',
        'bus_station',
        'tourist_attraction',
        'mall',
        'office',
        'religious',
        'other',
      ],
      required: true,
      index: true,
    },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    // Relative weight of this landmark's waste generation (0-1)
    wasteWeight: { type: Number, default: 0.5 },
    estimatedDailyVisitors: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Landmark', landmarkSchema);
