const express = require('express');
const db = require('../../../db');
const hub = require('../../../ws/hub');

const router = express.Router();

function now() {
  return Date.now();
}

function getFieldState() {
  return db.prepare('SELECT * FROM field_state WHERE id = 1').get();
}

function getAutomationState() {
  return db.prepare('SELECT * FROM automation_state WHERE id = 1').get();
}

function getSensorHealth() {
  return db.prepare('SELECT * FROM sensor_health WHERE id = 1').get();
}

function serializeSensorHealth(row) {
  if (!row) return null;
  return {
    online: Boolean(row.online),
    last_update_ms_ago: row.last_update_ms_ago,
    last_update_at: row.last_update_at,
  };
}

function getCurrentPhase(phaseId) {
  return db.prepare('SELECT * FROM plant_phases WHERE id = ?').get(phaseId);
}

function getOrderedPhases() {
  return db.prepare('SELECT * FROM plant_phases ORDER BY order_index ASC, id ASC').all();
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
  };
}

function getPhaseSnapshot(phaseId) {
  const phase = getCurrentPhase(phaseId);
  if (!phase) return null;
  return serializePhase(phase);
}

function getStateSnapshot() {
  const fieldState = getFieldState();
  const automationState = getAutomationState();
  const sensorHealth = getSensorHealth();
  const currentPhase = fieldState ? getCurrentPhase(fieldState.current_phase_id) : null;

  const nowTs = now();
  const phaseStartedAt = fieldState && fieldState.phase_started_at ? fieldState.phase_started_at : null;
  const firstPlantingDate = fieldState && fieldState.first_planting_date ? fieldState.first_planting_date : null;
  const phaseAgeDays = phaseStartedAt ? Math.max(0, Math.floor((nowTs - phaseStartedAt) / 86400000)) : 0;
  const seasonAgeDays = firstPlantingDate ? Math.max(0, Math.floor((nowTs - firstPlantingDate) / 86400000)) : 0;
  const sensorOfflineThresholdMs = 30 * 60 * 1000;
  const lastUpdateAt = sensorHealth && sensorHealth.last_sensor_update_at ? sensorHealth.last_sensor_update_at : null;
  const sensorOnline = Boolean(lastUpdateAt && (nowTs - lastUpdateAt) <= sensorOfflineThresholdMs);

  return {
    field: {
      first_planting_date: firstPlantingDate,
      current_phase: currentPhase ? serializePhase(currentPhase) : null,
      phase_started_at: phaseStartedAt,
      days_in_phase: phaseAgeDays,
      days_since_planting: seasonAgeDays,
    },
    automation: {
      enabled: Boolean(fieldState && fieldState.automation_enabled),
      last_check_at: automationState ? automationState.last_check_at : null,
      last_water_level: automationState ? automationState.last_water_level : null,
      last_solenoid_state: automationState ? automationState.last_solenoid_state : null,
      last_action: automationState ? automationState.last_action : null,
      min_toggle_interval_ms: automationState ? automationState.min_toggle_interval_ms : 120000,
    },
    sensor_health: {
      online: sensorOnline,
      last_update_ms_ago: lastUpdateAt ? nowTs - lastUpdateAt : null,
      last_update_at: lastUpdateAt,
    },
  };
}

router.get('/state', (req, res) => {
  try {
    return res.json(getStateSnapshot());
  } catch (err) {
    console.error('[automation/state] get failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/field-state', (req, res) => {
  try {
    const fieldState = getFieldState();
    if (!fieldState) {
      return res.status(404).json({ error: 'field_state_not_initialized' });
    }
    return res.json({
      ...fieldState,
      automation_enabled: Boolean(fieldState.automation_enabled),
    });
  } catch (err) {
    console.error('[automation/state] field-state get failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/sensor-health', (req, res) => {
  try {
    const sensorHealth = getSensorHealth();
    if (!sensorHealth) {
      return res.status(404).json({ error: 'sensor_health_not_initialized' });
    }
    return res.json(serializeSensorHealth(sensorHealth));
  } catch (err) {
    console.error('[automation/state] sensor-health get failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/start-season', (req, res) => {
  try {
    if (req.body && req.body.confirm !== true) {
      return res.status(400).json({ error: 'confirmation_required', detail: 'confirm must be true' });
    }

    const ts = now();
    const initialPhase = db.prepare('SELECT * FROM plant_phases WHERE name = ?').get('tanam');
    if (!initialPhase) {
      return res.status(500).json({ error: 'seed_phase_missing' });
    }

    const previousFieldState = getFieldState();
    const previousPhaseId = previousFieldState ? previousFieldState.current_phase_id : null;

    db.prepare(`
      INSERT INTO field_state (id, first_planting_date, current_phase_id, phase_started_at, automation_enabled, updated_at)
      VALUES (1, ?, ?, ?, 0, ?)
      ON CONFLICT(id) DO UPDATE SET
        first_planting_date = excluded.first_planting_date,
        current_phase_id = excluded.current_phase_id,
        phase_started_at = excluded.phase_started_at,
        automation_enabled = excluded.automation_enabled,
        updated_at = excluded.updated_at
    `).run(ts, initialPhase.id, ts, ts);

    db.prepare(`
      INSERT INTO phase_transitions (from_phase_id, to_phase_id, triggered_at, triggered_by, notes)
      VALUES (?, ?, ?, 'manual_user_action', ?)
    `).run(previousPhaseId, initialPhase.id, ts, 'Season started in tanam phase');

    hub.broadcast('phase_changed', {
      previous_phase_id: previousPhaseId,
      new_phase_id: initialPhase.id,
      transitioned_at: ts,
    });

    return res.json({
      success: true,
      field: getStateSnapshot().field,
      message: 'Season started in tanam phase. Automation paused.',
    });
  } catch (err) {
    console.error('[automation/state] start-season failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/next-phase', (req, res) => {
  try {
    if (req.body && req.body.confirm !== true) {
      return res.status(400).json({ error: 'confirmation_required', detail: 'confirm must be true' });
    }

    const fieldState = getFieldState();
    if (!fieldState) {
      return res.status(404).json({ error: 'field_state_not_initialized' });
    }

    const currentPhase = getCurrentPhase(fieldState.current_phase_id);
    if (!currentPhase) {
      return res.status(404).json({ error: 'current_phase_not_found' });
    }

    const phases = getOrderedPhases();
    const currentIndex = phases.findIndex((phase) => phase.id === currentPhase.id);
    if (currentIndex < 0) {
      return res.status(404).json({ error: 'current_phase_not_found' });
    }

    const nextPhase = phases[currentIndex + 1];
    if (!nextPhase) {
      return res.status(409).json({ error: 'already_in_last_phase' });
    }

    const ts = now();
    const automationEnabled = ['vegetatif', 'primordia', 'pengisian'].includes(nextPhase.name);
    db.prepare(`
      UPDATE field_state
      SET current_phase_id = ?, phase_started_at = ?, automation_enabled = ?, updated_at = ?
      WHERE id = 1
    `).run(nextPhase.id, ts, automationEnabled ? 1 : 0, ts);

    db.prepare(`
      INSERT INTO phase_transitions (from_phase_id, to_phase_id, triggered_at, triggered_by, notes)
      VALUES (?, ?, ?, 'manual_user_action', ?)
    `).run(currentPhase.id, nextPhase.id, ts, `Advanced to ${nextPhase.name}`);

    hub.broadcast('phase_changed', {
      previous_phase_id: currentPhase.id,
      new_phase_id: nextPhase.id,
      transitioned_at: ts,
    });

    const updatedAutomationState = getAutomationState();
    hub.broadcast('automation_state_updated', {
      enabled: automationEnabled,
      last_check_at: updatedAutomationState ? updatedAutomationState.last_check_at : null,
      last_water_level: updatedAutomationState ? updatedAutomationState.last_water_level : null,
      last_solenoid_state: updatedAutomationState ? updatedAutomationState.last_solenoid_state : null,
      last_action: updatedAutomationState ? updatedAutomationState.last_action : null,
      min_toggle_interval_ms: updatedAutomationState ? updatedAutomationState.min_toggle_interval_ms : 120000,
    });

    return res.json({
      success: true,
      previous_phase: serializePhase(currentPhase),
      new_phase: serializePhase(nextPhase),
      transitioned_at: ts,
      automation_status: automationEnabled ? 'enabled' : 'disabled',
    });
  } catch (err) {
    console.error('[automation/state] next-phase failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.put('/state', (req, res) => {
  try {
    const body = req.body || {};
    const ts = now();
    const fieldUpdates = [];
    const fieldParams = [];
    const automationUpdates = [];
    const automationParams = [];

    if (Object.prototype.hasOwnProperty.call(body, 'automation_enabled')) {
      if (typeof body.automation_enabled !== 'boolean') {
        return res.status(400).json({ error: 'invalid_automation_enabled' });
      }
      fieldUpdates.push('automation_enabled = ?');
      fieldParams.push(body.automation_enabled ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'min_toggle_interval_ms')) {
      const interval = Number(body.min_toggle_interval_ms);
      if (!Number.isInteger(interval) || interval <= 0) {
        return res.status(400).json({ error: 'invalid_min_toggle_interval_ms' });
      }
      automationUpdates.push('min_toggle_interval_ms = ?');
      automationParams.push(interval);
    }

    if (!fieldUpdates.length && !automationUpdates.length) {
      return res.status(400).json({ error: 'no_changes_provided' });
    }

    const automationState = getAutomationState();
    if (!automationState) {
      return res.status(404).json({ error: 'automation_state_not_initialized' });
    }

    const fieldState = getFieldState();
    if (!fieldState) {
      return res.status(404).json({ error: 'field_state_not_initialized' });
    }

    if (fieldUpdates.length) {
      db.prepare(`
        UPDATE field_state
        SET ${fieldUpdates.join(', ')}, updated_at = ?
        WHERE id = 1
      `).run(...fieldParams, ts);
    }

    if (automationUpdates.length) {
      db.prepare(`
        UPDATE automation_state
        SET ${automationUpdates.join(', ')}, updated_at = ?
        WHERE id = 1
      `).run(...automationParams, ts);
    }

    const updatedFieldState = getFieldState();
    const updatedAutomationState = getAutomationState();
    
    hub.broadcast('automation_state_updated', {
      enabled: Boolean(updatedFieldState && updatedFieldState.automation_enabled),
      last_check_at: updatedAutomationState ? updatedAutomationState.last_check_at : null,
      last_water_level: updatedAutomationState ? updatedAutomationState.last_water_level : null,
      last_solenoid_state: updatedAutomationState ? updatedAutomationState.last_solenoid_state : null,
      last_action: updatedAutomationState ? updatedAutomationState.last_action : null,
      min_toggle_interval_ms: updatedAutomationState ? updatedAutomationState.min_toggle_interval_ms : 120000,
    });

    return res.json({
      automation_enabled: Boolean(updatedFieldState ? updatedFieldState.automation_enabled : fieldState.automation_enabled),
      min_toggle_interval_ms: updatedAutomationState ? updatedAutomationState.min_toggle_interval_ms : 120000,
      updated_at: ts,
    });
  } catch (err) {
    console.error('[automation/state] update failed:', err);
    return res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

module.exports = router;
