import db from './database.js';

export function initDatabase() {
    // Create sensor_readings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id        TEXT    NOT NULL,
            received_at      INTEGER NOT NULL,
            device_uptime_ms INTEGER,
            temperature_c    REAL,
            humidity         REAL,
            gas_ppm          REAL,
            mq2_voltage_v    REAL,
            mq2_rs_kohm      REAL,
            mq2_ratio        REAL,
            is_valid         INTEGER NOT NULL DEFAULT 0
        );
    `);

    // Create index on device_id and received_at for efficient time-range queries
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_device_time ON sensor_readings(device_id, received_at);
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS sensor_data_5m_agg (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id        TEXT    NOT NULL,
            bucket_timestamp INTEGER NOT NULL,
            avg_temperature_c REAL,
            avg_humidity     REAL,
            avg_gas_ppm      REAL,
            UNIQUE(device_id, bucket_timestamp) 
        );
    `);

    console.log('[DB] Database initialized successfully');
}
