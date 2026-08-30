/**
 * NagarAI Bin Placement & Capacity Optimizer
 *
 * Computes a Bin Demand Score per location/candidate and, using the current
 * bin network, recommends whether to ADD, UPGRADE, RELOCATE or take NO action.
 *
 * Demand Score (0-100) = weighted blend of request-level signals:
 *   0.30 predicted_waste
 *   0.20 footfall
 *   0.15 nearby_food_businesses
 *   0.15 overflow_history
 *   0.10 population
 *   0.10 distance_from_existing_bins
 */

const { haversineM, nearestBinDistanceM } = require('./geo');

const WEIGHTS = {
  predictedWaste: 0.3,
  footfall: 0.2,
  foodBusiness: 0.15,
  overflowHistory: 0.15,
  population: 0.1,
  distanceFromBins: 0.1,
};

// Standard bin capacities offered
const CAPACITY_TIERS = [120, 240, 660, 1100];

// Pick the smallest tier that covers the predicted daily demand
const recommendCapacity = (demandLDay) => {
  for (const cap of CAPACITY_TIERS) {
    if (demandLDay <= cap * 0.8) return cap;
  }
  return CAPACITY_TIERS[CAPACITY_TIERS.length - 1];
};

const clamp100 = (v) => Math.max(0, Math.min(100, v));

/**
 * Compute a demand score for a single location context.
 * All input signals should be normalized to 0-100 before weighting.
 */
const demandScore = (signals) => {
  const score =
    WEIGHTS.predictedWaste * (signals.predictedWaste || 0) +
    WEIGHTS.footfall * (signals.footfall || 0) +
    WEIGHTS.foodBusiness * (signals.foodBusiness || 0) +
    WEIGHTS.overflowHistory * (signals.overflowHistory || 0) +
    WEIGHTS.population * (signals.population || 0) +
    WEIGHTS.distanceFromBins * (signals.distanceFromBins || 0);
  return Math.round(clamp100(score));
};

// Normalize helpers (raw → 0..100)
const normWaste = (kgDay, cap = 1000) => clamp100((kgDay / (cap * 0.9)) * 100);
const normFootfall = (ff) => clamp100((ff / 50000) * 100);
const normFood = (count) => clamp100((count / 10) * 100);
const normOverflow = (count) => clamp100((count / 10) * 100);
const normPopulation = (density) => clamp100((density / 15000) * 100);
const normDistance = (distM) => {
  // wider gaps from existing bins → higher need; cap at ~500m
  return distM == null ? 100 : clamp100((distM / 500) * 100);
};

/**
 * Evaluate a candidate location and decide an action.
 *
 * @param {object} p
 *   - location {lat, lng}
 *   - zone { code, name, footfall, populationDensity, ... }
 *   - nearbyFood: number of restaurants/markets
 *   - predictedKgDay
 *   - overflowEvents: number
 *   - bins: existing bins (for nearest distance)
 *   - existingBinCapacityL: if a bin exists here
 *   - existingBinId: if a bin exists here (for upgrade/relocate decisions)
 */
const evaluateLocation = (p) => {
  const {
    location,
    zone,
    nearbyFood = 0,
    predictedKgDay = 0,
    overflowEvents = 0,
    bins = [],
    existingBin = null,
  } = p;

  const distM = nearestBinDistanceM(location, bins);
  const predictedLDay = predictedKgDay * 1.0; // kg ≈ L demo approximation

  const predictedWaste = normWaste(predictedKgDay, zone ? zone.footfall || 1000 : 1000);
  const footfall = normFootfall(zone ? zone.footfall || 0 : 0);
  const foodBusiness = normFood(nearbyFood);
  const overflowHistory = normOverflow(overflowEvents);
  const population = normPopulation(zone ? zone.populationDensity || 0 : 0);
  const distanceFromBins = normDistance(distM);

  const demand = demandScore({ predictedWaste, footfall, foodBusiness, overflowHistory, population, distanceFromBins });

  const recommendedCapacityL = recommendCapacity(predictedLDay * (demand > 60 ? 1.4 : 1));

  // Coverage classification
  const coverage = distM == null || distM > 400 ? 'poor' : distM > 200 ? 'adequate' : 'good';
  const oversupplied = existingBin && existingBin.capacityL >= 660 && demand < 35;

  let action;
  let reason;
  let priority;

  if (oversupplied && coverage === 'good') {
    action = 'relocate_bin';
    reason = 'Low demand but oversized bin — relocate to a higher-demand hotspot.';
    priority = Math.round(demand);
  } else if (existingBin) {
    if (existingBin.capacityL < recommendedCapacityL && demand > 55) {
      action = 'upgrade_capacity';
      reason = `Predicted demand (~${Math.round(predictedLDay)}L/day) exceeds current ${existingBin.capacityL}L bin.`;
      priority = Math.round(demand);
    } else {
      action = 'no_action';
      reason = 'Existing capacity is adequate for predicted demand.';
      priority = 0;
    }
  } else if (demand >= 60) {
    action = 'add_bin';
    reason = `High demand (score ${demand}) with ${coverage} coverage — install a ${recommendedCapacityL}L bin.`;
    priority = Math.round(demand);
  } else {
    action = 'no_action';
    reason = `Demand score ${demand} is below the add threshold.`;
    priority = 0;
  }

  return {
    location,
    zone: zone ? { code: zone.code, name: zone.name } : null,
    demand,
    demandBreakdown: { predictedWaste, footfall, foodBusiness, overflowHistory, population, distanceFromBins },
    coverage,
    predictedLDay: Math.round(predictedLDay),
    recommendedCapacityL,
    existingBinId: existingBin ? existingBin.binId : null,
    existingCapacityL: existingBin ? existingBin.capacityL : null,
    action,
    reason,
    priority,
  };
};

module.exports = {
  evaluateLocation,
  demandScore,
  recommendCapacity,
  CAPACITY_TIERS,
  WEIGHTS,
  normalize: { normWaste, normFootfall, normFood, normOverflow, normPopulation, normDistance },
};
