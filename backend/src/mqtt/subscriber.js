import { TOPICS, parseTopic } from '../config/index.js';
import { parseSensorPayload } from '../parser/sensorParser.js';
import { insertReading } from '../db/queries.js';
import { ALLOWED_DEVICE_PREFIX } from '../config/index.js';

export function registerSubscriber(client) {
    client.on('connect', () => {
        client.subscribe(TOPICS.subscribeAll, { qos: 1 }, (err) => {
            if (err) console.error('[SUB] Subscription error:', err.message);
            else console.log('[SUB] Subscribed to:', TOPICS.subscribeAll);
        });
    });

    client.on('message', (topic, message) => {
        try {
            handleMessage(topic, message);
        } catch (err) {
            console.error('[SUB] Unhandled error processing message:', err.message);
            console.error('[SUB] Topic:', topic);
            console.error('[SUB] Raw payload:', message.toString());
            // Continue processing — do not crash
        }
    });
}   

function handleMessage(topic, message) {
    const parsed = parseTopic(topic);
    if (!parsed) {
        console.warn('[SUB] Could not parse topic:', topic);
        return;
    }

    const { deviceId, type } = parsed;

    if (ALLOWED_DEVICE_PREFIX && !deviceId.startsWith(ALLOWED_DEVICE_PREFIX)) {
        console.warn('[SUB] Ignoring message from unauthorized device:', deviceId);
        return;
    }

    switch (type) {
        case 'sensorDetail':
            handleSensorDetail(deviceId, message);
            break;
        case 'command':
        case 'wifiConfig':
            // Backend receives commands from devices (echo or ack)
            console.log(`[SUB] Received ${type} acknowledgement from ${deviceId}`);
            break;
        case 'unknown':
            console.warn('[SUB] Unknown topic structure:', topic);
            break;
        default:
            console.error('[SUB] Unhandled message type:', type);
            break;
    }
}

// Handler for sensor detail messages
function handleSensorDetail(deviceId, message) {
    let raw;

    try {
        raw = JSON.parse(message.toString());
    } catch (err) {
        console.error(`[SUB] JSON parse failed for device ${deviceId}:`, err.message);
        console.error('[SUB] Raw message:', message.toString());
        return;
    }

    let record;
    try {
        record = parseSensorPayload(raw, deviceId);
    } catch (err) {
        console.error(`[SUB] Payload parsing failed for device ${deviceId}:`, err.message);
        console.error('[SUB] Raw payload:', JSON.stringify(raw));
        return;
    }

    try {
        insertReading(record);
        const status = record.is_valid ? 'valid' : 'flagged';
        console.log(`[SUB] Inserted ${status} reading from ${deviceId}`);
    } catch (err) {
        console.error(`[SUB] DB insert failed for device ${deviceId}:`, err.message);
        console.error('[SUB] Record:', JSON.stringify(record));
        // Do not rethrow — this is a DB layer problem, not a message problem
    }
}