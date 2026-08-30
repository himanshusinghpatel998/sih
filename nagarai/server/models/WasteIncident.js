const mongoose = require('../config/miniMongoose');

// A unified sanitation incident. Can originate from a citizen report, IoT alert,
// CCTV detection, or a predicted overflow. Gets de-duplicated and prioritized.
const incidentSchema = new mongoose.Schema(
  {
    incidentId: { type: String, required: true, unique: true, trim: true },
    source: {
      type: String,
      enum: ['citizen', 'cctv', 'iot', 'prediction', 'admin', 'scan'],
      default: 'citizen',
    },
    type: {
      type: String,
      enum: [
        'overflow',
        'garbage_accumulation',
        'illegal_dumping',
        'road_litter',
        'damaged_bin',
        'missing_bin',
        'unclean_road',
        'other',
      ],
      default: 'other',
    },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    bin: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', default: null },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      address: { type: String, default: '' },
    },
    description: { type: String, default: '' },
    // Estimated kg / size; useful for prioritization
    extentKg: { type: Number, default: null },
    priority: { type: Number, min: 0, max: 100, default: 0 }, // 0-100
    status: {
      type: String,
      enum: ['open', 'assigned', 'in-progress', 'resolved', 'rejected', 'duplicate'],
      default: 'open',
    },
    // Master incident clustering: duplicate reports point to this id
    mergedInto: { type: String, default: null },
    duplicateCount: { type: Number, default: 1 },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    image: { type: String, default: null },
    completionImage: { type: String, default: null },
    verificationScore: { type: Number, default: null },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTask', default: null },
  },
  { timestamps: true }
);

incidentSchema.index({ location: '2dsphere' });
incidentSchema.index({ status: 1, priority: -1 });

module.exports = mongoose.model('WasteIncident', incidentSchema);
