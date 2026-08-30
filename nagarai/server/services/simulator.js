/**
 * NagarAI What-If Simulator
 *
 * Lets operators answer questions like:
 *   "If a 30k-person festival happens in Zone 1, and we DON'T add capacity,
 *    when do bins overflow and how many vehicles do we need to keep up?"
 *
 * Runs a discrete hourly simulation of every bin using the rule engine's
 * generation model, applying scenario multipliers (event/attendance, weather),
 * an optional dynamic ramp, and an optional collection policy (frequency).
 *
 * Output: per-bin hourly fill trajectory + overflow events, plus fleet/staff
 * sizing from the workforce optimizer for the scenario load.
 */

const { predictBin, HORIZONS_HOURS } = require('./predictionEngine');
const { computeEventImpact } = require('./eventEngine');
const { computeZoneStaffing } = require('./workforceOptimizer');
const { buildTimeFeatures, eventMultiplier } = require('./timeFeatures');

/**
 * Project a scenario across hours.
 * @param {object} p
 *   - bins:  Bin docs [{ _id, binId, capacityL, currentLevel, zone }]
 *   - zones: Zone docs [{ _id, code, footfall, commercialDensity, residentialDensity }]
 *   - zoneIdsByCode: map code -> _id
 *   - scenario: {
 *       eventType, expectedAttendance,        // event multiplier
 *       weather,                               // multiplier
 *       zones: ['Z1'],                         // only simulate these zones (all if empty)
 *       hours: 48,                             // simulation horizon
 *       collectionFrequencyHrs: 0,             // 0 = never collect
 *     }
 */
const simulate = async ({
  bins = [],
  zones = [],
  zoneIdsByCode = {},
  scenario = {},
} = {}) => {
  const {
    eventType = null,
    expectedAttendance = 0,
    weather = 'clear',
    zones: simZones = [],
    hours = 48,
    collectionFrequencyHrs = 0,
  } = scenario;

  const targetCodes = simZones.length ? simZones : zones.map((z) => z.code);
  const zonesById = {};
  zones.forEach((z) => { zonesById[String(z._id)] = z; });

  const eventMult = eventType ? computeEventImpact({ type: eventType, expectedAttendance }).wasteMultiplier : 1;

  const trackedBins = bins.filter((b) => {
    const z = b.zone ? zonesById[String(b.zone)] : null;
    return z && targetCodes.includes(z.code);
  });

  // Hourly generation for a bin at a clock hour (uses rule-engine logic via predictBin's base)
  const generationKgPerHour = (bin, zone, hourOfDay) => {
    // reuse the prediction engine's base rate machinery
    const sample = buildTimeFeatures(new Date(2026, 0, 1, hourOfDay));
    const base = require('./predictionEngine').baseGenerationRate({
      footfall: zone.footfall || 0,
      commercialDensity: zone.commercialDensity || 0,
      residentialDensity: zone.residentialDensity || 0,
    }) * (bin.capacityL / 240);
    const hourlyCurve = require('./timeFeatures').HOURLY_CURVE;
    let mult = hourlyCurve[hourOfDay] * eventMult;
    if (weather === 'rain' || weather === 'heavy_rain') mult *= 0.6;
    return Math.max(0, base * mult);
  };

  const capacityKg = (bin) => (bin.capacityL || 240) * 0.9;

  // Fake start date (today) — keep hourly curve deterministic by clock hour
  const start = new Date();
  start.setMinutes(0, 0, 0);

  const trajectories = [];
  const overflowEvents = [];
  let peakInventoryKg = 0;

  for (const bin of trackedBins) {
    const zone = bin.zone ? zonesById[String(bin.zone)] : null;
    if (!zone) continue;
    const capKg = capacityKg(bin);
    let fillKg = ((bin.currentLevel || 0) / 100) * capKg;
    let sinceLastCollection = 0;

    const points = [{ hour: 0, fillPct: Math.round(((fillKg / capKg) * 100) * 10) / 10 }];
    let overflowedAt = null;

    for (let h = 1; h <= hours; h++) {
      const clockHour = (start.getHours() + h) % 24;
      fillKg += generationKgPerHour(bin, zone, clockHour);
      sinceLastCollection++;

      // Optional collection policy: reset when the interval elapses
      if (collectionFrequencyHrs > 0 && sinceLastCollection >= collectionFrequencyHrs) {
        fillKg = 0;
        sinceLastCollection = 0;
      }

      const fillPct = Math.round(((fillKg / capKg) * 100) * 10) / 10;
      points.push({ hour: h, fillPct: Math.min(100, fillPct) });

      if (fillPct >= 100 && !overflowedAt) {
        overflowedAt = h;
        overflowEvents.push({ binId: bin.binId, hour: h, overKg: Math.round((fillKg - capKg) * 10) / 10 });
      }
      if (fillKg > peakInventoryKg) peakInventoryKg = fillKg;
    }

    trajectories.push({
      binId: bin.binId,
      zone: zone.code,
      capacityL: bin.capacityL,
      startLevel: bin.currentLevel || 0,
      overflowedAt,                 // hour when it would hit 100%
      finalFillPct: points[points.length - 1].fillPct,
      curve: points,
      collectedDuringRun: collectionFrequencyHrs > 0,
    });
  }

  // Fleet & staff sizing for the scenario load (sum of bin inventory peak)
  const simBinsPerZone = {};
  trackedBins.forEach((b) => {
    const z = b.zone ? zonesById[String(b.zone)] : null;
    if (z) (simBinsPerZone[z.code] = simBinsPerZone[z.code] || []).push(b);
  });
  const staffing = Object.entries(simBinsPerZone).map(([code, zBins]) => {
    const zone = zones.find((z) => z.code === code);
    const predictedKg = peakInventoryKg * (zBins.length / Math.max(1, trackedBins.length));
    return {
      zone: code,
      name: zone ? zone.name : code,
      bins: zBins.length,
      eventMultiplier: eventMult,
      staffing: computeZoneStaffing({
        bins: zBins.length,
        predictedKg,
        footfall: zone ? zone.footfall : 0,
        areaM2: zone ? zone.areaM2 || 0 : 0,
        eventMultiplier: eventMult,
      }),
    };
  });

  const overflows = overflowEvents.length;
  const firstOverflow = overflowEvents.sort((a, b) => a.hour - b.hour)[0] || null;

  return {
    scenario: { eventType, expectedAttendance, weather, zones: targetCodes, hours, collectionFrequencyHrs },
    eventWasteMultiplier: eventMult,
    summary: {
      binsSimulated: trackedBins.length,
      overflows,
      firstOverflowHour: firstOverflow ? firstOverflow.hour : null,
      firstOverflowBin: firstOverflow ? firstOverflow.binId : null,
      peakInventoryKg: Math.round(peakInventoryKg),
    },
    trajectories,
    overflowEvents,
    staffing,
  };
};

module.exports = { simulate };