/**
 * Diagnostics endpoints for debugging MQTT integration and state machine.
 * Useful for troubleshooting field validation, command lifecycle, and data loss.
 */

const express = require('express');
const repo = require('../../db/repository');
const config = require('../../config');

module.exports = function diagnosticsRouter(stats) {
  // stats: { mqttConnected, lastMessageAt, commandsPending, etc. }
  const router = express.Router();

  /**
   * GET /diagnostics/health
   * Quick system health check.
   */
  router.get('/health', (req, res) => {
    res.json({
      backend_online: true,
      mqtt_connected: stats.mqttConnected,
      last_mqtt_message: stats.lastMessageAt,
      uptime_ms: process.uptime() * 1000,
      broker: config.mqtt.broker,
    });
  });

  /**
   * GET /diagnostics/state
   * Current state machine status (command tracking, node status, etc.)
   */
  router.get('/state', (req, res) => {
    const commands = {
      pending: repo.countCommandsByStatus('pending'),
      confirmed: repo.countCommandsByStatus('confirmed'),
      send_failed: repo.countCommandsByStatus('send_failed'),
      not_confirmed: repo.countCommandsByStatus('not_confirmed'),
      stale: repo.countCommandsByStatus('stale'),
    };

    const recentCommands = repo.getCommandsRecent(10); // Last 10 commands
    const latestHeartbeat = repo.getLatestHeartbeat();
    const latestNodeStatus = repo.getLatestNodesensor(); // Node 1–4

    res.json({
      broker: config.mqtt.broker,
      mqtt_connected: stats.mqttConnected,
      mode: latestHeartbeat?.mode,
      nodes_online: latestHeartbeat?.nodes,
      commands,
      recent_commands: recentCommands,
      latest_node_readings: latestNodeStatus,
    });
  });

  /**
   * GET /diagnostics/commands/:id
   * Detailed status of a single command with full history.
   */
  router.get('/commands/:id', (req, res) => {
    const cmd = repo.getCommandById(parseInt(req.params.id, 10));
    if (!cmd) {
      return res.status(404).json({ error: 'command_not_found' });
    }

    res.json({
      id: cmd.id,
      mode: cmd.mode,
      target_node_id: cmd.target_node_id,
      solenoid_state: cmd.solenoid_state,
      status: cmd.status,
      status_transitions: repo.getCommandStatusHistory(cmd.id),
      requested_at: new Date(cmd.requested_at).toISOString(),
      updated_at: new Date(cmd.updated_at).toISOString(),
      confirmed_at: cmd.confirmed_at ? new Date(cmd.confirmed_at).toISOString() : null,
      master_seq: cmd.master_seq,
      note:
        cmd.status === 'not_confirmed'
          ? 'Ack timeout. Waiting for relay status packet to reconcile.'
          : cmd.status === 'stale'
            ? 'No relay status matched this command within reconciliation window.'
            : '',
    });
  });

  /**
   * GET /diagnostics/nodes/:id/latest
   * Latest reading for a single node (relay or sensor).
   */
  router.get('/nodes/:id/latest', (req, res) => {
    const nodeId = parseInt(req.params.id, 10);
    const latest = repo.getLatestNodesensorByNode(nodeId);
    if (!latest) {
      return res.status(404).json({ error: 'no_readings_yet' });
    }

    // Objek 'latest' sudah di-parse dan diratakan oleh parseRow() di repositori.
    // Tidak perlu memanggil JSON.parse(latest.payload) lagi.
    res.json({
      node_id: nodeId,
      source: latest.source,
      received_at: new Date(latest.received_at).toISOString(),
      payload: latest,
      validation_notes:
        latest.source === 'relay'
          ? `solenoid_state=${latest.solenoid_state} is ground truth at measurement time`
          : latest.source === 'sensor'
            ? `water_level=${latest.water_level}%, raw_distance=${latest.water_distance_mm}mm, sensor_ok=0x${latest.sensor_ok.toString(16)}`
            : '',
    });
  });

  /**
   * GET /diagnostics/replay
   * Replay the last N MQTT messages to trace state changes.
   * Useful for debugging payload timing and order-dependency bugs.
   */
  router.get('/replay', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || 100, 10), 1000);
    const events = repo.getStatusHistoryRecent(limit);

    res.json({
      note: 'Events in reverse chronological order (newest first). Replay from bottom up to trace state changes.',
      events: events.map((evt) => ({
        timestamp: new Date(evt.received_at).toISOString(),
        kind: evt.kind,
        payload: JSON.parse(evt.payload),
      })),
    });
  });

  /**
   * POST /diagnostics/test-command
   * Publish a test command to verify end-to-end control flow.
   * ONLY for testing in lab — do not use in production.
   */
  router.post('/test-command', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'test_endpoints_disabled_in_production' });
    }

    const { mode, target_node_id, solenoid_state } = req.body || {};
    if (!mode) {
      return res.status(400).json({ error: 'mode required' });
    }

    // Reuse control endpoint logic
    try {
      const { publishControl } = require('../../mqtt/publisher');
      const payload = { mode, target_node_id, solenoid_state };

      const commandId = repo.createCommand(payload);
      await publishControl(require('../../mqtt/client'), payload);

      res.status(202).json({
        command_id: commandId,
        published: payload,
        note: 'Test command published. Monitor /diagnostics/state to see status change.',
      });
    } catch (err) {
      res.status(502).json({ error: 'publish_failed', detail: err.message });
    }
  });

  return router;
};