/**
 * Shared time + seasonal feature helpers used by the dataset generator,
 * the rule prediction engine, and (later) the ML trainer.
 */

const SEASONS = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  monsoon: [9, 10, 11],
};

// Hour-of-day waste generation curve (0 = low, 1 = peak-ish). Residential + market
// zones show morning (8-11) and evening (18-21) peaks.
const HOURLY_CURVE = [
  0.25, 0.18, 0.12, 0.1, 0.12, 0.2, 0.35, 0.5, // 0-7
  0.8, 1.0, 0.9, 0.7, 0.6, 0.55, 0.6, 0.7,    // 8-15
  0.85, 0.95, 1.0, 0.95, 0.8, 0.6, 0.42, 0.3, // 16-23
];

const getSeason = (month) => {
  for (const [name, months] of Object.entries(SEASONS)) {
    if (months.includes(month)) return name;
  }
  return 'winter';
};

// Event-driven waste multiplier table (also used as the "Event Spike Model").
// Can be re-learned from historical data later.
const BASE_EVENT_MULTIPLIERS = {
  festival: 2.5,
  concert: 3.0,
  sports: 2.2,
  fair: 2.0,
  wedding: 1.8,
  religious: 1.6,
  political: 2.0,
  university: 1.8,
  market: 1.5,
  holiday: 1.2,
  other: 1.3,
};

const WEEKEND_MULTIPLIER = 1.2;

// Weather: rain tends to reduce outdoor litter a bit but can still drive
// organic decomposition urgency; extreme heat raises organic risk.
const weatherMultiplier = (weather) => {
  switch (weather) {
    case 'rain':
      return 1.1;
    case 'heavy_rain':
      return 1.15;
    case 'heatwave':
      return 1.2;
    case 'clear':
    default:
      return 1.0;
  }
};

const hourFeature = (d) => d.getHours();
const dayOfWeek = (d) => d.getDay(); // 0 = Sunday
const isWeekend = (d) => {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
};
const month = (d) => d.getMonth() + 1;

// Aggregated input features for prediction, matching the ML feature spec:
// timestamp, day_of_week, month, season, holiday, event_type, expected_crowd,
// rainfall, temperature, population_density, footfall, nearby_restaurants,
// nearby_markets, previous_waste_kg, previous_fill_rate, days_since_last_collection
const buildTimeFeatures = (date, extra = {}) => ({
  timestamp: date ? date.toISOString() : new Date().toISOString(),
  day_of_week: date ? dayOfWeek(date) : dayOfWeek(new Date()),
  month: date ? month(date) : month(new Date()),
  season: getSeason(date ? month(date) : month(new Date())),
  weekend: date ? isWeekend(date) : isWeekend(new Date()),
  hour: date ? hourFeature(date) : hourFeature(new Date()),
  hourly_factor: date ? HOURLY_CURVE[hourFeature(date)] : HOURLY_CURVE[hourFeature(new Date())],
  ...extra,
});

// Given an event type (or null) returns the multiplier to apply at that time.
const eventMultiplier = (eventType) =>
  eventType && BASE_EVENT_MULTIPLIERS[eventType]
    ? BASE_EVENT_MULTIPLIERS[eventType]
    : 1.0;

module.exports = {
  SEASONS,
  HOURLY_CURVE,
  BASE_EVENT_MULTIPLIERS,
  WEEKEND_MULTIPLIER,
  getSeason,
  weatherMultiplier,
  hourFeature,
  dayOfWeek,
  isWeekend,
  month,
  buildTimeFeatures,
  eventMultiplier,
};
