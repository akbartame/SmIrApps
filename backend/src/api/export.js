import { ZipArchive } from 'archiver';
import { format } from 'fast-csv';
import db from '../db/database.js';

const ROW_YIELD_INTERVAL = 500;
const MAX_DEVICES_PER_EXPORT = 100;  // Prevent resource exhaustion
const MAX_EXPORT_ROWS = 100_000;     // Prevent unbounded exports

function yieldToEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
}

function sanitizeFileName(value) {
    return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

function validateTimestamp(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function validateDeviceId(deviceId) {
    if (typeof deviceId !== 'string') return null;
    // Allow alphanumeric, underscore, hyphen only. Max 50 chars.
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(deviceId)) return null;
    return deviceId;
}

export async function exportRawData(req, res) {
    const { deviceIds, startTime, endTime } = req.body || {};

    // Validate deviceIds array
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({ error: 'deviceIds must be a non-empty array' });
    }

    if (deviceIds.length > MAX_DEVICES_PER_EXPORT) {
        return res.status(400).json({ 
            error: `Maximum ${MAX_DEVICES_PER_EXPORT} devices per export. Got ${deviceIds.length}` 
        });
    }

    // Validate and sanitize each device ID
    const validatedDeviceIds = deviceIds.map(validateDeviceId);
    if (validatedDeviceIds.some(id => id === null)) {
        return res.status(400).json({ 
            error: 'Invalid device ID format. Must be alphanumeric with underscore/hyphen ( "_" / "-" ), max 50 chars.' 
        });
    }

    // Validate timestamps
    const from = validateTimestamp(startTime);
    const to = validateTimestamp(endTime);

    if (from === null || to === null || from > to) {
        return res.status(400).json({ error: 'startTime and endTime must be valid Unix timestamps and startTime <= endTime' });
    }

    const stmt = db.prepare(`
        SELECT received_at, temperature_c, humidity, gas_ppm, mq2_voltage_v, mq2_rs_kohm, mq2_ratio, is_valid
        FROM sensor_readings
        WHERE device_id = ? AND received_at >= ? AND received_at <= ?
        ORDER BY received_at ASC
        LIMIT ?
    `);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="sensor_export.zip"');

    const archive = new ZipArchive({ zlib: { level: 5 } });
    archive.on('error', (error) => {
        console.error('[Export Raw] Archiver error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Export failed' });
        } else {
            res.destroy(error);
        }
    });
    archive.pipe(res);

    try {
        let totalRows = 0;

        for (const deviceId of validatedDeviceIds) {
            const safeName = sanitizeFileName(deviceId);
            const csvStream = format({ headers: true });
            archive.append(csvStream, { name: `${safeName}_raw.csv` });

            let rowCount = 0;
            for (const row of stmt.iterate(deviceId, from, to, MAX_EXPORT_ROWS)) {
                csvStream.write(row);
                rowCount += 1;
                totalRows += 1;

                if (rowCount % ROW_YIELD_INTERVAL === 0) {
                    await yieldToEventLoop();
                }
            }
            csvStream.end();

            console.log(`[Export Raw] Device ${deviceId}: ${rowCount} rows exported`);
        }

        console.log(`[Export Raw] Total rows exported: ${totalRows}`);

        await new Promise((resolve, reject) => {
            archive.on('close', resolve);
            archive.on('warning', (warning) => {
                if (warning.code && warning.code !== 'ENOENT') {
                    reject(warning);
                }
            });
            archive.on('error', reject);
            archive.finalize();
        });
    } catch (error) {
        console.error('[Export Raw] Error during export:', error);

        if (!res.headersSent) {
            res.status(500).json({ error: 'Export failed' });
        } else {
            res.destroy(error);
        }
    }
}

export async function exportAggregatedCsv(req, res) {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    const deviceId = req.query.deviceId;

    // Validate device ID
    const validatedDeviceId = validateDeviceId(deviceId);
    if (!validatedDeviceId) {
        return res.status(400).json({ error: 'Invalid deviceId format' });
    }

    if (Number.isNaN(month) || Number.isNaN(year)) {
        return res.status(400).json({ error: 'month and year query parameters are required' });
    }

    if (month < 1 || month > 12 || year < 1970) {
        return res.status(400).json({ error: 'month must be 1-12 and year must be a valid positive integer' });
    }

    const startTimestamp = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
    const endTimestamp = Math.floor(Date.UTC(year, month, 1) / 1000);

    const stmt = db.prepare(`
        SELECT bucket_timestamp AS received_at,
               avg_temperature_c,
               avg_humidity,
               avg_gas_ppm
        FROM sensor_data_5m_agg
        WHERE device_id = ?
          AND bucket_timestamp >= ?
          AND bucket_timestamp < ?
        ORDER BY bucket_timestamp ASC
    `);

    const safeName = sanitizeFileName(validatedDeviceId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_aggregated_${year}-${String(month).padStart(2, '0')}.csv"`);

    const csvStream = format({ headers: true });
    csvStream.on('error', (error) => {
        console.error('[Export Aggregated] CSV stream error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Export failed' });
        } else {
            res.destroy(error);
        }
    });
    csvStream.pipe(res);

    try {
        let rowCount = 0;
        for (const row of stmt.iterate(validatedDeviceId, startTimestamp, endTimestamp)) {
            csvStream.write(row);
            rowCount += 1;

            if (rowCount % ROW_YIELD_INTERVAL === 0) {
                await yieldToEventLoop();
            }
        }
        csvStream.end();
    } catch (error) {
        console.error('[Export Aggregated] Error during export:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Export failed' });
        } else {
            res.destroy(error);
        }
    }
}