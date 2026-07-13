import { VALIDATION } from '../config/index.js';

// Parses the sensor detail payload from the device.
// Accepts a JSON string and returns an object with the expected structure.
// Expected input format (as JSON string):
// {
//     "device":"FSIOT_WD1M_001",
//     "timestamp_ms":158744,
//     "dht11":{
//         "type":"DHT11",
//         "pin":2,
//         "temperature_c":31.3,
//         "humidity":79
//     },
//     "mq2":{
//         "type":"MQ-2",
//         "pin":17,
//         "voltage_v":1.81129,
//         "rl_kohm":5,
//         "r0_kohm":1.241815,
//         "rs_kohm":4.109529,
//         "ratio_rs_r0":3.309293,
//         "gas_ppm":40.20218
//     }
// }

export function parseSensorPayload(raw, deviceId) {
    const receivedAt = Math.floor(Date.now() / 1000);

    const dht11 = extractDht11(raw.dht11 || {});
    const mq2 = extractMq2(raw.mq2 || {});

    const isValid = dht11.valid && mq2.valid;

    return {
        device_id : deviceId,
        received_at : receivedAt,
        device_uptime_ms : raw.timestamp_ms ?? null,

        // DHT11
        temperature_c :     dht11.temperature_c,
        humidity :          dht11.humidity,

        // MQ-2
        gas_ppm :           mq2.gas_ppm,
        voltage_v :         mq2.voltage_v,
        rs_kohm :           mq2.rs_kohm,
        ratio_rs_r0 :       mq2.ratio_rs_r0,
        r0_kohm :           mq2.r0_kohm,

        // Validity flag - 1 clean, 0 flagged
        is_valid :          isValid ? 1 : 0,
        
        // Per-sensor validity flags (1 for valid, 0 for invalid)
        dht11_valid :       dht11.valid ? 1 : 0,
        mq2_valid :         mq2.valid ? 1 : 0
    };
}

function extractDht11(dht11) {
    const temperature_c = parseFloat(dht11.temperature_c);
    const humidity = parseFloat(dht11.humidity);

    const tempValid = isFinite(temperature_c) && temperature_c !== VALIDATION.dht11InvalidValue;
    const humidityValid = isFinite(humidity) && humidity !== VALIDATION.dht11InvalidValue;

    return {
        temperature_c: tempValid ? temperature_c : null,
        humidity: humidityValid ? humidity : null,
        valid: tempValid && humidityValid,
    };
}

function extractMq2(mq2) {
    const gas_ppm = parseFloat(mq2.gas_ppm);
    const voltage_v = parseFloat(mq2.voltage_v);
    const rs_kohm = parseFloat(mq2.rs_kohm);
    const ratio_rs_r0 = parseFloat(mq2.ratio_rs_r0);
    const r0_kohm = parseFloat(mq2.r0_kohm);

    const r0Valid = isFinite(r0_kohm) && !VALIDATION.r0InvalidValues.includes(r0_kohm);
    const ppmValid = isFinite(gas_ppm) && gas_ppm >= VALIDATION.gasPpmMinValid;

    return {
        gas_ppm: ppmValid ? gas_ppm : null,
        voltage_v: isFinite(voltage_v) ? voltage_v : null,
        rs_kohm: isFinite(rs_kohm) ? rs_kohm : null,
        ratio_rs_r0: isFinite(ratio_rs_r0) ? ratio_rs_r0 : null,
        valid: r0Valid && ppmValid,
    };
}