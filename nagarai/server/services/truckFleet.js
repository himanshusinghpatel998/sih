/**
 * Truck fleet taxonomy — real municipal waste-truck payload tiers, used to
 * pick the right-sized vehicle(s) for a route instead of always sending the
 * same generic truck regardless of how much waste is actually being
 * collected. `capacityKg` is the tier's usable payload ceiling.
 */
const TRUCK_TYPES = [
  { type: 'mini-truck', label: 'Small mini garbage truck', capacityKg: 3000 },
  { type: 'compactor-small', label: 'Small/medium compactor', capacityKg: 6000 },
  { type: 'compactor-standard', label: 'Standard municipal compactor', capacityKg: 10000 },
  { type: 'compactor-large', label: 'Large compactor', capacityKg: 15000 },
  { type: 'heavy-duty', label: 'Heavy-duty waste truck', capacityKg: 20000 },
];

// Smallest tier whose payload ceiling covers a given capacity (e.g. to label
// an existing DB-registered vehicle by its real capacityKg).
const truckTypeForCapacity = (capacityKg) =>
  TRUCK_TYPES.find((t) => capacityKg <= t.capacityKg) || TRUCK_TYPES[TRUCK_TYPES.length - 1];

/**
 * Right-size a synthetic fleet to cover a given total payload demand,
 * preferring fewer, appropriately-sized trucks over defaulting to the
 * biggest available tier. Greedy: each iteration picks the smallest tier
 * that can take the whole remaining load; if nothing fits it all, picks the
 * smallest tier that covers at least 60% of what's left (so a light
 * remainder doesn't force an oversized truck) and keeps going.
 */
const buildFleetForDemand = (totalKg) => {
  if (!totalKg || totalKg <= 0) return [];
  const fleet = [];
  let remaining = totalKg;
  let n = 1;
  while (remaining > 50 && n <= 12) {
    const tier =
      TRUCK_TYPES.find((t) => t.capacityKg >= remaining) ||
      TRUCK_TYPES.find((t) => t.capacityKg >= remaining * 0.6) ||
      TRUCK_TYPES[TRUCK_TYPES.length - 1];
    fleet.push({
      vehicleId: `${tier.type.toUpperCase()}-${n}`,
      capacityKg: tier.capacityKg,
      truckType: tier.type,
      truckLabel: tier.label,
    });
    remaining -= tier.capacityKg;
    n += 1;
  }
  return fleet;
};

module.exports = { TRUCK_TYPES, truckTypeForCapacity, buildFleetForDemand };
