const config = require('../config');
const repo = require('../db/repository');
const hub = require('../ws/hub');

function startStaleSweeper(intervalMs = 5000) {
  return setInterval(() => {
    const cutoff = Date.now() - config.mqtt.reconcileStaleMs;
    const stale = repo.getStalePending(cutoff);
    for (const cmd of stale) {
      repo.markCommand(cmd.id, 'stale');
      hub.broadcast('command_update', repo.getCommandById(cmd.id));
      console.log(`[mqtt] command ${cmd.id} (node ${cmd.node_id}) marked stale — no reconciling status within ${config.mqtt.reconcileStaleMs}ms`);
    }
  }, intervalMs);
}

module.exports = { startStaleSweeper };
