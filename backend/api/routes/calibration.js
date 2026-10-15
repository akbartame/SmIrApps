const express = require('express');
const repo = require('../../db/repository');
const hub = require('../../ws/hub');

const router = express.Router();

// Only the four known nodes carry an ultrasonic distance reading
// that can be calibrated into a water level percentage.
const CALIBRATABLE_NODE_IDS = [1, 2, 3, 4];

function serializeCalibration(row) {
  if (!row) return null;
  return {
    node_id: row.node_id,
    raw_distance_at_0_pct_mm: row.raw_distance_at_0_pct_mm,
    raw_distance_at_100_pct_mm: row.raw_distance_at_100_pct_mm,
    updated_at: row.updated_at,
  };
}

function validateCalibrationInput(body) {
  const errors = [];
  const rawDistanceAt0PctMm = Number(body.raw_distance_at_0_pct_mm);
  const rawDistanceAt100PctMm = Number(body.raw_distance_at_100_pct_mm);

  if (!Number.isInteger(rawDistanceAt0PctMm) || rawDistanceAt0PctMm < 0 || rawDistanceAt0PctMm > 65535) {
    errors.push('raw_distance_at_0_pct_mm must be an integer between 0 and 65535');
  }
  if (!Number.isInteger(rawDistanceAt100PctMm) || rawDistanceAt100PctMm < 0 || rawDistanceAt100PctMm > 65535) {
    errors.push('raw_distance_at_100_pct_mm must be an integer between 0 and 65535');
  }
  if (errors.length === 0 && rawDistanceAt0PctMm <= rawDistanceAt100PctMm) {
    errors.push('raw_distance_at_0_pct_mm (empty tank) must be greater than raw_distance_at_100_pct_mm (full tank)');
  }

  return {
    errors,
    values:
      errors.length === 0
        ? { rawDistanceAt0PctMm, rawDistanceAt100PctMm }
        : null,
  };
}

function broadcastCalibrationUpdated(calibration) {
  hub.broadcast('calibration_updated', serializeCalibration(calibration));
}

// GET /calibration — calibration anchors for every calibrated node
router.get('/', (req, res) => {
  try {
    const calibrations = repo.getAllCalibrations().map(serializeCalibration);
    return res.json({ calibrations });
  } catch (err) {
    console.error('[calibration] get all failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// GET /calibration/:id — calibration anchors for a single node
router.get('/:id', (req, res) => {
  try {
    const nodeId = Number(req.params.id);
    if (!Number.isInteger(nodeId) || !CALIBRATABLE_NODE_IDS.includes(nodeId)) {
      return res.status(400).json({
        error: 'invalid_node_id',
        detail: 'node_id must be 1, 2, 3 or 4',
      });
    }

    const calibration = repo.getCalibration(nodeId);
    if (!calibration) {
      return res.status(404).json({ error: 'calibration_not_found' });
    }
    return res.json(serializeCalibration(calibration));
  } catch (err) {
    console.error('[calibration] get failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// PUT /calibration/:id — set (or replace) the calibration anchors for a node
router.put('/:id', (req, res) => {
  try {
    const nodeId = Number(req.params.id);
    if (!Number.isInteger(nodeId) || !CALIBRATABLE_NODE_IDS.includes(nodeId)) {
      return res.status(400).json({
        error: 'invalid_node_id',
        detail: 'node_id must be 1, 2, 3 or 4',
      });
    }

    const { errors, values } = validateCalibrationInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation_error', detail: errors.join('; ') });
    }

    const calibration = repo.upsertCalibration({ nodeId, ...values });
    broadcastCalibrationUpdated(calibration);
    return res.json(serializeCalibration(calibration));
  } catch (err) {
    console.error('[calibration] update failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
