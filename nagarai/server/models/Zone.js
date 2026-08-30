const mongoose = require('../config/miniMongoose');

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    boundary: {
      type: { type: String, enum: ['Polygon', 'Point'], default: 'Polygon' },
      coordinates: { type: [[[Number]]] }, // GeoJSON polygon
    },
    center: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    populationDensity: { type: Number, default: 0 }, // people / km²
    commercialDensity: { type: Number, default: 0 }, // 0-1
    residentialDensity: { type: Number, default: 0 }, // 0-1
    footfall: { type: Number, default: 0 }, // average daily footfall
    areaM2: { type: Number, default: 0 },
    // Dominant real-world character (market/commercial/tourist/mixed_use/
    // institutional/residential_high/residential_low/industrial) — set from
    // ml/bins_master.csv's zone_type on import. Drives sweeping's road-type
    // inference directly instead of guessing from landmark counts, which
    // flattens out once every zone has at least some restaurant landmarks.
    zoneType: { type: String, default: null },
    weatherMultiplier: { type: Number, default: 1 }, // present/future weather influence
  },
  { timestamps: true }
);

module.exports = mongoose.model('Zone', zoneSchema);
