const express = require('express');
const db = require('../../../db');
const hub = require('../../../ws/hub');

const router = express.Router();

function now() {
  return Date.now();
}

function serializePhase(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    min_water_level_pct: row.min_water_level_pct,
    max_water_level_pct: row.max_water_level_pct,
    is_system_phase: Boolean(row.is_system_phase),
    order_index: row.order_index,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getPhaseById(id) {
  return db.prepare('SELECT * FROM plant_phases WHERE id = ?').get(id);
}

function getPhasesOrdered() {
  return db.prepare('SELECT * FROM plant_phases ORDER BY order_index ASC, id ASC').all();
}

function getCurrentFieldState() {
  return db.prepare('SELECT * FROM field_state WHERE id = 1').get();
}

function parseInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  return parsed;
}

function validatePercent(value, fieldName, { allowZero = true } = {}) {
  const parsed = parseInteger(value, fieldName);
  const min = allowZero ? 0 : 1;
  if (parsed < min || parsed > 100) {
    throw new Error(`${fieldName} must be between ${min} and 100`);
  }
  return parsed;
}

function broadcastPhases() {
  hub.broadcast('phases_updated', {
    phases: getPhasesOrdered().map(serializePhase),
  });
}

router.get('/phases', (req, res) => {
  try {
    const phases = getPhasesOrdered().map(serializePhase);
    return res.json({ phases });
  } catch (err) {
    console.error('[automation/phases] get failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/phases', (req, res) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'invalid_name', detail: 'name is required' });
    }

    const reservedNames = new Set(['tanam', 'vegetatif', 'primordia', 'pengisian', 'pematangan']);
    if (reservedNames.has(name.toLowerCase())) {
      return res.status(400).json({ error: 'reserved_phase_name', detail: 'system phases cannot be created via this endpoint' });
    }

    const existing = db.prepare('SELECT id FROM plant_phases WHERE lower(name) = lower(?)').get(name);
    if (existing) {
      return res.status(409).json({ error: 'phase_name_exists', detail: 'a phase with this name already exists' });
    }

    const minWaterLevelPct = validatePercent(body.min_water_level_pct, 'min_water_level_pct');
    const maxWaterLevelPct = validatePercent(body.max_water_level_pct, 'max_water_level_pct');
    if (minWaterLevelPct > maxWaterLevelPct) {
      return res.status(400).json({ error: 'invalid_thresholds', detail: 'min_water_level_pct cannot exceed max_water_level_pct' });
    }

    const phases = getPhasesOrdered();
    const systemPhaseOrderIndices = new Set(phases.filter((phase) => Boolean(phase.is_system_phase)).map((phase) => Number(phase.order_index)));

    let orderIndex = body.order_index;
    if (orderIndex === undefined || orderIndex === null || orderIndex === '') {
      orderIndex = phases.length ? Math.max(...phases.map((phase) => Number(phase.order_index) || 0)) + 1 : 0;
    } else {
      orderIndex = Number(orderIndex);
      if (!Number.isFinite(orderIndex)) {
        return res.status(400).json({ error: 'invalid_order_index', detail: 'order_index must be numeric' });
      }
    }

    if (systemPhaseOrderIndices.has(orderIndex)) {
      return res.status(400).json({ error: 'order_index_conflict', detail: 'order_index cannot collide with system phase order slots' });
    }

    const duplicateOrder = phases.find((phase) => Number(phase.order_index) === orderIndex);
    if (duplicateOrder) {
      return res.status(409).json({ error: 'order_index_exists', detail: 'order_index must be unique' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO plant_phases (
        name,
        min_water_level_pct,
        max_water_level_pct,
        is_system_phase,
        order_index,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 0, ?, ?, ?)
    `);
    const ts = now();
    const info = insertStmt.run(name, minWaterLevelPct, maxWaterLevelPct, orderIndex, ts, ts);
    const created = getPhaseById(info.lastInsertRowid);

    broadcastPhases();
    return res.status(201).json(serializePhase(created));
  } catch (err) {
    if (err.message.includes('must be')) {
      return res.status(400).json({ error: 'validation_error', detail: err.message });
    }
    console.error('[automation/phases] create failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.put('/phases/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_phase_id' });
    }

    const phase = getPhaseById(id);
    if (!phase) {
      return res.status(404).json({ error: 'phase_not_found' });
    }

    const body = req.body || {};
    const ts = now();

    if (Boolean(phase.is_system_phase)) {
      if (Object.prototype.hasOwnProperty.call(body, 'order_index') && body.order_index !== phase.order_index) {
        return res.status(400).json({ error: 'immutable_order_index', detail: 'system phases cannot change order_index' });
      }

      const updates = [];
      if (Object.prototype.hasOwnProperty.call(body, 'min_water_level_pct')) {
        updates.push(`min_water_level_pct = ${validatePercent(body.min_water_level_pct, 'min_water_level_pct')}`);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'max_water_level_pct')) {
        updates.push(`max_water_level_pct = ${validatePercent(body.max_water_level_pct, 'max_water_level_pct')}`);
      }
      if (!updates.length) {
        return res.status(400).json({ error: 'no_changes_provided' });
      }

      const minWaterLevelPct = Object.prototype.hasOwnProperty.call(body, 'min_water_level_pct')
        ? validatePercent(body.min_water_level_pct, 'min_water_level_pct')
        : phase.min_water_level_pct;
      const maxWaterLevelPct = Object.prototype.hasOwnProperty.call(body, 'max_water_level_pct')
        ? validatePercent(body.max_water_level_pct, 'max_water_level_pct')
        : phase.max_water_level_pct;
      if (minWaterLevelPct > maxWaterLevelPct) {
        return res.status(400).json({ error: 'invalid_thresholds', detail: 'min_water_level_pct cannot exceed max_water_level_pct' });
      }

      db.prepare(`
        UPDATE plant_phases
        SET min_water_level_pct = ?, max_water_level_pct = ?, updated_at = ?
        WHERE id = ?
      `).run(minWaterLevelPct, maxWaterLevelPct, ts, id);
    } else {
      let minWaterLevelPct = phase.min_water_level_pct;
      let maxWaterLevelPct = phase.max_water_level_pct;
      let orderIndex = phase.order_index;
      let name = phase.name;

      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const candidate = typeof body.name === 'string' ? body.name.trim() : '';
        if (!candidate) {
          return res.status(400).json({ error: 'invalid_name', detail: 'name is required' });
        }
        const existingName = db.prepare('SELECT id FROM plant_phases WHERE lower(name) = lower(?) AND id != ?').get(candidate, id);
        if (existingName) {
          return res.status(409).json({ error: 'phase_name_exists', detail: 'a phase with this name already exists' });
        }
        name = candidate;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'min_water_level_pct')) {
        minWaterLevelPct = validatePercent(body.min_water_level_pct, 'min_water_level_pct');
      }
      if (Object.prototype.hasOwnProperty.call(body, 'max_water_level_pct')) {
        maxWaterLevelPct = validatePercent(body.max_water_level_pct, 'max_water_level_pct');
      }
      if (minWaterLevelPct > maxWaterLevelPct) {
        return res.status(400).json({ error: 'invalid_thresholds', detail: 'min_water_level_pct cannot exceed max_water_level_pct' });
      }

      if (Object.prototype.hasOwnProperty.call(body, 'order_index')) {
        orderIndex = Number(body.order_index);
        if (!Number.isFinite(orderIndex)) {
          return res.status(400).json({ error: 'invalid_order_index', detail: 'order_index must be numeric' });
        }
        const duplicateOrder = db.prepare('SELECT id FROM plant_phases WHERE order_index = ? AND id != ?').get(orderIndex, id);
        if (duplicateOrder) {
          return res.status(409).json({ error: 'order_index_exists', detail: 'order_index must be unique' });
        }
      }

      db.prepare(`
        UPDATE plant_phases
        SET name = ?, min_water_level_pct = ?, max_water_level_pct = ?, order_index = ?, updated_at = ?
        WHERE id = ?
      `).run(name, minWaterLevelPct, maxWaterLevelPct, orderIndex, ts, id);
    }

    const updated = getPhaseById(id);
    broadcastPhases();
    return res.json(serializePhase(updated));
  } catch (err) {
    if (err.message.includes('must be')) {
      return res.status(400).json({ error: 'validation_error', detail: err.message });
    }
    console.error('[automation/phases] update failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.delete('/phases/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_phase_id' });
    }

    const phase = getPhaseById(id);
    if (!phase) {
      return res.status(404).json({ error: 'phase_not_found' });
    }
    if (Boolean(phase.is_system_phase)) {
      return res.status(409).json({ error: 'system_phase_cannot_delete' });
    }

    const currentFieldState = getCurrentFieldState();
    if (currentFieldState && currentFieldState.current_phase_id === id) {
      return res.status(409).json({ error: 'active_phase_cannot_delete' });
    }

    db.prepare('DELETE FROM plant_phases WHERE id = ?').run(id);
    broadcastPhases();
    return res.json({ success: true, deleted_id: id });
  } catch (err) {
    console.error('[automation/phases] delete failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
