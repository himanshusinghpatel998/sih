/**
 * Synthetic + enriched dataset generator.
 *
 * Generates realistic bin-level waste collection rows for each bin/zone across
 * several days, using temporal curves, event multipliers, weather, landmark and
 * footfall context — then flattens them into the exact feature schema that an
 * XGBoost/LightGBM trainer expects.
 *
 * This serves two purposes:
 *  1) Powers the demos/tests without needing a real municipal dataset.
 *  2) Produces a training CSV/JSON that the real ML model (Phase 4b) consumes.
 */

const {
  buildTimeFeatures,
  eventMultiplier,
  weatherMultiplier,
  WEEKEND_MULTIPLIER,
} = require('../timeFeatures');

// deterministic-ish pseudo random (mulberry32)
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SEQUENTIAL_NOISE = (r, w) => r() * w - w / 2;

/**
 * Compute the "true" waste generated (kg) at a given hour for a bin given its
 * context. Mirrors the rule engine but with additional stochastic noise so the
 * training data looks like real sensor data.
 *
 * @param {object} ctx
 *   { zone, hour24, date, weather, eventType, extraNoise }
 * @returns {number} kg generated that hour
 */
const hourlyKg = (ctx) => {
  const rand = rng((ctx.binCode || 'B').split('').reduce((s, c) => s + c.charCodeAt(0), 123) + ctx.date.getTime() % 100000);
  const zone = ctx.zone;
  const baseRateKgHr =
    (0.3 + 0.7 * zone.footfall / 30000) *
    (1 + zone.commercialDensity * 1.2) *
    (1 + zone.residentialDensity * 0.6);
  const hourly = ctx.timeFeatures.hourly_factor;
  let mult = hourly;
  if (ctx.timeFeatures.weekend) mult *= WEEKEND_MULTIPLIER;
  if (ctx.eventType) mult *= eventMultiplier(ctx.eventType);
  mult *= weatherMultiplier(ctx.weather);

  // Landmark boost: food/restaurant landmarks add organic waste
  const foodBoost = (zone.nearbyRestaurants || 0) * 0.03 + (zone.nearbyMarkets || 0) * 0.02;

  const kg = baseRateKgHr * mult * (1 + foodBoost) * ctx.bin.capacityL / 240;
  return Math.max(0, kg + SEQUENTIAL_NOISE(rand, kg * 0.25));
};

/**
 * Generate N days of hourly bin records.
 *
 * @param {object} params
 *   - zones: Zone docs with ._id, code, name, footfall, densities, nearbyRestaurants, nearbyMarkets
 *   - bins:  Bin docs (per zone)
 *   - events: active events per zone [{ type }]
 *   - weatherDaily: array of weather strings per day index
 *   - days: number of days to generate
 *   - startDate: Date to start from (goes backwards if negative offset)
 */
const generateDataset = async ({ zones, bins, eventsByZone, weatherDaily, days = 30, startDate = new Date() }) => {
  const rows = [];
  const today = new Date(startDate);
  today.setHours(0, 0, 0, 0);

  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() - d); // most recent first
    const weather = weatherDaily ? weatherDaily[d] : (d % 5 === 0 ? 'rain' : 'clear');

    for (const zone of zones) {
      const zoneEvents = eventsByZone ? eventsByZone[zone.code] || [] : [];
      // Did an event overlap this date?
      const activeEvent = zoneEvents.find((ev) => {
        const s = new Date(ev.startDate).setHours(0, 0, 0, 0);
        const e = (ev.endDate ? new Date(ev.endDate) : new Date(s)).setHours(0, 0, 0, 0);
        return date.getTime() >= s && date.getTime() <= e;
      });
      const zoneBins = bins.filter((b) => b.zone && String(b.zone) === String(zone._id));
      for (const bin of zoneBins) {
        let fill = 0;
        for (let h = 0; h < 24; h++) {
          const hourDate = new Date(date.getTime() + h * 3600000);
          const timeFeatures = buildTimeFeatures(hourDate);
          const kg = hourlyKg({
            zone,
            bin,
            date: hourDate,
            weather,
            eventType: activeEvent ? activeEvent.type : null,
            timeFeatures,
            binCode: bin.binId,
          });
          // Simulate collection reset once/day (skip a couple of weekends for realism)
          const collectedToday = (h === 8 && d % 7 !== 5);
          fill = collectedToday ? 0 : fill + kg;

          rows.push({
            date: hourDate.toISOString(),
            hour: h,
            day_of_week: timeFeatures.day_of_week,
            month: timeFeatures.month,
            season: timeFeatures.season,
            weekend: timeFeatures.weekend,
            holiday: 0,
            event_type: activeEvent ? activeEvent.type : null,
            expected_crowd: zone.footfall,
            rainfall: weather === 'rain' || weather === 'heavy_rain' ? 1 : 0,
            temperature: weather === 'heatwave' ? 38 : 30,
            population_density: zone.populationDensity,
            footfall: zone.footfall,
            nearby_restaurants: zone.nearbyRestaurants || 0,
            nearby_markets: zone.nearbyMarkets || 0,
            previous_waste_kg: Math.max(0, kg),
            previous_fill_rate: Math.min(100, fill / (bin.capacityL || 240) * 100 * 0.8),
            days_since_last_collection: (collectedToday ? 0 : 1) + (d % 7 === 5 ? 1 : 0),
            zone_id: String(zone.code),
            bin_id: String(bin.binId),
            latitude: bin.location ? bin.location.lat : null,
            longitude: bin.location ? bin.location.lng : null,
            bin_capacity: bin.capacityL,
            waste_collected_kg: Math.round(kg * 100) / 100,
            fill_percentage: Math.min(100, Math.round((fill / (bin.capacityL || 240)) * 100 * 0.8 * 100) / 100),
            waste_type: 'mixed',
          });
        }
      }
    }
  }
  return rows;
};

module.exports = { generateDataset, hourlyKg };
