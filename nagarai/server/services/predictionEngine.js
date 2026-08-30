/**
 * NagarAI Prediction Engine
 *
 * Predicts bin fill % / kg for multiple horizons (1h/6h/12h/24h/48h/7d) using a
 * rule + seasonal + event feature model. Designed around a pluggable strategy:
 *
 *   strategy.predict(features) -> number (expected kg in the horizon)
 *
 * The default `rule` strategy implements the feature-weighted model. An `ml`
 * strategy can be swapped in later once a model is trained (Phase 4b) — the
 * feature vector produced here is identical to the ML training features.
 */

const { buildTimeFeatures, eventMultiplier, weatherMultiplier, WEEKEND_MULTIPLIER } = require('./timeFeatures');

const HORIZONS_HOURS = {
  '1h': 1,
  '6h': 6,
  '12h': 12,
  '24h': 24,
  '48h': 48,
  '7d': 168,
};

// Base generation in "kg per hour at hourly_factor=1.0" for a 240L bin in an
// average zone; scaled by zone footfall, densities, capacity and multipliers.
const baseGenerationRate = (zone) => {
  const footfallFactor = 0.4 + 0.8 * (zone.footfall || 0) / 30000;
  const commercialFactor = 1 + (zone.commercialDensity || 0) * 1.2;
  const residentialFactor = 1 + (zone.residentialDensity || 0) * 0.6;
  return 1.8 * footfallFactor * commercialFactor * residentialFactor;
};

// Estimate kilogram waste in a bin given its fill % and capacity (density ~0.2 kg/L of bin volume for a practical fill)
const kgFromFill = (fillPct, capacityL) => (fillPct / 100) * capacityL * 1.0;

// Fraction of capacity a "full" bin's height reaches — used to derive current kg
const capacityKgFull = (capacityL) => capacityL * 0.9; // ~90% usable

const rulePredictKgInHorizon = (features, kgPerHourBase, hours) => {
  // Average the multiplier across the horizon window by sampling the hourly curve
  let total = 0;
  const startHour = features.hour;
  for (let h = 1; h <= hours; h++) {
    const sampleHour = (startHour + h) % 24;
    const hourlyFactor = kgPerHourBase.hourlyCurve[sampleHour];
    total += kgPerHourBase.base * hourlyFactor;
  }
  return total;
};

const generateContributors = (features) => {
  const c = [];
  if (features.isWeekend) c.push('weekend');
  if (features.season) c.push(`season:${features.season}`);
  if (features.eventType) c.push(`event:${features.eventType}`);
  if (features.rainfall) c.push('rain');
  if (features.hour >= 18 || features.hour <= 1) c.push('evening-peak');
  if (features.nearbyRestaurants > 0) c.push('food-cluster');
  return c.length ? c : ['baseline'];
};

/**
 * Predict a single bin across all horizons.
 * @param {object} bin  Bin doc (+ ._doc)
 * @param {object} zone Zone doc or null
 * @param {object} opts { weather, eventType, date }
 */
const predictBin = (bin, zone, { weather = 'clear', eventType = null, date = new Date() } = {}) => {
  const capacityL = bin.capacityL || 240;
  const currentLevel = bin.currentLevel || 0;
  const currentKg = kgFromFill(currentLevel, capacityL);
  const capacityKg = capacityKgFull(capacityL);

  const zoneInfo = zone
    ? {
        footfall: zone.footfall || 0,
        commercialDensity: zone.commercialDensity || 0,
        residentialDensity: zone.residentialDensity || 0,
      }
    : { footfall: 2000, commercialDensity: 0.3, residentialDensity: 0.5 };

  // Base hourly generation for this bin (kg/hr) at the zone's average profile
  const base = baseGenerationRate(zoneInfo) * (capacityL / 240);
  const hourlyCurve = require('./timeFeatures').HOURLY_CURVE;

  const now = date;
  const features = buildTimeFeatures(now, {
    eventType,
    weather,
    rainfall: weather === 'rain' || weather === 'heavy_rain' ? 1 : 0,
    nearBin: true,
  });

  // Event multiplier applies for the whole horizon (an event lasts many hours)
  let eventMult = 1;
  if (eventType) eventMult = eventMultiplier(eventType);
  if (features.weekend) eventMult *= WEEKEND_MULTIPLIER;
  if (features.rainfall) eventMult *= weatherMultiplier(weather);

  // kg added per hour (base * hourly curve) for accumulation
  const kgh = hour => base * hourlyCurve[hour] * eventMult;

  const horizons = {};
  let predictedFill = currentLevel;
  let overflowAt = null;
  let overflowRisk = 0;
  let riskScore = 0;

  for (const [horizonKey, hrs] of Object.entries(HORIZONS_HOURS)) {
    let addedKg = 0;
    const startH = features.hour;
    for (let step = 1; step <= hrs; step++) {
      addedKg += kgh((startH + step) % 24);
    }
    const newKg = currentKg + addedKg;
    const fillPct = Math.min(100, (newKg / capacityKg) * 100);
    horizons[horizonKey] = {
      predictedFillPct: Math.round(fillPct * 100) / 100,
      predictedKg: Math.round(newKg * 100) / 100,
    };

    // Overflow risk: how close to 100% across the horizon, plus urgency
    if (horizonKey === '24h') {
      overflowRisk = Math.min(100, Math.round((fillPct / 100) * 100 * 0.9));
      // time until fill reaches 100%
      if (newKg >= capacityKg) {
        let t = 0;
        let tmp = currentKg;
        while (tmp < capacityKg && t < hrs) {
          tmp += kgh((startH + t + 1) % 24);
          t++;
        }
        overflowAt = new Date(now.getTime() + t * 3600000);
      }
    }
  }

  // Risk score: weighted mix of current fill, 24h predicted fill, food cluster, footfall, event
  const populationImpact = Math.min(1, (zoneInfo.footfall || 0) / 30000);
  const foodDensity = Math.min(1, (features.nearbyRestaurants || 0) / 8);
  riskScore = Math.round(
    0.35 * currentLevel +
      0.35 * horizons['24h'].predictedFillPct +
      0.15 * (foodDensity * 100) +
      0.15 * (populationImpact * 100)
  );
  riskScore = Math.min(100, riskScore);

  // Bin status from current level (red/yellow/green)
  const status = currentLevel >= 70 ? 'red' : currentLevel <= 20 ? 'green' : 'yellow';

  return {
    binId: bin.binId || String(bin._id),
    zone: zone ? zone.code : null,
    currentLevel,
    predictions: horizons,
    overflowAt,
    overflowRisk,
    riskScore,
    status,
    contributors: generateContributors(features),
    modelVersion: 'rule-seasonal-v1',
    strategy: 'rule',
  };
};

/**
 * Predict all bins (optionally scoped by zone).
 * @param {object} ctx { bins, zonesById, eventsActive, weather, date }
 */
const predictAllBins = ({ bins, zonesById, activeEventsByZone, weather = 'clear', date = new Date() }) => {
  return bins.map((bin) => {
    const zone = bin.zone && zonesById ? zonesById[String(bin.zone)] : null;
    const eventForZone = zone && activeEventsByZone ? activeEventsByZone[zone.code] : null;
    const eventType = eventForZone ? eventForZone.type : null;
    return predictBin(bin, zone, { weather, eventType, date });
  });
};

/**
 * ML-backed prediction using a trained model snapshot (see services/ml/*).
 * Contract: `model.predict(features)` -> kg. The baseline model exposes
 * per-(zone,hour) means; a future xgboost/lightgbm model exposes the same method.
 */
const predictBinWithModel = (bin, zone, model, { weather = 'clear', eventType = null, date = new Date() } = {}) => {
  const capacityL = bin.capacityL || 240;
  const currentLevel = bin.currentLevel || 0;
  const currentKg = kgFromFill(currentLevel, capacityL);
  const capacityKg = capacityKgFull(capacityL);
  const zoneCode = zone ? zone.code : 'Z1';

  const predictors = {
    hour: date.getHours(),
    day_of_week: date.getDay(),
    month: date.getMonth() + 1,
    weekend: date.getDay() === 0 || date.getDay() === 6 ? 1 : 0,
    event_type: eventType || null,
    expected_crowd: zone ? zone.footfall || 0 : 0,
    footfall: zone ? zone.footfall || 0 : 0,
    population_density: zone ? zone.populationDensity || 0 : 0,
    nearby_restaurants: zone ? zone.nearbyRestaurants || 0 : 0,
    nearby_markets: zone ? zone.nearbyMarkets || 0 : 0,
    bin_capacity: capacityL,
    previous_fill_rate: currentLevel,
  };

  // Baseline lookup: mean kg for this (zone, hour); fall back to globalMean
  const baseKg =
    (model.zoneHour && model.zoneHour[`${zoneCode}:${date.getHours()}`] &&
      model.zoneHour[`${zoneCode}:${date.getHours()}`].mean) ||
    model.globalMean ||
    24;

  let perHour = baseKg;
  if (predictors.weekend) perHour *= WEEKEND_MULTIPLIER;
  if (eventType) perHour *= eventMultiplier(eventType);
  if (weather === 'rain' || weather === 'heavy_rain') perHour *= 0.6;

  const horizon = {};
  let totalKg = currentKg;
  let overflowAt = null;
  for (const [horizonKey, hrs] of Object.entries(HORIZONS_HOURS)) {
    const added = perHour * hrs * (capacityL / 240) * 1.6; // scaled accumulation
    totalKg = currentKg + added;
    const fillPct = Math.min(100, (totalKg / capacityKg) * 100);
    horizon[horizonKey] = {
      predictedFillPct: Math.round(fillPct * 100) / 100,
      predictedKg: Math.round(totalKg * 100) / 100,
    };
    if (horizonKey === '24h' && totalKg >= capacityKg) {
      let t = 0, tmp = currentKg;
      while (tmp < capacityKg && t < hrs) { tmp += perHour; t++; }
      overflowAt = new Date(date.getTime() + t * 3600000);
    }
  }

  const riskScore = Math.round(0.5 * currentLevel + 0.5 * (horizon['24h'] ? horizon['24h'].predictedFillPct : 0));
  return {
    binId: bin.binId || String(bin._id),
    zone: zoneCode,
    currentLevel,
    predictions: horizon,
    overflowAt,
    overflowRisk: Math.min(100, Math.round((horizon['24h'] ? horizon['24h'].predictedFillPct : 0) * 0.9)),
    riskScore,
    status: currentLevel >= 70 ? 'red' : currentLevel <= 20 ? 'green' : 'yellow',
    modelVersion: model.backend || 'ml',
    strategy: 'ml',
    mlFeatures: predictors,
  };
};

module.exports = {
  HORIZONS_HOURS,
  predictBin,
  predictAllBins,
  baseGenerationRate,
  rulePredictKgInHorizon,
  kgFromFill,
  predictBinWithModel,
};
