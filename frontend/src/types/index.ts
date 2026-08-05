// Mirrors MQTT_REFERENCE.md / backend db/schema.sql. Keep field names
// identical to the wire format — no renaming for "nicer" JS casing, so a
// diff against the docs stays trivial.

export type RelaySensorData = {
  source: 'relay';
  node_id: 1 | 2;
  solenoid_state: 0 | 1; // **Ground truth at time of measurement**, not the result of a command
  flow_pulses: number; // uint32, cumulative since boot — diff to get rate. Resets on node reboot.
  distance_mm: number; // uint16, HC-SR04 ultrasonic. 0 is ambiguous (error or actual 0mm), see formatDistance()
  temperature_c_x100: number; // int16, DS18B20 × 100. Example: 2431 = 24.31°C. Sentinel: -12700 = not detected
  soil_moisture_raw: number; // uint16, ADC 0–4095, uncalibrated
  seq: number; // uint16, status packet sequence (not command sequence). Gaps = lost ESP-NOW frames
  telemetry_delay_ms: number; // Milliseconds from packet generation to transmission
};

export type LoraSensorData = {
  source: 'sensor';
  node_id: 3 | 4;
  bus_voltage_mv: number; // uint32, millivolts (no conversion). Median of 5 samples from INA226.
  current_ma: number; // float, milliamps (no conversion). Negative if power drain. Median of 5 samples.
  water_level: number; // uint8, 0–100%. Derived from ultrasonic distance. **Requires calibration to be reliable.**
  water_distance_mm: number; // uint16, raw JSN-SR04T echo distance in mm. Use for calibration verification.
  boot_count: number; // uint16, increments per deep sleep wake. Gaps = lost LoRa frames. Wraps ~7.5 days.
  sensor_ok: number; // uint8 bitfield: bit0 = INA226 OK, bit1 = ultrasonic echo OK. Check: (sensor_ok & 0x01) and (sensor_ok & 0x02)
  seq: number; // uint16, packet sequence (per wake). Useful for LoRa frame loss detection.
  e2e_latency_ms: number; // Milliseconds from node wake to LoRa transmission start
  toa_ms: number; // Time-on-air of LoRa frame in milliseconds
};

export type NodesensorMessage = (RelaySensorData | LoraSensorData) & {
  received_at: number; // unix ms, added by backend
};

export type NodeOnlineInfo = {
  online: boolean;
  seen_ms_ago: number | null;
};

export type MasterHeartbeat = {
  device: 'MasterBridge';
  wifi_channel: number;
  mode: 0 | 1; // 0 = global OFF, 1 = manual. Mode 2 (auto) was removed from firmware.
  auto_rule_active: boolean; // Always false (auto mode not supported). Kept for compatibility.
  target_node_id: number; // Node ID this heartbeat concerns. 0 if global.
  nodes: Record<string, NodeOnlineInfo>; // All known nodes + online status (strictly from heartbeat, not stale data)
  received_at?: number; // Backend timestamp when this heartbeat arrived
};

export type StatusEvent =
  | { event: 'command_send_failed'; node_id: number; seq: number; esp_now_error: number }
  | { event: 'command_not_confirmed'; node_id: number; seq: number; timeout_ms: number };

export type CommandStatus =
  | 'sent' // mode 0 — no confirmation flow tracked
  | 'pending'
  | 'send_failed'
  | 'not_confirmed'
  | 'confirmed'
  | 'stale';

export type CommandRecord = {
  id: number;
  node_id: number | null;
  mode: 0 | 1; // 0 = global OFF, 1 = manual relay control. Mode 2 (auto) not supported.
  target_node_id: number | null;
  solenoid_state: 0 | 1 | null;
  auto_on_level: number | null; // Always null (kept for schema compatibility, not used)
  auto_off_level: number | null; // Always null (kept for schema compatibility, not used)
  status: CommandStatus;
  master_seq: number | null;
  requested_at: number;
  updated_at: number;
  confirmed_at: number | null;
};

export type ControlPayload =
  | { mode: 0 } // Global OFF — no per-command ack flow, marked "sent" immediately
  | { mode: 1; target_node_id: 1 | 2; solenoid_state: 0 | 1 }; // Manual: toggle relay solenoid on node 1 or 2

export type WsMessage =
  | { type: 'nodesensor'; data: NodesensorMessage; ts: number }
  | { type: 'heartbeat'; data: MasterHeartbeat; ts: number }
  | { type: 'command_update'; data: CommandRecord; ts: number }
  | { type: 'status_event'; data: StatusEvent; ts: number };

export const RELAY_NODE_IDS = [1, 2] as const;
export const SENSOR_NODE_IDS = [3, 4] as const;
export const ALL_NODE_IDS = [1, 2, 3, 4] as const;

export type { PlantPhase, FieldState, AutomationState, SensorHealth, AutomationEvent, PhaseInput } from './automation';