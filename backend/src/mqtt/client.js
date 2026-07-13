import mqtt from 'mqtt';
import { BROKER } from '../config/index.js';

let client = null;

export function createMqttClient() {
    if (client) return client; // Return existing client if already created

    client = mqtt.connect({
        host: BROKER.host,
        port: BROKER.port,
        username: BROKER.username,
        password: BROKER.password,
        clientId: BROKER.clientId,

        // Additional options keep the connection alive and handle reconnections
        keepalive: 60, // Send a ping every 60 seconds to keep the connection alive
        reconnectPeriod: 5000, // Reconnect after 5 seconds if disconnected
        connectTimeout: 30 * 1000, // Timeout for initial connection attempt

        clean: false,
    });

    client.on('connect', onConnect);
    client.on('error', onError);
    client.on('reconnect', onReconnect);
    client.on('close', onClose);
    client.on('offline', onOffline);
    
    return client;
}

export function getMqttClient() {
    if (!client) {
        throw new Error('MQTT client has not been created yet. Call createMqttClient() first.');
    }
    return client;
}

// MQTT event handlers
function onConnect() {
    console.log('[MQTT] Connected - Broker:', BROKER.host, 'Port:', BROKER.port, 'Client ID:', BROKER.clientId);
}
function onError(err) {
    console.error('[MQTT] Connection error:', err.message);
}
function onReconnect() {
    console.log('[MQTT] Reconnecting to broker:', BROKER.host, 'Port:', BROKER.port);
}
function onClose() {
    console.log('[MQTT] Connection closed');
}
function onOffline() {
    console.log('[MQTT] Client is offline');
}