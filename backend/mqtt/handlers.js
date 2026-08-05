const config = require('../config');
const db = require('../db');
const repo = require('../db/repository');
const hub = require('../ws/hub');
const validator = require('./payloadValidator');

function safeParse(buf) {
  try {
    return JSON.parse(buf.toString());
  } catch (e) {
    console.error('[mqtt] failed to parse payload:', e.message);
    return null;
  }
}

function handleNodesensor(msg) {
  let validation;
  
  // 1. Validasi Payload
  if (msg.source === 'relay') {
    validation = validator.validateRelayStatus(msg);
  } else if (msg.source === 'sensor') {
    validation = validator.validateSensorStatus(msg);
  } else {
    console.warn('[mqtt] unknown source:', msg.source);
    return;
  }

  if (!validation.valid) {
    console.warn('[mqtt] malformed nodesensor payload:', validation.errors.join('; '));
    return;
  }

  // 2. Logika Asli (Menyimpan & Broadcast)
  const received_at = repo.saveNodesensor(msg);
  hub.broadcast('nodesensor', { ...msg, received_at });

  if (msg.source === 'sensor' && config.automation.sensorNodeIds.includes(msg.node_id)) {
    db.prepare(`
      UPDATE sensor_health
      SET last_sensor_update_at = ?, updated_at = ?
      WHERE id = 1
    `).run(received_at, Date.now());
  }
  
  // Only "relay" packets (node 1/2) carry solenoid_state, which is the only
  // thing this backend currently sends commands for.
  if (msg.source === 'relay') {
    reconcileAgainstRelayStatus(msg);
  }
}

function handleStatus(msg) {
  let validation;
  
  // 1. Validasi Payload
  if (msg.device === 'MasterBridge') {
    validation = validator.validateHeartbeat(msg);
  } else if (msg.event === 'command_send_failed') {
    validation = validator.validateCommandSendFailed(msg);
  } else if (msg.event === 'command_not_confirmed') {
    validation = validator.validateCommandNotConfirmed(msg);
  } else {
    console.warn('[mqtt] unknown status shape:', msg);
    return;
  }

  if (!validation.valid) {
    console.warn('[mqtt] malformed status payload:', validation.errors.join('; '));
    return;
  }

  // 2. Logika Asli (Menyimpan & Broadcast berdasarkan tipe event/status)
  if (msg.device === 'MasterBridge') {
    repo.saveHeartbeat(msg);
    hub.broadcast('heartbeat', msg);
    return;
  }

  if (msg.event === 'command_send_failed') {
    repo.saveStatusEvent(msg);
    hub.broadcast('status_event', msg);
    const cmd = repo.getOldestPendingByNode(msg.node_id);
    if (cmd) {
      // Docs: radio-level rejection, command genuinely never left the master.
      repo.markCommand(cmd.id, 'send_failed', { masterSeq: msg.seq });
      hub.broadcast('command_update', repo.getCommandById(cmd.id));
    }
    return;
  }

  if (msg.event === 'command_not_confirmed') {
    repo.saveStatusEvent(msg);
    hub.broadcast('status_event', msg);
    const cmd = repo.getOldestPendingByNode(msg.node_id);
    if (cmd) {
      // Docs are explicit: this is NOT necessarily a failure. Leave it
      // "not_confirmed" and wait for a relay status packet to reconcile
      repo.markCommand(cmd.id, 'not_confirmed', { masterSeq: msg.seq });
      hub.broadcast('command_update', repo.getCommandById(cmd.id));
    }
    return;
  }
}

// A relay's periodic (or ack-carrying) status packet reports actual GPIO
// state. If it matches what an outstanding command asked for, the command is
// confirmed — this is how a lost ack gets reconciled per the docs.
function reconcileAgainstRelayStatus(msg) {
  const cmd = repo.getOldestPendingByNode(msg.node_id);
  if (!cmd) return;
  if (cmd.solenoid_state === null || cmd.solenoid_state === undefined) return;
  if (msg.solenoid_state === cmd.solenoid_state) {
    repo.markCommand(cmd.id, 'confirmed', { confirmedAt: Date.now() });
    hub.broadcast('command_update', repo.getCommandById(cmd.id));
  }
}

function attachHandlers(client) {
  client.on('message', (topic, payload) => {
    const msg = safeParse(payload);
    if (!msg) return;

    if (topic === config.mqtt.topics.nodesensor) handleNodesensor(msg);
    else if (topic === config.mqtt.topics.status) handleStatus(msg);
  });
}

module.exports = { attachHandlers };