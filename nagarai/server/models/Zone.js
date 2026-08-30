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
    weatherMultiplier: { type: Number, default: 1 }, // present/future weather influence
  },
  { timestamps: true }
);

module.exports = mongoose.model('Zone', zoneSchema);
