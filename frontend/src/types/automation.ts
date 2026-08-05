export type PlantPhase = {
  id: number;
  name: string;
  min_water_level_pct: number;
  max_water_level_pct: number;
  is_system_phase: boolean;
  order_index: number;
};

export type FieldState = {
  first_planting_date: number | null;
  current_phase_id: number | null;
  phase_started_at: number | null;
  automation_enabled: boolean;
  updated_at: number;
};

export type AutomationState = {
  enabled: boolean;
  last_check_at: number;
  last_water_level: number;
  last_solenoid_state: 0 | 1;
  last_action: 'opened_solenoid' | 'closed_solenoid' | 'no_action' | 'rate_limited' | null;
  min_toggle_interval_ms: number;
};

export type SensorHealth = {
  online: boolean;
  last_update_ms_ago: number;
  last_update_at: number;
};

export type AutomationEvent = {
  id: number;
  event_type: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  triggered_at: number;
  resolved_at: number | null;
};

export type PhaseInput = {
  name?: string;
  min_water_level_pct: number;
  max_water_level_pct: number;
};
