const http = require('http');
const config = require('./config');
require('./db'); // opens sqlite connection, applies schema.sql on boot

const { createClient } = require('./mqtt/client');
const { attachHandlers } = require('./mqtt/handlers');
const { startStaleSweeper } = require('./mqtt/staleSweeper');
const { createApp } = require('./api/server');
const { initHub } = require('./ws/hub');

const mqttClient = createClient();
attachHandlers(mqttClient);
startStaleSweeper();

const app = createApp(mqttClient);
const server = http.createServer(app);

// WS clients connect at ws://<host>:<port>/ws
initHub(server);

server.listen(config.api.port, () => {
  console.log(`[api] listening on :${config.api.port} (HTTP + WS on /ws)`);
});

process.on('SIGINT', () => {
  console.log('\n[main] shutting down...');
  mqttClient.end(false, {}, () => process.exit(0));
});
