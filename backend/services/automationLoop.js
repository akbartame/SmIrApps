const db = require('../db');
const repo = require('../db/repository');
const hub = require('../ws/hub');
const config = require('../config');
const { publishControl } = require('../mqtt/publisher');

let automationTimer = null;

function now() {
  return Date.now();
}

function getFieldState() {
  return db.prepare('SELECT * FROM field_state WHERE id = 1').get();
}

function getAutomationState() {
  return db.prepare('SELECT * FROM automation_state WHERE id = 1').get();
}

function ensureAutomationStateRow() {
  const row = getAutomationState();
  if (row) return row;

  db.prepare(`
    INSERT INTO automation_state (
      id,
      last_check_at,
      last_water_level,
      last_solenoid_state,
      last_action,
      next_allowed_action_at,
      min_toggle_interval_ms,
      updated_at
    ) VALUES (?, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `).run(1, config.automation.rateLimitDefaultMs, now());

  return getAutomationState();
}

function updateAutomationState({ lastCheckAt, lastWaterLevel, lastSolenoidState, lastAction, nextAllowedActionAt }) {
  const ts = now();
  db.prepare(`
    UPDATE automation_state
    SET last_check_at = ?,
        last_water_level = ?,
        last_solenoid_state = ?,
        last_action = ?,
        next_allowed_action_at = ?,
        updated_at = ?
    WHERE id = 1
  `).run(lastCheckAt, lastWaterLevel, lastSolenoidState, lastAction, nextAllowedActionAt, ts);
}

function createAutomationEvent(eventType, severity, message) {
  const ts = now();
  const info = db.prepare(`
    INSERT INTO automation_events (event_type, severity, message, triggered_at, resolved_at)
    VALUES (?, ?, ?, ?, NULL)
  `).run(eventType, severity, message, ts);

  hub.broadcast('automation_event_created', {
    id: info.lastInsertRowid,
    event_type: eventType,
    severity,
    message,
    triggered_at: ts,
  });

  return info.lastInsertRowid;
}

function getLatestSensorReading() {
  const sensorNodeIds = config.automation.sensorNodeIds;
  if (!sensorNodeIds.length) return null;

  const placeholders = sensorNodeIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT * FROM nodesensor_latest
    WHERE source = 'sensor' AND node_id IN (${placeholders})
    ORDER BY received_at DESC
    LIMIT 1
  `);
  return stmt.get(...sensorNodeIds);
}

function getLatestRelayReadings() {
  const relayNodeIds = config.automation.relayNodeIds;
  if (!relayNodeIds.length) return [];

  const placeholders = relayNodeIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT * FROM nodesensor_latest
    WHERE source = 'relay' AND node_id IN (${placeholders})
    ORDER BY node_id ASC, received_at DESC
  `).all(...relayNodeIds);
}

function getLatestRelayReading(nodeId = 1) {
  return db.prepare(`
    SELECT * FROM nodesensor_latest
    WHERE source = 'relay' AND node_id = ?
    ORDER BY received_at DESC
    LIMIT 1
  `).get(nodeId);
}

function getRelayHistory(nodeId = 1, sinceMs = 30000) {
  const cutoff = now() - sinceMs;
  return db.prepare(`
    SELECT * FROM nodesensor_history
    WHERE node_id = ? AND received_at >= ?
    ORDER BY received_at ASC
  `).all(nodeId, cutoff);
}

function getWaterLevelFromPayload(payload) {
  if (!payload) return null;

  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const derived = repo.getWaterLevelFromPayload(parsed);
  if (derived && typeof derived.level_pct === 'number') {
    return Number(derived.level_pct);
  }

  if (typeof parsed.water_level === 'number') {
    return Number(parsed.water_level);
  }

  return null;
}

function getActualSolenoidState(automationState, relayReading) {
  if (relayReading && relayReading.payload) {
    const payload = typeof relayReading.payload === 'string' ? JSON.parse(relayReading.payload) : relayReading.payload;
    if (typeof payload.solenoid_state === 'number') {
      return Number(payload.solenoid_state);
    }
  }

  if (automationState && automationState.last_solenoid_state !== null) {
    return Number(automationState.last_solenoid_state);
  }

  return null;
}

async function runAutomationCycle(mqttClient) {
  const currentTime = now();
  console.log(`[automation] step 1: fetching latest sensor data at ${currentTime}`);
  const latestSensorReading = getLatestSensorReading();
  const latestSensorUpdateAt = latestSensorReading ? latestSensorReading.received_at : null;

  if (!latestSensorReading || latestSensorUpdateAt === null) {
    console.log('[automation] step 1: no sensor reading available; exiting cycle');
    return;
  }

  console.log(`[automation] step 2: checking automation enable flag`);
  const fieldState = getFieldState();
  const automationState = ensureAutomationStateRow();
  if (!fieldState || !Boolean(fieldState.automation_enabled)) {
    console.log('[automation] step 2: automation disabled; exiting cycle');
    updateAutomationState({
      lastCheckAt: currentTime,
      lastWaterLevel: automationState.last_water_level,
      lastSolenoidState: automationState.last_solenoid_state,
      lastAction: 'disabled',
      nextAllowedActionAt: automationState.next_allowed_action_at,
    });
    return;
  }

  console.log('[automation] step 3: reading current phase and water level target');
  const currentPhase = db.prepare('SELECT * FROM plant_phases WHERE id = ?').get(fieldState.current_phase_id);
  const latestWaterLevel = getWaterLevelFromPayload(latestSensorReading.payload);
  if (!currentPhase) {
    console.log('[automation] step 3: current phase not found; exiting cycle');
    updateAutomationState({
      lastCheckAt: currentTime,
      lastWaterLevel: automationState.last_water_level,
      lastSolenoidState: automationState.last_solenoid_state,
      lastAction: 'phase_missing',
      nextAllowedActionAt: automationState.next_allowed_action_at,
    });
    return;
  }

  console.log(`[automation] step 3: phase=${currentPhase.name}, min=${currentPhase.min_water_level_pct}, max=${currentPhase.max_water_level_pct}, waterLevel=${latestWaterLevel}`);

  console.log('[automation] step 4: applying hysteresis logic');
  let targetSolenoid = 0;
  if (latestWaterLevel === null || latestWaterLevel < 0 || latestWaterLevel > 100) {
    console.log('[automation] step 4: sensor data invalid; exiting cycle');
    createAutomationEvent('sensor_data_invalid', 'warn', 'Automation skipped because the latest sensor data was invalid.');
    updateAutomationState({
      lastCheckAt: currentTime,
      lastWaterLevel: automationState.last_water_level,
      lastSolenoidState: automationState.last_solenoid_state,
      lastAction: 'invalid_sensor_data',
      nextAllowedActionAt: automationState.next_allowed_action_at,
    });
    return;
  }

  if (latestWaterLevel < currentPhase.min_water_level_pct) {
    targetSolenoid = 1;
  } else if (latestWaterLevel > currentPhase.max_water_level_pct) {
    targetSolenoid = 0;
  } else {
    targetSolenoid = automationState.last_solenoid_state !== null ? Number(automationState.last_solenoid_state) : 0;
  }

  console.log(`[automation] step 4: targetSolenoid=${targetSolenoid}`);

  console.log('[automation] step 5: checking rate limiting');
  const nextAllowedActionAt = automationState.next_allowed_action_at;
  if (nextAllowedActionAt !== null && nextAllowedActionAt !== undefined && currentTime < nextAllowedActionAt) {
    console.log(`[automation] step 5: rate limit active until ${nextAllowedActionAt}; exiting cycle`);
    updateAutomationState({
      lastCheckAt: currentTime,
      lastWaterLevel: latestWaterLevel,
      lastSolenoidState: automationState.last_solenoid_state,
      lastAction: 'rate_limited',
      nextAllowedActionAt,
    });
    return;
  }

  console.log('[automation] step 6: checking flow before toggling solenoid ON');
  const relayReadings = getLatestRelayReadings();
  const currentSolenoidState = relayReadings.length > 0
    ? relayReadings[0].payload && typeof relayReadings[0].payload === 'string'
      ? Number(JSON.parse(relayReadings[0].payload).solenoid_state ?? automationState.last_solenoid_state ?? 0)
      : Number(relayReadings[0].payload?.solenoid_state ?? automationState.last_solenoid_state ?? 0)
    : Number(automationState.last_solenoid_state ?? 0);

  if (targetSolenoid === 1) {
    const relayReading = relayReadings[0];
    const relayHistory = relayReading ? getRelayHistory(relayReading.node_id, 30000) : [];
    const latestRelayPayload = relayReading && relayReading.payload ? (typeof relayReading.payload === 'string' ? JSON.parse(relayReading.payload) : relayReading.payload) : null;
    const previousRelayPayload = relayHistory.length > 1 ? (typeof relayHistory[relayHistory.length - 2].payload === 'string' ? JSON.parse(relayHistory[relayHistory.length - 2].payload) : relayHistory[relayHistory.length - 2].payload) : null;
    const latestFlowPulses = latestRelayPayload && typeof latestRelayPayload.flow_pulses === 'number' ? latestRelayPayload.flow_pulses : null;
    const previousFlowPulses = previousRelayPayload && typeof previousRelayPayload.flow_pulses === 'number' ? previousRelayPayload.flow_pulses : null;
    const flowPulsesDelta = latestFlowPulses !== null && previousFlowPulses !== null ? latestFlowPulses - previousFlowPulses : null;
    const solenoidWasOnForMoreThan5Seconds = relayReading && relayReading.received_at && currentTime - relayReading.received_at > 5000;

    if (flowPulsesDelta === 0 && solenoidWasOnForMoreThan5Seconds) {
      console.log('[automation] step 6: flow alert detected; exiting cycle');
      createAutomationEvent('flow_alert', 'warn', 'Solenoid opened but no water flow was detected.');
      updateAutomationState({
        lastCheckAt: currentTime,
        lastWaterLevel: latestWaterLevel,
        lastSolenoidState: currentSolenoidState,
        lastAction: 'flow_alert',
        nextAllowedActionAt,
      });
      return;
    }
  }

  console.log('[automation] step 7: checking overflow');
  if (latestWaterLevel >= 100) {
    console.log('[automation] step 7: overflow detected; forcing solenoid OFF');
    targetSolenoid = 0;
    createAutomationEvent('overflow', 'info', 'Water overflow. Pump turned off. It might be rain outside.');
  }

  console.log('[automation] step 8: comparing current and target solenoid state');
  let action = 'no_action';
  const relayNodeIds = config.automation.relayNodeIds;
  for (const relayNodeId of relayNodeIds) {
    const relayReading = getLatestRelayReading(relayNodeId);
    const relayState = relayReading && relayReading.payload
      ? (typeof relayReading.payload === 'string'
          ? Number(JSON.parse(relayReading.payload).solenoid_state ?? automationState.last_solenoid_state ?? 0)
          : Number(relayReading.payload.solenoid_state ?? automationState.last_solenoid_state ?? 0))
      : Number(automationState.last_solenoid_state ?? 0);

    if (targetSolenoid !== relayState) {
      const payload = { mode: 1, target_node_id: relayNodeId, solenoid_state: targetSolenoid };
      const commandId = repo.createCommand(payload);
      try {
        await publishControl(mqttClient, payload);
        action = targetSolenoid === 1 ? 'opened_solenoid' : 'closed_solenoid';
        repo.markCommand(commandId, 'pending');
        console.log(`[automation] step 8: published MQTT command ${JSON.stringify(payload)}`);
      } catch (err) {
        repo.markCommand(commandId, 'send_failed');
        console.error('[automation] step 8: MQTT publish failed:', err.message);
        createAutomationEvent('mqtt_publish_failed', 'warn', `Automation could not publish control command: ${err.message}`);
        updateAutomationState({
          lastCheckAt: currentTime,
          lastWaterLevel: latestWaterLevel,
          lastSolenoidState: currentSolenoidState,
          lastAction: 'publish_failed',
          nextAllowedActionAt,
        });
        return;
      }
    } else {
      console.log(`[automation] step 8: relay ${relayNodeId} already at target state; skipping`);
    }
  }

  const nextAllowedAt = currentTime + (automationState.min_toggle_interval_ms || config.automation.rateLimitDefaultMs);
  updateAutomationState({
    lastCheckAt: currentTime,
    lastWaterLevel: latestWaterLevel,
    lastSolenoidState: targetSolenoid,
    lastAction: action,
    nextAllowedActionAt: nextAllowedAt,
  });

  hub.broadcast('automation_state_updated', {
    enabled: Boolean(fieldState.automation_enabled),
    last_check_at: currentTime,
    last_water_level: latestWaterLevel,
    last_solenoid_state: targetSolenoid,
    last_action: action,
    min_toggle_interval_ms: automationState.min_toggle_interval_ms || config.automation.rateLimitDefaultMs,
  });
}

function startAutomationLoop(mqttClient, options = {}) {
  if (automationTimer) {
    return automationTimer;
  }

  const intervalMs = options.intervalMs || config.automation.checkIntervalMs;
  ensureAutomationStateRow();

  automationTimer = setInterval(() => {
    runAutomationCycle(mqttClient).catch((err) => console.error('[automation] loop failed:', err.message));
  }, intervalMs);

  runAutomationCycle(mqttClient).catch((err) => console.error('[automation] loop failed:', err.message));
  console.log(`[automation] started with ${intervalMs}ms interval`);
  return automationTimer;
}

function stopAutomationLoop() {
  if (automationTimer) {
    clearInterval(automationTimer);
    automationTimer = null;
  }
}

module.exports = {
  runAutomationCycle,
  startAutomationLoop,
  stopAutomationLoop,
};
