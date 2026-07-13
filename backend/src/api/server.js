import express from 'express';
import morgan from 'morgan';
import { sendWifiConfig, sendCommand } from '../mqtt/publisher.js';
import { getMqttClient } from '../mqtt/client.js';
import db from '../db/database.js';
import { getDevices, getLatestReadings, getHistory } from '../db/readQueries.js';
import { exportRawData, exportAggregatedCsv } from './export.js';
import { authMiddleware, rateLimitMiddleware, exportRateLimitMiddleware } from './auth.js';
import { ALLOWED_API_KEYS } from '../config/index.js';

// ── Helpers ───────────────────────────────────────────────

/**
 * Parse a query param as an integer. Returns NaN if missing or non-numeric.
 */
function parseIntParam(value) {
    if (value === undefined || value === null || value === '') return NaN;
    const n = Number(value);
    return Number.isInteger(n) ? n : NaN;
}

/**
 * Shared error handler for async route handlers.
 * Logs the error and sends a 500 JSON response.
 */
function handleRouteError(res, context, err) {
    console.error(`[API] ${context}:`, err.message);
    return res.status(500).json({ error: `Internal error: ${context}` });
}

/**
 * Create an Express-based HTTP control server for device commands
 * and sensor data read access.
 */
export function createHttpServer(port = 3000) {
    const app = express();

    app.use(morgan('combined'));
    app.use(express.json());

    // ── CORS Middleware ───────────────────────────────────
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-API-Key');

        if (req.method === 'OPTIONS') {
            return res.status(204).send();
        }

        next();
    });

    // ── RATE LIMITING (before auth) ───────────────────────
    // Apply to all endpoints
    app.use(rateLimitMiddleware);

    // ── AUTHENTICATION ────────────────────────────────────
    // Skip for health checks; all other endpoints require API key
    if (ALLOWED_API_KEYS.length > 0) {
        app.use(authMiddleware);
        console.log('[API] API key authentication is ENABLED');
    } else {
        console.warn('[API] ⚠️  API key authentication is DISABLED. Set API_KEYS in .env for production.');
    }

    // ── Health (no auth required) ────────────────────────

    app.get('/health', (req, res) => {
        const checks = {};

        try {
            const mqttClient = getMqttClient();
            checks.mqtt = mqttClient.connected ? 'ok' : 'disconnected';
        } catch (err) {
            checks.mqtt = 'error';
        }

        try {
            db.prepare('SELECT 1').get();
            checks.db = 'ok';
        } catch (err) {
            checks.db = 'error';
        }

        const allOk = Object.values(checks).every(v => v === 'ok');

        return res.status(allOk ? 200 : 503).json({
            status: allOk ? 'ok' : 'degraded',
            checks,
            timestamp: Date.now(),
        });
    });

    // ── Read: Devices ─────────────────────────────────────
    //
    // GET /devices
    //
    // Returns all known device IDs derived from sensor_readings,
    // with last_seen timestamp and reading counts.
    //
    // Response 200:
    // [
    //   {
    //     "device_id": "FSIOT_WD1M_001",
    //     "last_seen": 1748123456,
    //     "total_readings": 4320,
    //     "valid_readings": 4301
    //   }
    // ]

    app.get('/devices', (req, res) => {
        try {
            const devices = getDevices();
            return res.status(200).json(devices);
        } catch (err) {
            return handleRouteError(res, 'GET /devices', err);
        }
    });

    // ── Read: Latest sensor readings ──────────────────────
    //
    // GET /sensors/latest
    // GET /sensors/latest?deviceId=FSIOT_WD1M_001
    //
    // Without deviceId: returns the most-recent row for every device.
    // With deviceId:    returns only that device's latest row.
    //
    // Response 200 (array form, no deviceId param):
    // [{ id, device_id, received_at, temperature_c, humidity,
    //    gas_ppm, mq2_voltage_v, mq2_rs_kohm, mq2_ratio, is_valid, ... }]
    //
    // Response 200 (single object, deviceId param provided):
    // { ... same fields ... }
    //
    // Response 404: device not found (deviceId param provided but no data)

    app.get('/sensors/latest', (req, res) => {
        const { deviceId } = req.query;

        try {
            const result = getLatestReadings(deviceId || null);

            if (deviceId && result === null) {
                return res.status(404).json({ error: `No data found for device: ${deviceId}` });
            }

            return res.status(200).json(result);
        } catch (err) {
            return handleRouteError(res, 'GET /sensors/latest', err);
        }
    });

    // ── Read: Historical sensor data ──────────────────────
    //
    // GET /sensors/history?deviceId=X[&from=T&to=T&limit=N&validOnly=true]
    //
    // Query params:
    //   deviceId  (required) — device to query
    //   from      (optional) — Unix seconds, start of range. Default: 24 h ago
    //   to        (optional) — Unix seconds, end of range.   Default: now
    //   limit     (optional) — max rows returned.            Default: 500, max: 5000
    //   validOnly (optional) — "true" filters to is_valid=1 rows only
    //
    // Response 400: missing or invalid params
    // Response 200: array of readings ordered by received_at ASC

    app.get('/sensors/history', (req, res) => {
        const { deviceId, from, to, limit, validOnly } = req.query;

        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId query param is required' });
        }

        const parsedFrom  = parseIntParam(from);
        const parsedTo    = parseIntParam(to);
        const parsedLimit = parseIntParam(limit);

        // Reject clearly invalid numeric params (present but not a valid integer)
        if (from  !== undefined && isNaN(parsedFrom)) {
            return res.status(400).json({ error: 'from must be a Unix timestamp in seconds' });
        }
        if (to !== undefined && isNaN(parsedTo)) {
            return res.status(400).json({ error: 'to must be a Unix timestamp in seconds' });
        }
        if (limit !== undefined && isNaN(parsedLimit)) {
            return res.status(400).json({ error: 'limit must be a positive integer' });
        }
        if (!isNaN(parsedFrom) && !isNaN(parsedTo) && parsedFrom > parsedTo) {
            return res.status(400).json({ error: 'from must be earlier than to' });
        }

        try {
            const rows = getHistory({
                deviceId,
                from:      isNaN(parsedFrom)  ? undefined : parsedFrom,
                to:        isNaN(parsedTo)    ? undefined : parsedTo,
                limit:     isNaN(parsedLimit) ? undefined : parsedLimit,
                validOnly: validOnly === 'true',
            });

            return res.status(200).json(rows);
        } catch (err) {
            return handleRouteError(res, 'GET /sensors/history', err);
        }
    });

    // ── Export: Raw data ZIP ───────────────────────────────
    // POST /api/export/raw
    // Request body: { deviceIds: [...], startTime: <unix seconds>, endTime: <unix seconds> }
    // 
    // Rate limited to 10 exports per hour per IP
    app.post('/api/export/raw', exportRateLimitMiddleware, async (req, res) => {
        try {
            await exportRawData(req, res);
        } catch (err) {
            return handleRouteError(res, 'POST /api/export/raw', err);
        }
    });

    // ── Export: Aggregated monthly CSV ────────────────────
    // GET /api/export/aggregated?deviceId=<>&month=<1-12>&year=<> 
    app.get('/api/export/aggregated', async (req, res) => {
        try {
            await exportAggregatedCsv(req, res);
        } catch (err) {
            return handleRouteError(res, 'GET /api/export/aggregated', err);
        }
    });

    // ── Commands ──────────────────────────────────────────

    app.post('/wifi/open', async (req, res) => {
        const { deviceId } = req.body || {};
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }

        try {
            const result = await sendWifiConfig(deviceId, 'open');
            return res.status(result.ok ? 200 : 500).json(result);
        } catch (err) {
            return handleRouteError(res, '/wifi/open', err);
        }
    });

    app.post('/wifi/close', async (req, res) => {
        const { deviceId } = req.body || {};
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }

        try {
            const result = await sendWifiConfig(deviceId, 'close');
            return res.status(result.ok ? 200 : 500).json(result);
        } catch (err) {
            return handleRouteError(res, '/wifi/close', err);
        }
    });

    app.post('/command', async (req, res) => {
        const { deviceId, payload } = req.body || {};
        if (!deviceId || !payload) {
            return res.status(400).json({ error: 'deviceId and payload are required' });
        }

        try {
            const result = await sendCommand(deviceId, payload);
            return res.status(result.ok ? 200 : 500).json(result);
        } catch (err) {
            return handleRouteError(res, '/command', err);
        }
    });

    // ── 404 fallthrough ───────────────────────────────────

    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    return app;
}