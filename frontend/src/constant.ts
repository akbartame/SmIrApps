// API Configuration
// MUST be set at build time via VITE_API_URL environment variable
// Throws error during build if not provided.
const API_BASE_URL = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
  throw new Error(
    'Missing VITE_API_URL environment variable. ' +
    'Set it in .env.local or pass it during build: ' +
    'VITE_API_URL=http://api.example.com npm run build'
  );
}

// Validate that it's a valid URL
try {
  new URL(API_BASE_URL);
} catch {
  throw new Error(
    `Invalid VITE_API_URL: "${API_BASE_URL}". ` +
    'Must be a valid absolute URL (e.g., http://localhost:3000 or https://api.example.com)'
  );
}

export { API_BASE_URL };

// Polling & Device Thresholds
export const POLL_INTERVAL_MS = 2000
export const DEVICE_STALE_THRESHOLD_S = 15   // seconds — data is 15s old
export const DEVICE_OFFLINE_THRESHOLD_S = 60  // seconds — device offline if no data in 60s

// Sensor Reading Thresholds (acceptable ranges)
export const TEMP_MIN_C = 15
export const TEMP_MAX_C = 50
export const HUMIDITY_MIN = 20
export const HUMIDITY_MAX = 90
export const GAS_PPM_WARNING = 100  // above this = warning
export const MQ2_RATIO_THRESHOLD = 1.2  // MQ2 clean air ratio

// Chart Configuration
export const CHART_HEIGHT = 400
export const CHART_MARGIN = { top: 10, right: 20, bottom: 0, left: 0 }

// History Query Defaults
export const DEFAULT_VALID_ONLY = true