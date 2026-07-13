// src/config/index.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');

if (!fs.existsSync(envPath)) {
  throw new Error(
    `Missing .env file at ${envPath}. Copy .env.example to .env and configure it before running.`
  );
}

const result = dotenv.config({ path: envPath });
if (result.error) {
  throw result.error;
}

// ── Broker ────────────────────────────────────────────────
export const BROKER = {
  host:     process.env.MQTT_HOST      || '192.168.1.12',
  port:     parseInt(process.env.MQTT_PORT) || 1883,
  username: process.env.MQTT_USERNAME  || 'akbartame',
  password: process.env.MQTT_PASSWORD  || '1234',
  clientId: process.env.MQTT_CLIENT_ID || `fsiot-backend-${Date.now()}`,
};

// ── Topic pattern ─────────────────────────────────────────
// Subscribe to everything under fsiot/# and let the
// subscriber route messages by topic structure at runtime.
// No device registry needed.
export const TOPICS = {
  subscribeAll:    'fsiot/#',
  sensorDetail:    (deviceId) => `fsiot/${deviceId}/sensors/detail`,
  command:         (deviceId) => `fsiot/${deviceId}/command`,
  wifiConfig:      (deviceId) => `fsiot/${deviceId}/device/wifi-config`,
};

// ── Topic parser ──────────────────────────────────────────
// Breaks an incoming topic string into its parts.
// Returns null if the topic doesn't match expected structure.
//
// fsiot/{deviceId}/sensors/detail  → { deviceId, type: 'sensorDetail' }
// fsiot/{deviceId}/command         → { deviceId, type: 'command' }
// fsiot/{deviceId}/device/wifi-config → { deviceId, type: 'wifiConfig' }
export function parseTopic(topic) {
  const parts = topic.split('/');
  if (parts[0] !== 'fsiot' || parts.length < 3) return null;

  const deviceId = parts[1];

  if (parts[2] === 'sensors' && parts[3] === 'detail')
    return { deviceId, type: 'sensorDetail' };

  if (parts[2] === 'command')
    return { deviceId, type: 'command' };

  if (parts[2] === 'device' && parts[3] === 'wifi-config')
    return { deviceId, type: 'wifiConfig' };

  return { deviceId, type: 'unknown' };
}

// -- Allowed Device IDs ──────────────────────────────────────────────
// For simplicity, we allow any device ID that starts with this prefix.
export const ALLOWED_DEVICE_PREFIX = process.env.ALLOWED_DEVICE_PREFIX;


// ── Database ──────────────────────────────────────────────
export const DB = {
  path: process.env.DB_PATH || './data/fsiot.db',
};

// ── API Server ────────────────────────────────────────────
export const SERVER = {
  port: parseInt(process.env.API_PORT) || 3000,
  bindAddr: process.env.API_BIND_ADDR || '0.0.0.0',
};

// ── API Key Authentication ────────────────────────────────
// API_KEYS should be comma-separated list of valid keys
// Example: .env line — API_KEYS=key1,key2,key3
// Leave empty to disable authentication (NOT recommended for production)
export const ALLOWED_API_KEYS = (() => {
  const keysEnv = process.env.API_KEYS || '';
  return keysEnv
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);
})();

const enableApiAuth = ALLOWED_API_KEYS.length > 0;

if (!enableApiAuth && process.env.NODE_ENV === 'production') {
  console.warn('[CONFIG] ⚠️  WARNING: API_KEYS not set. All endpoints are publicly accessible.');
}

// ── Rate Limiting ─────────────────────────────────────────
// General rate limit: 100 requests per 60 seconds per IP
// Export rate limit: 10 requests per hour per IP
export const RATE_LIMIT_CONFIG = {
  // General endpoint rate limit
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,        // 60 seconds
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,      // 100 requests

  // Export-specific stricter limit
  exportWindowMs: parseInt(process.env.EXPORT_RATE_LIMIT_WINDOW_MS) || 3_600_000,  // 1 hour
  exportMaxRequests: parseInt(process.env.EXPORT_RATE_LIMIT_MAX_REQUESTS) || 10,   // 10 exports
};

// ── Validation thresholds ─────────────────────────────────
export const VALIDATION = {
  dht11InvalidValue: -999.0,
  gasPpmMinValid:    0,
  r0InvalidValues:   [Infinity, 0],
};