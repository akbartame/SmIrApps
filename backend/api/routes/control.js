const express = require('express');
const repo = require('../../db/repository');
const { publishControl } = require('../../mqtt/publisher');
const hub = require('../../ws/hub');

// Factory so the route can close over the shared mqtt client instance.
module.exports = function controlRouter(mqttClient) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { mode, target_node_id, solenoid_state, auto_on_level, auto_off_level } = req.body || {};

    if (![0, 1, 2].includes(mode)) {
      return res.status(400).json({ error: 'invalid_mode', detail: 'mode must be 0, 1, or 2' });
    }

    if (mode === 1 || mode === 2) {
      if (![1, 2].includes(target_node_id)) {
        return res.status(400).json({
          error: 'invalid_target_node_id',
          detail: 'target_node_id must be 1 or 2 — those are the only nodes with a solenoid. 3/4 (LoRa) accept commands without erroring but do nothing physically.',
        });
      }
      if (![0, 1].includes(solenoid_state)) {
        return res.status(400).json({ error: 'invalid_solenoid_state', detail: 'solenoid_state must be 0 or 1' });
      }
    }

    if (mode === 2) {
      if (typeof auto_on_level !== 'number' || typeof auto_off_level !== 'number') {
        return res.status(400).json({
          error: 'missing_auto_levels',
          detail: 'auto_on_level and auto_off_level (numbers) are required for mode 2',
        });
      }
    }

    const payload = { mode };
    if (mode !== 0) {
      payload.target_node_id = target_node_id;
      payload.solenoid_state = solenoid_state;
    }
    if (mode === 2) {
      payload.auto_on_level = auto_on_level;
      payload.auto_off_level = auto_off_level;
    }

    // Recorded before publish so it exists even if the publish callback is slow.
    const commandId = repo.createCommand(payload);

    try {
      await publishControl(mqttClient, payload);
    } catch (err) {
      repo.markCommand(commandId, 'send_failed');
      hub.broadcast('command_update', repo.getCommandById(commandId));
      return res.status(502).json({ error: 'mqtt_publish_failed', detail: err.message, command_id: commandId });
    }

    res.status(202).json({
      command_id: commandId,
      published: payload,
      note:
        mode === 0
          ? 'mode 0 is a global off; the docs describe no per-command ack/confirm flow for it, so this backend does not track confirmation for it.'
          : 'Published, not yet confirmed. Poll GET /commands/:id — a command_not_confirmed event does not mean it failed; wait for reconciliation against the next relay status packet.',
    });
  });

  return router;
};
