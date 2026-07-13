import db from './database.js';

// ── Constants ─────────────────────────────────────────────
const MAX_HISTORY_LIMIT = 5000;
const DEFAULT_HISTORY_LIMIT = 500;

// ── Prepared statements (lazy) ────────────────────────────
let stmtLatestAll = null;
let stmtLatestOne = null;
let stmtHistory = null;
let stmtDevices = null;
let stmtDeviceLastSeen = null;

// ── /devices ──────────────────────────────────────────────

/**
 * Returns one row per known device_id with last_seen timestamp
 * and total reading count.
 */
export function getDevices() {
    if (!stmtDevices) {
        stmtDevices = db.prepare(`
            SELECT
                device_id,
                MAX(received_at)  AS last_seen,
                COUNT(*)          AS total_readings,
                SUM(is_valid)     AS valid_readings
            FROM sensor_readings
            GROUP BY device_id
            ORDER BY last_seen DESC
        `);
    }
    return stmtDevices.all();
}

// ── /sensors/latest ───────────────────────────────────────

/**
 * Returns the single most-recent row for every device.
 * If deviceId is provided, returns only that device's row (or null).
 */
export function getLatestReadings(deviceId = null) {
    if (deviceId) {
        if (!stmtLatestOne) {
            stmtLatestOne = db.prepare(`
                SELECT
                    id,
                    device_id,
                    received_at,
                    device_uptime_ms,
                    temperature_c,
                    humidity,
                    gas_ppm,
                    mq2_voltage_v,
                    mq2_rs_kohm,
                    mq2_ratio,
                    is_valid
                FROM sensor_readings
                WHERE device_id = ?
                ORDER BY received_at DESC
                LIMIT 1
            `);
        }
        return stmtLatestOne.get(deviceId) ?? null;
    }

    // All devices — one row per device_id
    if (!stmtLatestAll) {
        stmtLatestAll = db.prepare(`
            SELECT
                s.id,
                s.device_id,
                s.received_at,
                s.device_uptime_ms,
                s.temperature_c,
                s.humidity,
                s.gas_ppm,
                s.mq2_voltage_v,
                s.mq2_rs_kohm,
                s.mq2_ratio,
                s.is_valid
            FROM sensor_readings s
            INNER JOIN (
                SELECT device_id, MAX(received_at) AS max_ts
                FROM sensor_readings
                GROUP BY device_id
            ) latest ON s.device_id = latest.device_id
                     AND s.received_at = latest.max_ts
            ORDER BY s.device_id
        `);
    }
    return stmtLatestAll.all();
}

// ── /sensors/history ──────────────────────────────────────

/**
 * Returns time-range readings for a single device.
 *
 * @param {string}  deviceId   - Required.
 * @param {number}  from       - Unix seconds, inclusive. Defaults to 24 h ago.
 * @param {number}  to         - Unix seconds, inclusive. Defaults to now.
 * @param {number}  limit      - Row cap. Clamped to MAX_HISTORY_LIMIT.
 * @param {boolean} validOnly  - If true, only is_valid = 1 rows returned.
 */
export function getHistory({ deviceId, from, to, limit, validOnly }) {
    const now = Math.floor(Date.now() / 1000);
    const resolvedFrom  = Number.isFinite(from)  ? from  : now - 24 * 60 * 60;
    const resolvedTo    = Number.isFinite(to)    ? to    : now;
    const resolvedLimit = Math.min(
        Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_HISTORY_LIMIT,
        MAX_HISTORY_LIMIT
    );

    // Build the query dynamically only on the validOnly flag variation.
    // Two variants to avoid a runtime branch inside the hot path.
    const validFilter = validOnly ? 'AND is_valid = 1' : '';

    // We can't cache these as a single prepared statement because the
    // validOnly filter changes the SQL text. Use a small local cache keyed
    // on the filter string.
    if (!stmtHistory) stmtHistory = {};
    const key = validFilter || 'all';

    if (!stmtHistory[key]) {
        stmtHistory[key] = db.prepare(`
            SELECT
                id,
                device_id,
                received_at,
                device_uptime_ms,
                temperature_c,
                humidity,
                gas_ppm,
                mq2_voltage_v,
                mq2_rs_kohm,
                mq2_ratio,
                is_valid
            FROM sensor_readings
            WHERE device_id  = @deviceId
              AND received_at >= @from
              AND received_at <= @to
              ${validFilter}
            ORDER BY received_at ASC
            LIMIT @limit
        `);
    }

    return stmtHistory[key].all({
        deviceId,
        from:  resolvedFrom,
        to:    resolvedTo,
        limit: resolvedLimit,
    });
}