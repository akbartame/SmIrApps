import fs from 'fs';
import path from 'path';
import parquet from 'parquetjs-lite';
import db from '../db/database.js';
import { getDevices } from '../db/readQueries.js';

const archiveRoot = path.resolve(process.cwd(), 'parquet');

const schema = new parquet.ParquetSchema({
    id: { type: 'INT64' },
    device_id: { type: 'UTF8' },
    received_at: { type: 'INT64' },
    device_uptime_ms: { type: 'INT64', optional: true },
    temperature_c: { type: 'DOUBLE', optional: true },
    humidity: { type: 'DOUBLE', optional: true },
    gas_ppm: { type: 'DOUBLE', optional: true },
    mq2_voltage_v: { type: 'DOUBLE', optional: true },
    mq2_rs_kohm: { type: 'DOUBLE', optional: true },
    mq2_ratio: { type: 'DOUBLE', optional: true },
    is_valid: { type: 'INT32' }
});

function getPreviousMonthRange() {
    const now = new Date();
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const year = previousMonth.getUTCFullYear();
    const month = previousMonth.getUTCMonth() + 1;
    const fromTs = Math.floor(previousMonth.getTime() / 1000);
    const endOfMonth = new Date(Date.UTC(year, previousMonth.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const toTs = Math.floor(endOfMonth.getTime() / 1000);
    return {
        year,
        month,
        fromTs,
        toTs,
        yearLabel: String(year),
        monthLabel: String(month).padStart(2, '0')
    };
}

function makeDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeDelete(deviceId, fromTs, toTs) {
    const deleteStmt = db.prepare(`
        DELETE FROM sensor_readings
        WHERE id IN (
            SELECT id FROM sensor_readings
            WHERE device_id = ?
              AND received_at >= ?
              AND received_at <= ?
            ORDER BY id
            LIMIT 10000
        )
    `);

    let totalDeleted = 0;
    while (true) {
        const info = deleteStmt.run(deviceId, fromTs, toTs);
        if (info.changes === 0) {
            break;
        }
        totalDeleted += info.changes;
        console.log(`[Pruning] ${info.changes} baris dihapus untuk ${deviceId} (subtotal ${totalDeleted})`);
        await sleep(100);
    }

    console.log(`[Pruning] Selesai: ${totalDeleted} baris dihapus untuk ${deviceId}`);
    return totalDeleted;
}

async function archiveDevice(deviceId, fromTs, toTs, outputFile) {
    console.log(`[Archive] Memproses device ${deviceId} mulai ${fromTs} sampai ${toTs}`);

    const reader = db.prepare(`
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
          AND received_at >= ?
          AND received_at <= ?
        ORDER BY received_at ASC
    `);

    const tempFile = `${outputFile}.tmp`;
    const writer = await parquet.ParquetWriter.openFile(schema, tempFile);
    let appended = 0;

    try {
        for (const row of reader.iterate(deviceId, fromTs, toTs)) {
            writer.appendRow({
                id: row.id,
                device_id: row.device_id,
                received_at: row.received_at,
                device_uptime_ms: row.device_uptime_ms,
                temperature_c: row.temperature_c,
                humidity: row.humidity,
                gas_ppm: row.gas_ppm,
                mq2_voltage_v: row.mq2_voltage_v,
                mq2_rs_kohm: row.mq2_rs_kohm,
                mq2_ratio: row.mq2_ratio,
                is_valid: row.is_valid
            });
            appended += 1;
            if (appended % 50000 === 0) {
                console.log(`[Archive] ${appended} baris ditulis untuk ${deviceId}`);
            }
        }
    } finally {
        await writer.close();
    }

    if (appended === 0) {
        fs.rmSync(tempFile, { force: true });
        console.log(`[Archive] Lewati penulisan untuk ${deviceId}: tidak ada baris di bulan target, file lama tetap utuh`);
        return 0;
    }

    fs.rmSync(outputFile, { force: true });
    fs.renameSync(tempFile, outputFile);
    console.log(`[Archive] Selesai menulis ${appended} baris ke ${outputFile}`);
    return appended;
}

async function main() {
    const { yearLabel, monthLabel, fromTs, toTs } = getPreviousMonthRange();
    const targetDir = path.join(archiveRoot, `year=${yearLabel}`, `month=${monthLabel}`);
    makeDir(targetDir);

    console.log(`[Archive] Membuat direktori output: ${targetDir}`);
    console.log(`[Archive] Menargetkan rentang ${yearLabel}-${monthLabel}: ${fromTs} s.d. ${toTs}`);

    const devices = getDevices();
    if (!devices.length) {
        console.log('[Archive] Tidak ada device yang ditemukan. Tidak ada yang diarsipkan.');
        process.exit(0);
    }

    let totalRows = 0;
    let totalPruned = 0;

    for (const device of devices) {
        const deviceId = device.device_id;
        const safeId = String(deviceId).replace(/[\\/]/g, '_');
        const outputFile = path.join(targetDir, `device=${safeId}.parquet`);

        const rowsWritten = await archiveDevice(deviceId, fromTs, toTs, outputFile);
        if (rowsWritten === 0) {
            console.log(`[Archive] Lewati ${deviceId}: tidak ada baris di bulan target`);
            continue;
        }

        totalRows += rowsWritten;
        const rowsDeleted = await safeDelete(deviceId, fromTs, toTs);
        totalPruned += rowsDeleted;
    }

    console.log(`[Archive] Semua device selesai. Total ditulis: ${totalRows}. Total dihapus: ${totalPruned}.`);
    console.log('[Archive] Catatan: jalankan VACUUM secara terpisah untuk benar-benar melepaskan ruang disk.');
}

main().catch((err) => {
    console.error('[Archive] Gagal:', err);
    process.exit(1);
});
