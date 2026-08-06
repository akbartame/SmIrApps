const db = require('../db');
const hub = require('../ws/hub');
const config = require('../config');
const { publishControl } = require('../mqtt/publisher');

let sensorHealthTimer = null;

function now() {
  return Date.now();
}

function getSensorHealth() {
  return db.prepare('SELECT * FROM sensor_health WHERE id = 1').get();
}

function ensureSensorHealthRow() {
  const row = getSensorHealth();
  if (row) return row;

  db.prepare(`
    INSERT INTO sensor_health (
      id,
      sensor_node_ids,
      last_sensor_update_at,
      offline_alert_sent_at,
      updated_at
    ) VALUES (?, ?, NULL, NULL, ?)
  `).run(1, config.automation.sensorNodeIds.join(','), now());

  return getSensorHealth();
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

function updateSensorHealth({ lastSensorUpdateAt, offlineAlertSentAt }) {
  const ts = now();
  db.prepare(`
    UPDATE sensor_health
    SET last_sensor_update_at = ?,
        offline_alert_sent_at = ?,
        updated_at = ?
    WHERE id = 1
  `).run(lastSensorUpdateAt, offlineAlertSentAt, ts);
}

async function runSensorHealthCheck(mqttClient) {
  try {
    const sensorHealth = ensureSensorHealthRow();
    const latestSensorReading = db.prepare(`
      SELECT received_at FROM nodesensor_latest
      WHERE source = 'sensor' AND node_id IN (${config.automation.sensorNodeIds.map(() => '?').join(',')})
      ORDER BY received_at DESC LIMIT 1
    `).get(...config.automation.sensorNodeIds);

    const latestSensorUpdateAt = latestSensorReading ? latestSensorReading.received_at : null;
    const nowTs = now();
    const isFresh = Boolean(latestSensorUpdateAt && (nowTs - latestSensorUpdateAt) <= config.automation.sensorOfflineThresholdMs);

    if (isFresh) {
      if (sensorHealth.offline_alert_sent_at !== null) {
        updateSensorHealth({ lastSensorUpdateAt: latestSensorUpdateAt, offlineAlertSentAt: null });
        createAutomationEvent('sensor_resume', 'info', 'Sensors are back online. Farmer can resume automation.');
        
        // Broadcast sensor health update so frontend's context is live
        hub.broadcast('sensor_health_updated', {
          online: true,
          last_update_ms_ago: 0,
          last_update_at: latestSensorUpdateAt,
        });
        
        hub.broadcast('sensor_online_prompt', {
          message: 'Sensors are back online. Farmer can resume automation.',
          triggered_at: nowTs,
        });
        console.log('[sensor-health] sensor resumed');
      }
      return;
    }

    if (sensorHealth.offline_alert_sent_at === null) {
      db.prepare('UPDATE field_state SET automation_enabled = 0, updated_at = ? WHERE id = 1').run(nowTs);
      updateSensorHealth({ lastSensorUpdateAt: latestSensorUpdateAt, offlineAlertSentAt: nowTs });
      createAutomationEvent('sensor_offline', 'error', 'Sensors offline >30 min. Automation paused. All solenoids OFF.');
      
      // Broadcast sensor health update so frontend's context is live
      const timeSinceLastUpdate = latestSensorUpdateAt ? nowTs - latestSensorUpdateAt : null;
      hub.broadcast('sensor_health_updated', {
        online: false,
        last_update_ms_ago: timeSinceLastUpdate,
        last_update_at: latestSensorUpdateAt,
      });
      
      hub.broadcast('sensor_offline_alert', {
        message: 'Sensors offline >30 min. Automation paused.',
        triggered_at: nowTs,
      });

      try {
        await publishControl(mqttClient, { mode: 0 });
        console.log('[sensor-health] published global OFF after sensor outage');
      } catch (err) {
        console.error('[sensor-health] global OFF publish failed:', err.message);
      }
    }
  } catch (err) {
    console.error('[sensor-health] check failed:', err.message);
  }
}

function startSensorHealthCheck(mqttClient, options = {}) {
  if (sensorHealthTimer) {
    return sensorHealthTimer;
  }

  ensureSensorHealthRow();
  const intervalMs = options.intervalMs || config.automation.sensorOfflineCheckIntervalMs;

  sensorHealthTimer = setInterval(() => {
    runSensorHealthCheck(mqttClient).catch((err) => console.error('[sensor-health] check failed:', err.message));
  }, intervalMs);

  runSensorHealthCheck(mqttClient).catch((err) => console.error('[sensor-health] check failed:', err.message));
  console.log(`[sensor-health] started with ${intervalMs}ms interval`);
  return sensorHealthTimer;
}

function stopSensorHealthCheck() {
  if (sensorHealthTimer) {
    clearInterval(sensorHealthTimer);
    sensorHealthTimer = null;
  }
}

module.exports = {
  startSensorHealthCheck,
  stopSensorHealthCheck,
  runSensorHealthCheck,
};
