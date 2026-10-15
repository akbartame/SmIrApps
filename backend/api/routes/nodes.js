const express = require('express');
const config = require('../../config');
const repo = require('../../db/repository');
const waterLevel = require('../../services/waterLevel');

const router = express.Router();

// Attaches the calibrated water level % (derived from the raw
// echo distance + the node's calibration anchors) to a row
// whose payload fields are already merged to the top level.
function withCalibratedWaterLevel(row) {
  if (!row) return row;
  return { ...row, calibrated_water_level_pct: waterLevel.deriveCalibratedWaterLevelPct(row) };
}

function roundToHundredths(value) {
  if (value === null || value === undefined) return null;
  return Math.round(value * 100) / 100;
}

// Maps one aggregate bucket row to the slim chart shape for a LoRa
// sensor node. Calibration is passed in — fetched once per request,
// never once per row.
function toSensorHistoryBucket(bucket, calibration) {
  return {
    x: bucket.bucket_start,
    calibrated_water_level_pct: waterLevel.deriveWaterLevelPct(
      bucket.avg_water_distance_mm,
      calibration
    ),
    voltage_v: roundToHundredths(
      bucket.avg_bus_voltage_mv === null ? null : bucket.avg_bus_voltage_mv / 1000
    ),
    current_ma: bucket.avg_current_ma,
    sample_count: bucket.sample_count,
  };
}

// Maps one aggregate bucket row to the slim chart shape for a relay
// node. Flow rate is left to the client: it owns FLOW_CALIBRATION_CONSTANT,
// so the bucket carries the raw first/last counters plus the span.
function toRelayHistoryBucket(bucket, bucketMs) {
  return {
    x: bucket.bucket_start,
    temperature_c: roundToHundredths(
      bucket.avg_temperature_c_x100 === null ? null : bucket.avg_temperature_c_x100 / 100
    ),
    flow_pulses_first: bucket.flow_pulses_first,
    flow_pulses_last: bucket.flow_pulses_last,
    span_s: bucketMs / 1000,
    sample_count: bucket.sample_count,
  };
}

// GET /nodes — latest reading for every node that has ever reported in
router.get('/', (req, res) => {
  res.json(repo.getAllLatest().map(withCalibratedWaterLevel));
});

// GET /nodes/:id — latest reading for a single node
router.get('/:id', (req, res) => {
  const nodeId = Number(req.params.id);
  const row = repo.getLatestByNode(nodeId);
  if (!row) return res.status(404).json({ error: 'node_not_found' });
  res.json(withCalibratedWaterLevel(row));
});

// GET /nodes/:id/history?limit=100 — most recent N readings, newest first
// GET /nodes/:id/history?from=<ms>&to=<ms>&maxPoints=500 — time-bucketed
//   aggregates (ascending) for chart plotting over an adjustable time
//   range. `from`/`to` are unix ms; the response holds at most maxPoints
//   slim rows no matter how wide the range is.
router.get('/:id/history', (req, res) => {
  const nodeId = Number(req.params.id);
  const { from, to } = req.query;

  if (from !== undefined || to !== undefined) {
    const fromTs = from !== undefined ? Number(from) : 0;
    const toTs = to !== undefined ? Number(to) : Date.now();
    const maxPoints = Math.min(Math.max(Number(req.query.maxPoints) || 500, 50), 2000);
    // Divisor is maxPoints - 1 because the range edges can straddle two
    // partial buckets (floor + 1 distinct buckets); this keeps the
    // response to at most maxPoints rows.
    const bucketMs = Math.max(
      1,
      Math.ceil(Math.max(toTs - fromTs, 1) / Math.max(maxPoints - 1, 1))
    );
    const calibration = repo.getCalibration(nodeId);
    const isRelay = config.automation.relayNodeIds.includes(nodeId);
    const buckets = repo.getHistoryBucketsByNodeRange(nodeId, fromTs, toTs, bucketMs);
    return res.json(
      buckets.map((bucket) =>
        isRelay
          ? toRelayHistoryBucket(bucket, bucketMs)
          : toSensorHistoryBucket(bucket, calibration)
      )
    );
  }

  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  res.json(repo.getHistoryByNode(nodeId, limit).map(withCalibratedWaterLevel));
});

module.exports = router;
