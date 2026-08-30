const mongoose = require('../config/miniMongoose');

// A concrete unit of work assigned to a worker (or group), e.g. collect a bin,
// sweep a road, verify a cleanup. Generated from predictions/incidents by
// the workforce optimizer.
const collectionTaskSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true, unique: true, trim: true },
    type: {
      type: String,
      enum: ['collection', 'sweeping', 'incident-response', 'verification', 'dumping-investigation'],
      default: 'collection',
    },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    bin: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', default: null },
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteIncident', default: null },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    estimatedWorkMin: { type: Number, default: 30 },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Worker' }],
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    priority: { type: Number, min: 0, max: 100, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'assigned', 'in-progress', 'completed', 'unresolved', 'cancelled'],
      default: 'pending',
    },
    dueAt: { type: Date, default: null },
    proofImage: { type: String, default: null },
    verificationScore: { type: Number, default: null }, // 0-100 AI cleanup confidence
  },
  { timestamps: true }
);

module.exports = mongoose.model('CollectionTask', collectionTaskSchema);
