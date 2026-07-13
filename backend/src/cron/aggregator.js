import cron from 'node-cron';
import db from '../db/database.js';
import { getDevices } from '../db/readQueries.js';

// Statement untuk mengambil rata-rata 5 menit terakhir per device
const stmtAvg = db.prepare(`
    SELECT
        AVG(temperature_c) AS avg_temp,
        AVG(humidity) AS avg_hum,
        AVG(gas_ppm) AS avg_gas
    FROM sensor_readings
    WHERE device_id = ?
      AND received_at >= ?
      AND received_at < ?
      AND is_valid = 1
`);

// Statement untuk menyimpan hasil ke tabel agregasi
const stmtInsert = db.prepare(`
    INSERT OR IGNORE INTO sensor_data_5m_agg
    (device_id, bucket_timestamp, avg_temperature_c, avg_humidity, avg_gas_ppm)
    VALUES (?, ?, ?, ?, ?)
`);

export function startAggregatorCron() {
    cron.schedule('*/5 * * * *', () => {
        try {
            const now = new Date();
            const bucketMinutes = Math.floor(now.getMinutes() / 5) * 5;
            const bucketEnd = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                now.getHours(),
                bucketMinutes,
                0,
                0
            );

            const toTs = Math.floor(bucketEnd.getTime() / 1000);
            const fromTs = toTs - 5 * 60;
            const bucketTimestamp = fromTs;

            const devices = getDevices();
            for (const dev of devices) {
                const avgData = stmtAvg.get(dev.device_id, fromTs, toTs);
                if (avgData && avgData.avg_temp !== null) {
                    stmtInsert.run(
                        dev.device_id,
                        bucketTimestamp,
                        avgData.avg_temp,
                        avgData.avg_hum,
                        avgData.avg_gas
                    );
                }
            }
            if (devices.length > 0) {
                console.log(
                `[Cron] Agregasi 5m berhasil untuk bucket: ${new Date(
                    bucketTimestamp * 1000
                    ).toISOString()}`
                );
            }
            else {
                console.log(
                `[Cron] Tidak ada data pada bucket: ${new Date(
                    bucketTimestamp * 1000
                    ).toISOString()}`
                );
            }
        } catch (error) {
            console.error('[Cron Error] Gagal menjalankan agregasi:', error);
        }
    });

    console.log('[Cron] Aggregator 5 menit diaktifkan.');
}
