const http = require('http');
const config = require('./config');
const db = require('./db');
const { createClient } = require('./mqtt/client');
const { attachHandlers } = require('./mqtt/handlers');
const { startStaleSweeper } = require('./mqtt/staleSweeper');
const { createApp } = require('./api/server');
const { initHub } = require('./ws/hub');
const { startAutomationLoop } = require('./services/automationLoop');
const { startSensorHealthCheck } = require('./services/sensorHealthCheck');
const { initializeDatabaseState } = require('./db/init');

function initializeRuntime() {
  try {
    initializeDatabaseState(db, Date.now());
    console.log('[startup] database initialized');
  } catch (err) {
    console.error('[startup] database initialization failed:', err.message);
  }
}

function startServices(mqttClient) {
  try {
    attachHandlers(mqttClient);
    startStaleSweeper();
    startAutomationLoop(mqttClient, { intervalMs: config.automation.checkIntervalMs });
    startSensorHealthCheck(mqttClient, { intervalMs: config.automation.sensorOfflineCheckIntervalMs });
    console.log('[startup] services started');
  } catch (err) {
    console.error('[startup] service startup failed:', err.message);
  }
}

function bindShutdown(mqttClient) {
  process.on('SIGINT', () => {
    console.log('\n[main] shutting down...');
    mqttClient.end(false, {}, () => process.exit(0));
  });
}

initializeRuntime();

const mqttClient = createClient();
const app = createApp(mqttClient);
const server = http.createServer(app);

// WS clients connect at ws://<host>:<port>/ws
initHub(server);
startServices(mqttClient);
bindShutdown(mqttClient);

server.listen(config.api.port, () => {
  console.log(`[api] listening on :${config.api.port} (HTTP + WS on /ws)`);
});
