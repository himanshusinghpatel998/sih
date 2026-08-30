/**
 * Day-cycle feedback loop: predict → route → collect → carry outstanding
 * waste into tomorrow's starting state → predict again.
 *
 * Without this, `Bin.currentLevel` never changes after import/collection —
 * every "Run prediction" call re-predicts from the exact same static
 * starting point, and nothing a route/deploy actually does ever shows up
 * in tomorrow's numbers. advanceDay() is the missing link: called once a
 * "day" of collection is done (after Deploy routes), it resets the bins
 * that got collected and advances every other bin's fill level forward by
 * its predicted growth — so leftover, uncollected waste actually
 * accumulates and shows up as compounding risk on the next prediction run,
 * the way a real city's bins would.
 */
const { Bin, Zone } = require('../models');
const { predictBin } = require('./predictionEngine');

// A collected bin doesn't go to exactly 0 — a small residual reflects real
// pickup (dregs, a bag missed, the truck compacting rather than fully
// clearing) and avoids every collected bin looking artificially identical.
const residualAfterCollection = () => Math.round(Math.random() * 8);

const statusForLevel = (level) => (level >= 70 ? 'red' : level >= 40 ? 'yellow' : 'green');

/**
 * @param {string[]} collectedBinIds - binIds that were actually on a
 *   deployed route today (from the frontend's last generate/deploy call).
 * @param {object} opts - { weather } passed through to the rule engine for
 *   bins the trained model doesn't cover.
 */
const advanceDay = async ({ collectedBinIds = [], weather = 'clear' } = {}) => {
  const collectedSet = new Set(collectedBinIds);
  const [bins, zones] = await Promise.all([Bin.find().lean(), Zone.find().lean()]);
  const zonesById = {};
  for (const z of zones) zonesById[String(z._id)] = z;

  const now = new Date();
  let collected = 0;
  let advanced = 0;
  const changes = [];

  for (const bin of bins) {
    if (collectedSet.has(bin.binId)) {
      const newLevel = residualAfterCollection();
      await Bin.findByIdAndUpdate(bin._id, {
        $set: {
          currentLevel: newLevel,
          status: statusForLevel(newLevel),
          lastCollection: now,
          overflowCount: 0,
        },
      });
      changes.push({ binId: bin.binId, action: 'collected', fromLevel: bin.currentLevel, toLevel: newLevel });
      collected += 1;
    } else {
      const zone = bin.zone ? zonesById[String(bin.zone)] : null;
      if (!zone) continue; // no zone context to project growth from — leave as-is
      const pred = predictBin(bin, zone, { weather });
      const newLevel = Math.min(100, Math.round(pred.predictions['24h']?.predictedFillPct ?? bin.currentLevel));
      if (newLevel === bin.currentLevel) continue;
      await Bin.findByIdAndUpdate(bin._id, {
        $set: {
          currentLevel: newLevel,
          status: statusForLevel(newLevel),
          overflowCount: newLevel >= 100 ? (bin.overflowCount || 0) + 1 : bin.overflowCount || 0,
        },
      });
      changes.push({ binId: bin.binId, action: 'carried-over', fromLevel: bin.currentLevel, toLevel: newLevel });
      advanced += 1;
    }
  }

  return {
    timestamp: now.toISOString(),
    totalBins: bins.length,
    collected,
    advanced,
    untouched: bins.length - collected - advanced,
    changes,
  };
};

module.exports = { advanceDay };
