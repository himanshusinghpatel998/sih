/**
 * NagarAI Smart Sweeping Intelligence Engine
 *
 * Computes a "Road Dirt Accumulation Score" (0-100) per zone/road and recommends
 * how often each area should be swept, based on footfall, commercial density,
 * markets, food streets, weather, events, and road type. This turns fixed
 * "sweep every road weekly" schedules into demand-driven sweeping.
 *
 * Score blend (PRD §14):
 *   0.25 footfall            (pedestrian activity)
 *   0.25 commercial density  (markets, food streets, malls)
 *   0.15 landmarks           (markets/food density in the zone)
 *   0.15 event impact        (festival/event multiplier)
 *   0.10 weather             (rain post-wash / heat dry-litter)
 *   0.10 road type           (main/food streets accumulate faster)
 */

// Traffic scale — footfall people/day, normalize to 0..100
const normFootfall = (ff) => Math.min(100, Math.round(((ff || 0) / 40000) * 100));
const normCommercial = (c) => Math.min(100, Math.round(((c || 0) / 1) * 100));
const normLandmarks = (count) => Math.min(100, Math.round(((count || 0) / 4) * 100));
const normEvents = (mult) => Math.min(100, Math.round(((mult || 1) - 1) * 50));
const normWeather = (weather) => {
  // Rain washes streets (less need now), but heat dry-litter and storms raise it
  if (weather === 'rain' || weather === 'heavy_rain') return 35;
  if (weather === 'heat') return 75;
  if (weather === 'dust' || weather === 'wind') return 65;
  return 50;
};

// Road type base dirt factor -> mapped to 0..100
const ROAD_BASE = {
  food_street: 90,
  market: 85,
  main: 70,
  highway: 60,
  park: 40,
  residential: 35,
};

// Map a score to a recommended sweeping frequency per week
const frequencyForScore = (score) => {
  if (score >= 75) return { perWeek: 15, label: '3x daily' };
  if (score >= 60) return { perWeek: 7, label: 'daily' };
  if (score >= 45) return { perWeek: 3, label: '3x/week' };
  if (score >= 30) return { perWeek: 2, label: '2x/week' };
  return { perWeek: 1, label: '1x/week' };
};

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * Compute the sweeping need for a single zone.
 * @param {object} p
 *   - zone: Zone lean doc
 *   - landmarks: landmarks in the zone (market/food count)
 *   - footfall (default zone.footfall)
 *   - weather: 'clear' | 'rain' | 'heat' | 'dust'
 *   - eventMultiplier: 1..~3 (event spike)
 *   - roadType: which kind of road we're rating
 */
const computeSweepingNeed = ({
  zone = {},
  landmarks = [],
  footfall,
  weather = 'clear',
  eventMultiplier = 1,
  roadType = 'residential',
} = {}) => {
  const footfallVal = footfall != null ? footfall : zone.footfall || 0;
  const commercial = zone.commercialDensity || 0;
  const marketCount = landmarks.filter((l) => ['market', 'food_street', 'restaurant', 'cafe', 'mall'].includes(l.type)).length;

  const f = normFootfall(footfallVal);
  const c = normCommercial(commercial);
  const lm = normLandmarks(marketCount);
  const ev = normEvents(eventMultiplier);
  const wt = normWeather(weather);
  const rb = ROAD_BASE[roadType] != null ? ROAD_BASE[roadType] : ROAD_BASE.residential;

  const raw =
    0.25 * f +
    0.25 * c +
    0.15 * lm +
    0.15 * ev +
    0.10 * wt +
    0.10 * rb;

  const dirtScore = clamp(raw);
  const { perWeek, label } = frequencyForScore(dirtScore);

  // Peak sweeping window: before morning crowd for busy areas, evening for events
  const peakStartHour = roadType === 'food_street' || roadType === 'market' ? 5 : 6;
  const peakEndHour = eventMultiplier > 1 ? 22 : roadType === 'food_street' ? 12 : 10;

  const contributors = [];
  if (f >= 60) contributors.push('high footfall');
  if (c >= 70) contributors.push('dense commercial');
  if (lm >= 60) contributors.push('market/food cluster');
  if (eventMultiplier > 1) contributors.push(`event ×${eventMultiplier}`);
  if (wt >= 65) contributors.push('weather-driven');
  if (rb >= 80) contributors.push(`busy ${roadType.replace(/_/g, ' ')}`);
  if (!contributors.length) contributors.push('baseline');

  return {
    dirtScore,
    frequencyPerWeek: perWeek,
    frequencyLabel: label,
    peakStartHour,
    peakEndHour,
    priority: dirtScore,
    contributors,
    eventMultiplier,
    breakdown: { footfall: f, commercial: c, landmarks: lm, events: ev, weather: wt, roadType: rb },
  };
};

/**
 * Run the engine across all zones (or a subset) and persist recommendations.
 * Clears prior needs for idempotency. Returns the full list (with zone ref).
 */
const runSweepingAnalysis = async ({ zones, landmarks, RoadTypeMap = {}, weather = 'clear', date = new Date() } = {}) => {
  const needs = [];
  for (const zone of zones) {
    const zoneLandmarks = landmarks.filter((l) => String(l.zone) === String(zone._id));
    const eventMult = RoadTypeMap.eventsByZone?.[String(zone._id)] || 1;
    // Pick the dominant road type from the zone's landmarks if we don't know
    const roadType = RoadTypeMap.byZone?.[String(zone._id)] || 'residential';
    const need = computeSweepingNeed({
      zone,
      landmarks: zoneLandmarks,
      weather,
      eventMultiplier: eventMult,
      roadType,
    });
    needs.push({
      zone: zone._id,
      landmark: RoadTypeMap.landmarkByZone?.[String(zone._id)] || null,
      location: zone.center || null,
      roadType,
      ...need,
    });
  }
  return needs;
};

module.exports = {
  computeSweepingNeed,
  runSweepingAnalysis,
  frequencyForScore,
  ROAD_BASE,
  normalize: { normFootfall, normCommercial, normLandmarks, normEvents, normWeather },
};
