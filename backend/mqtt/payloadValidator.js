/**
 * Payload validation per MQTT_REFERENCE.md.
 * Validates field types, ranges, and required fields for each message shape.
 */

/**
 * Validate relay status packet (source: "relay", nodes 1–2)
 */
function validateRelayStatus(msg) {
  const errors = [];

  // Required fields
  if (typeof msg.node_id !== 'number' || ![1, 2].includes(msg.node_id)) {
    errors.push(`node_id must be 1 or 2, got ${msg.node_id}`);
  }
  if (msg.source !== 'relay') {
    errors.push(`source must be "relay", got ${msg.source}`);
  }
  if (typeof msg.solenoid_state !== 'number' || ![0, 1].includes(msg.solenoid_state)) {
    errors.push(`solenoid_state must be 0 or 1, got ${msg.solenoid_state}`);
  }
  if (typeof msg.flow_pulses !== 'number' || msg.flow_pulses < 0 || msg.flow_pulses > 0xffffffff) {
    errors.push(`flow_pulses out of range (uint32), got ${msg.flow_pulses}`);
  }
  if (typeof msg.distance_mm !== 'number' || msg.distance_mm < 0 || msg.distance_mm > 65535) {
    errors.push(`distance_mm out of range (uint16), got ${msg.distance_mm}`);
  }
  if (typeof msg.temperature_c_x100 !== 'number' || msg.temperature_c_x100 < -32768 || msg.temperature_c_x100 > 32767) {
    errors.push(`temperature_c_x100 out of range (int16), got ${msg.temperature_c_x100}`);
  }
  if (typeof msg.soil_moisture_raw !== 'number' || msg.soil_moisture_raw < 0 || msg.soil_moisture_raw > 4095) {
    errors.push(`soil_moisture_raw out of range (0–4095), got ${msg.soil_moisture_raw}`);
  }
  if (typeof msg.seq !== 'number' || msg.seq < 0 || msg.seq > 65535) {
    errors.push(`seq out of range (uint16), got ${msg.seq}`);
  }
  if (typeof msg.telemetry_delay_ms !== 'number' || msg.telemetry_delay_ms < 0) {
    errors.push(`telemetry_delay_ms must be >= 0, got ${msg.telemetry_delay_ms}`);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Validate sensor status packet (source: "sensor", nodes 3+)
 */
function validateSensorStatus(msg) {
  const errors = [];

  // Required fields
  if (typeof msg.node_id !== 'number' || msg.node_id < 3) {
    errors.push(`node_id must be >= 3, got ${msg.node_id}`);
  }
  if (msg.source !== 'sensor') {
    errors.push(`source must be "sensor", got ${msg.source}`);
  }
  if (typeof msg.bus_voltage_mv !== 'number' || msg.bus_voltage_mv < 0 || msg.bus_voltage_mv > 65535) {
    errors.push(`bus_voltage_mv out of range (uint16), got ${msg.bus_voltage_mv}`);
  }
  if (typeof msg.current_ma !== 'number') {
    errors.push(`current_ma must be a number, got ${msg.current_ma}`);
  }
  if (typeof msg.water_level !== 'number' || msg.water_level < 0 || msg.water_level > 100) {
    errors.push(`water_level out of range (0–100), got ${msg.water_level}`);
  }
  if (typeof msg.water_distance_mm !== 'number' || msg.water_distance_mm < 0 || msg.water_distance_mm > 65535) {
    errors.push(`water_distance_mm out of range (uint16), got ${msg.water_distance_mm}`);
  }
  if (typeof msg.boot_count !== 'number' || msg.boot_count < 0 || msg.boot_count > 65535) {
    errors.push(`boot_count out of range (uint16), got ${msg.boot_count}`);
  }
  if (typeof msg.sensor_ok !== 'number' || msg.sensor_ok < 0 || msg.sensor_ok > 255) {
    errors.push(`sensor_ok must be uint8, got ${msg.sensor_ok}`);
  }
  if (typeof msg.seq !== 'number' || msg.seq < 0 || msg.seq > 65535) {
    errors.push(`seq out of range (uint16), got ${msg.seq}`);
  }
  if (typeof msg.e2e_latency_ms !== 'number' || msg.e2e_latency_ms < 0) {
    errors.push(`e2e_latency_ms must be >= 0, got ${msg.e2e_latency_ms}`);
  }
  if (typeof msg.toa_ms !== 'number' || msg.toa_ms < 0) {
    errors.push(`toa_ms must be >= 0, got ${msg.toa_ms}`);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Validate heartbeat packet
 */
function validateHeartbeat(msg) {
  const errors = [];

  if (msg.device !== 'MasterBridge') {
    errors.push(`device must be "MasterBridge", got ${msg.device}`);
  }
  if (typeof msg.wifi_channel !== 'number' || msg.wifi_channel < 1 || msg.wifi_channel > 14) {
    errors.push(`wifi_channel out of range (1–14), got ${msg.wifi_channel}`);
  }
  if (typeof msg.mode !== 'number' || ![0, 1].includes(msg.mode)) {
    errors.push(`mode must be 0 or 1, got ${msg.mode}`);
  }
  if (!msg.nodes || typeof msg.nodes !== 'object') {
    errors.push(`nodes must be an object, got ${typeof msg.nodes}`);
  } else {
    Object.entries(msg.nodes).forEach(([nodeIdStr, info]) => {
      if (typeof info.online !== 'boolean') {
        errors.push(`nodes[${nodeIdStr}].online must be boolean`);
      }
      if (info.seen_ms_ago !== null && (typeof info.seen_ms_ago !== 'number' || info.seen_ms_ago < 0)) {
        errors.push(`nodes[${nodeIdStr}].seen_ms_ago must be number >= 0 or null`);
      }
    });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Validate command_send_failed event
 */
function validateCommandSendFailed(msg) {
  const errors = [];

  if (msg.event !== 'command_send_failed') {
    errors.push(`event must be "command_send_failed"`);
  }
  if (typeof msg.node_id !== 'number' || msg.node_id < 1) {
    errors.push(`node_id must be number >= 1`);
  }
  if (typeof msg.seq !== 'number' || msg.seq < 0 || msg.seq > 65535) {
    errors.push(`seq out of range (uint16), got ${msg.seq}`);
  }
  if (typeof msg.esp_now_error !== 'number') {
    errors.push(`esp_now_error must be number (ESP-NOW error code)`);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Validate command_not_confirmed event
 */
function validateCommandNotConfirmed(msg) {
  const errors = [];

  if (msg.event !== 'command_not_confirmed') {
    errors.push(`event must be "command_not_confirmed"`);
  }
  if (typeof msg.node_id !== 'number' || msg.node_id < 1) {
    errors.push(`node_id must be number >= 1`);
  }
  if (typeof msg.seq !== 'number' || msg.seq < 0 || msg.seq > 65535) {
    errors.push(`seq out of range (uint16), got ${msg.seq}`);
  }
  if (typeof msg.timeout_ms !== 'number' || msg.timeout_ms < 0) {
    errors.push(`timeout_ms must be number >= 0`);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

module.exports = {
  validateRelayStatus,
  validateSensorStatus,
  validateHeartbeat,
  validateCommandSendFailed,
  validateCommandNotConfirmed,
};