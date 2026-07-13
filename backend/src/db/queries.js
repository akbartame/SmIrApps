import db from './database.js';

// Lazy-initialize the prepared statement after table is created
let insertReadingStmt = null;

function getInsertStmt() {
    if (!insertReadingStmt) {
        insertReadingStmt = db.prepare(`
            INSERT INTO sensor_readings (
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
            ) VALUES (
                @device_id,
                @received_at,
                @device_uptime_ms,
                @temperature_c,
                @humidity,
                @gas_ppm,
                @mq2_voltage_v,
                @mq2_rs_kohm,
                @mq2_ratio,
                @is_valid
            )
        `);
    }
    return insertReadingStmt;
}

/**
 * Insert a sensor reading record into the database
 * @param {Object} record - The parsed sensor record with keys matching the schema
 */
export function insertReading(record) {
    const stmt = getInsertStmt();
    const params = {
        device_id: record.device_id,
        received_at: record.received_at,
        device_uptime_ms: record.device_uptime_ms,
        temperature_c: record.temperature_c,
        humidity: record.humidity,
        gas_ppm: record.gas_ppm,
        mq2_voltage_v: record.voltage_v,
        mq2_rs_kohm: record.rs_kohm,
        mq2_ratio: record.ratio_rs_r0,
        is_valid: record.is_valid
    };

    const result = stmt.run(params);
    return result;
}
