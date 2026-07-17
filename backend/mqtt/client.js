const mqtt = require('mqtt');
const config = require('../config');

function createClient() {
  const client = mqtt.connect(config.mqtt.url, {
    reconnectPeriod: 2000,
  });

  client.on('connect', () => {
    console.log(`[mqtt] connected to ${config.mqtt.url}`);
    client.subscribe(
      [config.mqtt.topics.nodesensor, config.mqtt.topics.status],
      (err) => {
        if (err) console.error('[mqtt] subscribe error:', err.message);
        else console.log('[mqtt] subscribed to nodesensor + status');
      }
    );
  });

  client.on('reconnect', () => console.log('[mqtt] reconnecting...'));
  client.on('error', (err) => console.error('[mqtt] error:', err.message));
  client.on('close', () => console.log('[mqtt] connection closed'));

  return client;
}

module.exports = { createClient };
