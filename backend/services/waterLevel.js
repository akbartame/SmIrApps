const repo = require('../db/repository');

/**
 * Derive the water level percentage from a raw ultrasonic echo
 * distance (mm) using the node's calibration anchors:
 *   raw_distance_at_0_pct_mm   — echo distance when the tank is empty
 *   raw_distance_at_100_pct_mm — echo distance when the tank is full
 *
 * Returns null when the level cannot be derived: no calibration
 * stored, unreadable echo (<= 0 mm), or inverted/invalid anchors.
 */
function deriveWaterLevelPct(rawDistanceMm, calibration) {
  if (!calibration) return null;
  if (typeof rawDistanceMm !== 'number' || rawDistanceMm <= 0) return null;

  const distanceAtEmpty = calibration.raw_distance_at_0_pct_mm;
  const distanceAtFull = calibration.raw_distance_at_100_pct_mm;
  if (distanceAtEmpty <= distanceAtFull) return null;

  // Echo distance shrinks as the water rises, so level grows from the
  // empty anchor downward: full (distanceAtFull) -> 100%, empty -> 0%.
  const pct = ((distanceAtEmpty - rawDistanceMm) / (distanceAtEmpty - distanceAtFull)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

/**
 * Raw echo distance carried by a nodesensor payload, per source:
 * LoRa sensor nodes report water_distance_mm, relay nodes report
 * distance_mm (both are the same HC-SR04/JSN-SR04T echo reading).
 */
function extractRawDistanceMm(payload) {
  if (!payload) return null;
  if (typeof payload.water_distance_mm === 'number') return payload.water_distance_mm;
  if (typeof payload.distance_mm === 'number') return payload.distance_mm;
  return null;
}

function getCalibrationForNode(nodeId) {
  return repo.getCalibration(nodeId);
}

/**
 * One-stop helper for a parsed nodesensor row (payload fields
 * merged to the top level, as returned by repository.parseRow,
 * the /nodes API handlers, or an inbound MQTT message).
 */
function deriveCalibratedWaterLevelPct(row) {
  if (!row) return null;
  const payload =
    typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload ?? row;
  return deriveWaterLevelPct(extractRawDistanceMm(payload), getCalibrationForNode(row.node_id));
}

/**
 * Same as deriveCalibratedWaterLevelPct, but for a stored reading
 * whose payload is still a JSON string (nodesensor_latest rows,
 * as consumed by the automation loop).
 */
function deriveCalibratedWaterLevelPctFromStoredReading(reading) {
  if (!reading) return null;
  const payload =
    typeof reading.payload === 'string' ? JSON.parse(reading.payload) : reading.payload;
  return deriveWaterLevelPct(extractRawDistanceMm(payload), getCalibrationForNode(reading.node_id));
}

module.exports = {
  deriveWaterLevelPct,
  extractRawDistanceMm,
  deriveCalibratedWaterLevelPct,
  deriveCalibratedWaterLevelPctFromStoredReading,
};
