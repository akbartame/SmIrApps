const config = require('../config');
/**
 * Publish a control command to the master.
 *
 * Mode 0 (global OFF):
 *   - No ack flow described in spec.
 *   - No confirmation event expected.
 *   - Backend marks as "sent" immediately.
 *
 * Mode 1 (manual relay):
 *   - Master sends to relay via ESP-NOW.
 *   - Relay ACKs immediately with GPIO state.
 *   - If ACK received within 3000ms: command_confirmed event to SmIr/status.
 *   - If ACK timeout: command_not_confirmed event (does NOT mean failure).
 *   - Backend waits for next relay status packet to reconcile.
 */
function publishControl(client, payload) {
  return new Promise((resolve, reject) => {
    client.publish(
      config.mqtt.topics.control,
      JSON.stringify(payload),
      { qos: 0 },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

module.exports = { publishControl };
