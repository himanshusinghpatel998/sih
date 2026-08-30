const { Event, Zone } = require('../models');
const { computeEventImpact } = require('../services/eventEngine');

const resolveZone = async (zoneIdOrCode) => {
  if (!zoneIdOrCode) return null;
  let zone = await Zone.findById(zoneIdOrCode);
  if (!zone) zone = await Zone.findOne({ code: String(zoneIdOrCode).toUpperCase() });
  return zone;
};

// @desc  Create an event and auto-compute its sanitation impact
// @route POST /api/events
const createEvent = async (req, res) => {
  try {
    const {
      name,
      type,
      description,
      zone,
      location,
      startDate,
      endDate,
      startHour,
      endHour,
      expectedAttendance,
    } = req.body;

    if (!name || !startDate) {
      return res.status(400).json({ message: 'name and startDate are required' });
    }

    const zoneDoc = await resolveZone(zone);
    const impact = computeEventImpact({ type: type || 'other', expectedAttendance: expectedAttendance || 0, name });

    const event = await Event.create({
      name,
      type: type || 'other',
      description: description || '',
      zone: zoneDoc ? zoneDoc._id : null,
      location: location || (zoneDoc ? zoneDoc.center : null),
      startDate,
      endDate,
      startHour: startHour ?? 10,
      endHour: endHour ?? 22,
      expectedAttendance: expectedAttendance || 0,
      wasteMultiplier: impact.wasteMultiplier,
      recommended: {
        extraBins: impact.extraBins,
        extraVehicles: impact.extraVehicles,
        extraSweepers: impact.extraSweepers,
        collectionFrequencyHrs: impact.collectionFrequencyHrs,
        peakWasteStart: impact.peakWasteStart,
        peakWasteEnd: impact.peakWasteEnd,
      },
      status: 'upcoming',
    });

    res.status(201).json({ event, impact });
  } catch (err) {
    console.error(' [EVENT] create error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  List events (optionally upcoming only)
// @route GET /api/events
const listEvents = async (req, res) => {
  try {
    const { upcoming } = req.query;
    const query = {};
    if (upcoming) query.status = { $in: ['upcoming', 'active'] };
    const events = await Event.find(query).populate('zone', 'name code').sort({ startDate: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Compute/recompute impact for a given event
// @route GET /api/events/:id/impact
const getEventImpact = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const impact = computeEventImpact({
      type: event.type,
      expectedAttendance: event.expectedAttendance,
      name: event.name,
    });
    res.json({ event, impact });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc  Update event status (e.g. active / completed)
// @route PUT /api/events/:id
const updateEvent = async (req, res) => {
  try {
    const { status } = req.body;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (status) {
      if (!['upcoming', 'active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      event.status = status;
    }
    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createEvent, listEvents, getEventImpact, updateEvent };
