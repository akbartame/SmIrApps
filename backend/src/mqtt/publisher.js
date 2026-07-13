import { TOPICS } from '../config/index.js';
import { getMqttClient } from './client.js';

/**
 * Publish a message to an MQTT topic with QoS 1
 * @param {string} topic - MQTT topic
 * @param {string|object} payload - Message payload (strings sent as-is, objects JSON-stringified)
 * @param {object} options - Additional MQTT publish options
 * @returns {Promise} Resolves when publish callback fires
 */
export function publish(topic, payload, options = {}) {
    return new Promise((resolve) => {
        const client = getMqttClient();
        
        if (!client.connected) {
            console.warn('[PUB] Client offline, cannot publish:', topic);
            resolve({ ok: false, reason: 'MQTT client is offline' });
            return;
        }

        const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

        client.publish(topic, message, { qos: 1, retain: false, ...options }, (err) => {
            if (err) {
                console.error('[PUB] Error publishing to', topic, ':', err.message);
                resolve({ ok: false, reason: err.message });
            } else {
                console.log('[PUB] Message published to', topic);
                resolve({ ok: true });
            }
        });
    });
}

/**
 * Send a generic command to a device
 * @param {string} deviceId - Device identifier
 * @param {string|object} payload - Command payload
 */
export function sendCommand(deviceId, payload) {
    if (!deviceId) {
        throw new Error('[PUB] deviceId is required for sendCommand');
    }
    if (payload === undefined || payload === null) {
        throw new Error('[PUB] payload is required for sendCommand');
    }

    const topic = TOPICS.command(deviceId);
    return publish(topic, payload);
}

/**
 * Send WiFi config command (open/close portal)
 * @param {string} deviceId - Device identifier
 * @param {string} state - 'open' or 'close'
 */
export function sendWifiConfig(deviceId, state) {
    if (!deviceId) {
        throw new Error('[PUB] deviceId is required for sendWifiConfig');
    }
    
    const valid = ['open', 'close'];
    if (!valid.includes(state)) {
        throw new Error(`[PUB] Invalid state: ${state}. Valid: ${valid.join(', ')}`);
    }
    
    const topic = TOPICS.wifiConfig(deviceId);
    return publish(topic, state);
}
