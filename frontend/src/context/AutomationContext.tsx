import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import { API_BASE } from '../lib/config';
import { useWebSocket } from '../hooks/useWebSocket';
import type { WsMessage } from '../types';
import type {
  PlantPhase,
  FieldState,
  AutomationState,
  SensorHealth,
  AutomationEvent,
  PhaseInput,
} from '../types/automation';

export type EventFilters = {
  severity?: 'all' | 'info' | 'warn' | 'error';
  type?: string;
};

export type AutomationContextType = {
  phases: PlantPhase[];
  currentPhase: PlantPhase | null;
  fieldState: FieldState | null;
  daysInPhase: number | null;
  daysSincePlanting: number | null;
  automationState: AutomationState | null;
  sensorHealth: SensorHealth | null;
  events: AutomationEvent[];
  unreadEventCount: number;
  loadPhases: () => Promise<void>;
  loadFieldState: () => Promise<void>;
  createCustomPhase: (phase: PhaseInput) => Promise<PlantPhase>;
  updatePhase: (id: number, updates: PhaseInput) => Promise<PlantPhase>;
  deleteCustomPhase: (id: number) => Promise<void>;
  startSeason: () => Promise<void>;
  nextPhase: () => Promise<void>;
  toggleAutomation: (enabled: boolean) => Promise<void>;
  updateRateLimit: (ms: number) => Promise<void>;
  loadEvents: (filters?: EventFilters) => Promise<void>;
  resolveEvent: (id: number) => Promise<void>;
};

export const AutomationContext = createContext<AutomationContextType | null>(null);

const initialState = {
  phases: [] as PlantPhase[],
  fieldState: null as FieldState | null,
  automationState: null as AutomationState | null,
  sensorHealth: null as SensorHealth | null,
  events: [] as AutomationEvent[],
};

type Action =
  | { type: 'SET_PHASES'; phases: PlantPhase[] }
  | { type: 'SET_FIELD_STATE'; fieldState: FieldState }
  | { type: 'SET_AUTOMATION_STATE'; automationState: AutomationState }
  | { type: 'SET_SENSOR_HEALTH'; sensorHealth: SensorHealth }
  | { type: 'SET_EVENTS'; events: AutomationEvent[] }
  | { type: 'ADD_EVENT'; event: AutomationEvent }
  | { type: 'RESOLVE_EVENT'; id: number; resolvedAt: number };


function reducer(state: typeof initialState, action: Action) {
  switch (action.type) {
    case 'SET_PHASES':
      return { ...state, phases: action.phases };
    case 'SET_FIELD_STATE':
      return { ...state, fieldState: action.fieldState };
    case 'SET_AUTOMATION_STATE':
      return { ...state, automationState: action.automationState };
    case 'SET_SENSOR_HEALTH':
      return { ...state, sensorHealth: action.sensorHealth };
    case 'SET_EVENTS':
      return { ...state, events: action.events };
    case 'ADD_EVENT':
      return { ...state, events: [action.event, ...state.events] };
    case 'RESOLVE_EVENT':
      return {
        ...state,
        events: state.events.map((event) =>
          event.id === action.id
            ? { ...event, resolved_at: action.resolvedAt }
            : event
        ),
      };
    default:
      return state;
  }
}

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.detail || payload?.error || `Request failed with status ${response.status}`
    );
  }

  return response.json();
}

type AutomationWsMessage =
  | WsMessage
  | { type: 'phase_changed'; data: { current_phase_id: number }; ts: number }
  | { type: 'automation_state_updated'; data: AutomationState; ts: number }
  | { type: 'sensor_offline_alert'; data: { message: string; last_update_ms_ago: number }; ts: number }
  | { type: 'automation_event_created'; data: AutomationEvent; ts: number }
  | { type: 'sensor_online_prompt'; data: { message: string }; ts: number };

export function AutomationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const currentPhase = useMemo(() => {
    if (!state.fieldState?.current_phase_id) return null;
    return state.phases.find((phase) => phase.id === state.fieldState?.current_phase_id) ?? null;
  }, [state.fieldState?.current_phase_id, state.phases]);

  const daysInPhase = useMemo(() => {
    if (!state.fieldState?.phase_started_at) return null;
    return Math.max(0, Math.floor((Date.now() - state.fieldState.phase_started_at) / 86_400_000));
  }, [state.fieldState?.phase_started_at]);

  const daysSincePlanting = useMemo(() => {
    if (!state.fieldState?.first_planting_date) return null;
    return Math.max(0, Math.floor((Date.now() - state.fieldState.first_planting_date) / 86_400_000));
  }, [state.fieldState?.first_planting_date]);

  const unreadEventCount = useMemo(
    () => state.events.filter((event) => !event.resolved_at).length,
    [state.events]
  );

  const loadPhases = useCallback(async () => {
    const phases = await request<PlantPhase[]>('/automation/phases');
    dispatch({ type: 'SET_PHASES', phases });
  }, []);

  const loadFieldState = useCallback(async () => {
    const fieldState = await request<FieldState>('/automation/field-state');
    dispatch({ type: 'SET_FIELD_STATE', fieldState });
  }, []);

  const loadAutomationState = useCallback(async () => {
    const automationState = await request<AutomationState>('/automation/state');
    dispatch({ type: 'SET_AUTOMATION_STATE', automationState });
  }, []);

  const loadSensorHealth = useCallback(async () => {
    const sensorHealth = await request<SensorHealth>('/automation/sensor-health');
    dispatch({ type: 'SET_SENSOR_HEALTH', sensorHealth });
  }, []);

  const loadEvents = useCallback(async (filters?: EventFilters) => {
    const query = new URLSearchParams();
    if (filters?.severity && filters.severity !== 'all') {
      query.set('severity', filters.severity);
    }
    if (filters?.type) {
      query.set('type', filters.type);
    }
    const response = await request<{ events: AutomationEvent[] }>(
      `/automation/events${query.toString() ? `?${query.toString()}` : ''}`
    );
    dispatch({ type: 'SET_EVENTS', events: response.events });
  }, []);

  const createCustomPhase = useCallback(async (phase: PhaseInput) => {
    const created = await request<PlantPhase>('/automation/phases', {
      method: 'POST',
      body: JSON.stringify(phase),
    });
    dispatch({ type: 'SET_PHASES', phases: [...state.phases, created] });
    return created;
  }, [state.phases]);

  const updatePhase = useCallback(async (id: number, updates: PhaseInput) => {
    const updated = await request<PlantPhase>(`/automation/phases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    dispatch({
      type: 'SET_PHASES',
      phases: state.phases.map((phase) => (phase.id === id ? updated : phase)),
    });
    return updated;
  }, [state.phases]);

  const deleteCustomPhase = useCallback(async (id: number) => {
    await request<void>(`/automation/phases/${id}`, {
      method: 'DELETE',
    });
    dispatch({
      type: 'SET_PHASES',
      phases: state.phases.filter((phase) => phase.id !== id),
    });
  }, [state.phases]);

  const startSeason = useCallback(async () => {
    const fieldState = await request<FieldState>('/automation/season/start', {
      method: 'POST',
    });
    dispatch({ type: 'SET_FIELD_STATE', fieldState });
  }, []);

  const nextPhase = useCallback(async () => {
    const fieldState = await request<FieldState>('/automation/season/advance', {
      method: 'POST',
    });
    dispatch({ type: 'SET_FIELD_STATE', fieldState });
  }, []);

  const toggleAutomation = useCallback(async (enabled: boolean) => {
    const automationState = await request<AutomationState>('/automation/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    dispatch({ type: 'SET_AUTOMATION_STATE', automationState });
  }, []);

  const updateRateLimit = useCallback(async (ms: number) => {
    const automationState = await request<AutomationState>('/automation/rate-limit', {
      method: 'POST',
      body: JSON.stringify({ min_toggle_interval_ms: ms }),
    });
    dispatch({ type: 'SET_AUTOMATION_STATE', automationState });
  }, []);

  const resolveEvent = useCallback(async (id: number) => {
    const result = await request<{ resolved_at: number }>(
      `/automation/events/${id}/resolve`,
      { method: 'POST' }
    );
    dispatch({ type: 'RESOLVE_EVENT', id, resolvedAt: result.resolved_at });
  }, []);

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      const payload = msg as AutomationWsMessage;

      switch (payload.type) {
        case 'phase_changed':
          loadFieldState().catch(() => undefined);
          break;
        case 'automation_state_updated':
          dispatch({ type: 'SET_AUTOMATION_STATE', automationState: payload.data });
          break;
        case 'sensor_offline_alert':
          dispatch({ type: 'ADD_EVENT', event: {
            id: Date.now(),
            event_type: 'sensor_offline',
            severity: 'error',
            message: payload.data.message,
            triggered_at: Date.now(),
            resolved_at: null,
          } });
          break;
        case 'automation_event_created':
          dispatch({ type: 'ADD_EVENT', event: payload.data });
          break;
        default:
          break;
      }
    },
    [loadFieldState]
  );

  useEffect(() => {
    loadPhases().catch(() => undefined);
    loadFieldState().catch(() => undefined);
    loadAutomationState().catch(() => undefined);
    loadSensorHealth().catch(() => undefined);
    loadEvents().catch(() => undefined);
  }, [loadEvents, loadFieldState, loadPhases, loadAutomationState, loadSensorHealth]);

  useWebSocket(handleWsMessage);

  const value = useMemo<AutomationContextType>(
    () => ({
      phases: state.phases,
      currentPhase,
      fieldState: state.fieldState,
      daysInPhase,
      daysSincePlanting,
      automationState: state.automationState,
      sensorHealth: state.sensorHealth,
      events: state.events,
      unreadEventCount,
      loadPhases,
      loadFieldState,
      createCustomPhase,
      updatePhase,
      deleteCustomPhase,
      startSeason,
      nextPhase,
      toggleAutomation,
      updateRateLimit,
      loadEvents,
      resolveEvent,
    }),
    [
      state.events,
      state.fieldState,
      state.phases,
      state.automationState,
      state.sensorHealth,
      currentPhase,
      daysInPhase,
      daysSincePlanting,
      unreadEventCount,
      loadPhases,
      loadFieldState,
      createCustomPhase,
      updatePhase,
      deleteCustomPhase,
      startSeason,
      nextPhase,
      toggleAutomation,
      updateRateLimit,
      loadEvents,
      resolveEvent,
    ]
  );

  return (
    <AutomationContext.Provider value={value}>
      {children}
    </AutomationContext.Provider>
  );
}

export function useAutomationContext() {
  const context = useContext(AutomationContext);
  if (!context) {
    throw new Error('useAutomationContext must be used within AutomationProvider');
  }
  return context;
}
