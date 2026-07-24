const express = require('express');
const repo = require('../../db/repository');
const { publishControl } = require('../../mqtt/publisher');
const hub = require('../../ws/hub');

// Factory so the route can close over the shared mqtt client instance.
module.exports = function controlRouter(mqttClient) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { mode, target_node_id, solenoid_state } = req.body || {};

    // Mode 0 (global off) and mode 1 (manual) only. Auto mode (mode 2) was removed from firmware.
    if (![0, 1].includes(mode)) {
      return res.status(400).json({
        error: 'invalid_mode',
        detail: 'mode must be 0 (global OFF) or 1 (manual relay control). Mode 2 (auto) is not supported.',
      });
    }

    // Mode 1 (manual) requires target node and solenoid state
    if (mode === 1) {
      if (![1, 2].includes(target_node_id)) {
        return res.status(400).json({
          error: 'invalid_target_node_id',
          detail: 'target_node_id must be 1 or 2 — those are the only nodes with a solenoid.',
        });
      }
      if (![0, 1].includes(solenoid_state)) {
        return res.status(400).json({ error: 'invalid_solenoid_state', detail: 'solenoid_state must be 0 or 1' });
      }
    }

    // Build payload: mode 0 is bare, mode 1 includes target + state
    const payload = { mode };
    if (mode === 1) {
      payload.target_node_id = target_node_id;
      payload.solenoid_state = solenoid_state;
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

    const note =
      mode === 0
        ? 'Mode 0 (global OFF) requires no per-node ack. Marked as "sent" immediately; no further tracking.'
        : 'Mode 1 command published. Status: pending. Poll GET /commands/:id or listen for command_update WS event. Note: command_not_confirmed does not mean failure — wait for reconciliation against next relay status packet.';

    res.status(202).json({
      command_id: commandId,
      published: payload,
      note,
    });
  });

  return router;
};