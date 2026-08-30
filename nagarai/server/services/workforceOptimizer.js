/**
 * NagarAI Workforce Optimizer
 *
 * Estimates the number of field staff (collectors) and vehicles required per
 * zone based on the predicted waste load, number of bins, event multiplier,
 * and desired collection frequency. Supports the "how many people do I deploy
 * where" decision.
 */

// A collector handles roughly N kg of waste per shift (~4h, 1 trip)
const KG_PER_COLLECTOR_SHIFT = 800;
// A vehicle moves this much kg per trip (matches route optimizer capacity scale)
const KG_PER_VEHICLE_TRIP = 4000;
// Sweeper covers ~m² per shift in high-footfall areas
const SWEEPER_M2_PER_SHIFT = 8000;

/**
 * Compute staffing needs for a zone.
 * @param {object} p
 *   - bins: number of bins
 *   - predictedKg: total predicted kg/day for the zone
 *   - footfall
 *   - areaM2
 *   - eventMultiplier (default 1)
 *   - collectionFrequency (times per day, default 1)
 */
const computeZoneStaffing = ({
  bins = 0,
  predictedKg = 0,
  footfall = 0,
  areaM2 = 0,
  eventMultiplier = 1,
  collectionFrequency = 1,
} = {}) => {
  const effKg = predictedKg * eventMultiplier;

  // Total pickups = each bin needs collectionFrequency visits
  const totalPickups = Math.ceil(bins * collectionFrequency);
  // Each collector visit (to a group of bins along a route) covers ~18 bins
  const collectorsForBins = Math.ceil(totalPickups / 18);

  // Waste-handling collectors
  const collectorsForWaste = Math.ceil((effKg * collectionFrequency) / KG_PER_COLLECTOR_SHIFT);

  const collectors = Math.max(collectorsForBins, collectorsForWaste);

  // Vehicles: each handles KG_PER_VEHICLE_TRIP per trip * collectionFrequency
  const vehicles = Math.max(1, Math.ceil((effKg * collectionFrequency) / (KG_PER_VEHICLE_TRIP * collectionFrequency)));

  // Sweepers: proportional to area actually needing sweeping (footfall corridors)
  const sweepingArea = Math.min(areaM2, footfall * 2);
  const sweepers = Math.max(0, Math.round(sweepingArea / SWEEPER_M2_PER_SHIFT));

  // Supervisors: ~1 per 6 collectors
  const supervisors = Math.max(0, Math.ceil(collectors / 6));

  return {
    collectors,
    vehicles,
    sweepers,
    supervisors,
    totalStaff: collectors + sweepers + supervisors,
  };
};

module.exports = { computeZoneStaffing, KG_PER_COLLECTOR_SHIFT, KG_PER_VEHICLE_TRIP };
