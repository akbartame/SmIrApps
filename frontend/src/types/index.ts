// Mirrors MQTT_DATA_REFERENCE.md / backend db/schema.sql. Keep field names
// identical to the wire format — no renaming for "nicer" JS casing, so a
// diff against the docs stays trivial.

export type RelaySensorData = {
  source: 'relay';
  node_id: 1 | 2;
  solenoid_state: 0 | 1;
  flow_pulses: number; // cumulative since boot — diff to get a rate
  distance_mm: number; // 0 is ambiguous, see formatDistance()
  temperature_c_x100: number; // -12700 == sensor not detected
  soil_moisture_raw: number; // uncalibrated 0-4095
};

export type LoraSensorData = {
  source: 'sensor';
  node_id: 3 | 4;
  bus_voltage_mv: number;
  current_ma: number;
  water_level_a: number; // 0-100
  water_level_b: number; // 0-100
  boot_count: number;
  sensor_ok: 0 | 1; // bit0: INA226 read succeeded this cycle
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
  wifi_connected: boolean;
  wifi_channel: number;
  mqtt_connected: boolean;
  mode: 0 | 1 | 2;
  auto_rule_active: boolean;
  target_node_id: number;
  nodes: Record<string, NodeOnlineInfo>;
  received_at?: number;
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
  mode: 0 | 1 | 2;
  target_node_id: number | null;
  solenoid_state: 0 | 1 | null;
  auto_on_level: number | null;
  auto_off_level: number | null;
  status: CommandStatus;
  master_seq: number | null;
  requested_at: number;
  updated_at: number;
  confirmed_at: number | null;
};

export type ControlPayload =
  | { mode: 0 }
  | { mode: 1; target_node_id: 1 | 2; solenoid_state: 0 | 1 }
  | {
      mode: 2;
      target_node_id: 1 | 2;
      solenoid_state: 0 | 1;
      auto_on_level: number;
      auto_off_level: number;
    };

export type WsMessage =
  | { type: 'nodesensor'; data: NodesensorMessage; ts: number }
  | { type: 'heartbeat'; data: MasterHeartbeat; ts: number }
  | { type: 'command_update'; data: CommandRecord; ts: number }
  | { type: 'status_event'; data: StatusEvent; ts: number };

export const RELAY_NODE_IDS = [1, 2] as const;
export const SENSOR_NODE_IDS = [3, 4] as const;
export const ALL_NODE_IDS = [1, 2, 3, 4] as const;
