require('dotenv').config();

const config = {
  mqtt: {
    url: process.env.MQTT_URL || 'mqtt://broker.hivemq.com:1883',
    topics: {
      nodesensor: 'SmIr/nodesensor',
      status: 'SmIr/status',
      control: 'SmIr/control',
    },
    ackTimeoutMs: Number(process.env.MQTT_ACK_TIMEOUT_MS || 3000),
    onlineTimeoutMs: Number(process.env.MQTT_ONLINE_TIMEOUT_MS || 20000),
    // How long the backend waits for a pending/not_confirmed command to be
    // reconciled by a follow-up relay status packet before giving up.
    reconcileStaleMs: Number(process.env.MQTT_RECONCILE_STALE_MS || 15000),
  },
  db: {
    path: process.env.DB_PATH || './data/smir.db',
  },
  api: {
    port: Number(process.env.API_PORT || 3000),
  },
  automation: {
    checkIntervalMs: Number(process.env.AUTOMATION_CHECK_INTERVAL_MS || 5000),
    sensorOfflineThresholdMs: Number(process.env.SENSOR_OFFLINE_THRESHOLD_MS || 1800000),
    flowCheckTimeoutMs: Number(process.env.FLOW_CHECK_TIMEOUT_MS || 5000),
    rateLimitDefaultMs: Number(process.env.RATE_LIMIT_DEFAULT_MS || 120000),
    sensorNodeIds: (process.env.SENSOR_NODE_IDS || '3,4').split(',').map((value) => Number(value.trim())).filter(Boolean),
    relayNodeIds: (process.env.RELAY_NODE_IDS || '1,2').split(',').map((value) => Number(value.trim())).filter(Boolean),
    sensorOfflineCheckIntervalMs: Number(process.env.SENSOR_OFFLINE_CHECK_INTERVAL_MS || 30000),
  },
  archive: {
    outDir: process.env.ARCHIVE_OUT_DIR || './archive',
    // Reserved for future use — the archiver currently only deletes rows for
    // the specific month it just wrote to Parquet, not by a rolling window.
    retentionDays: Number(process.env.ARCHIVE_RETENTION_DAYS || 45),
  },
};

module.exports = config;
