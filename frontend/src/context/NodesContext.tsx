import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import type {
  CommandRecord,
  ControlPayload,
  MasterHeartbeat,
  NodeOnlineInfo,
  NodesensorMessage,
  WsMessage,
} from '../types';

type State = {
  latest: Record<number, NodesensorMessage>;
  online: Record<number, NodeOnlineInfo>;
  masterStatus: MasterHeartbeat | null;
  commands: Record<number, CommandRecord>;
  bootstrapped: boolean;
  bootstrapError: string | null;
};

type Action =
  | { type: 'BOOTSTRAP_OK'; latest: NodesensorMessage[]; status: MasterHeartbeat | null }
  | { type: 'BOOTSTRAP_ERROR'; error: string }
  | { type: 'NODESENSOR'; data: NodesensorMessage }
  | { type: 'HEARTBEAT'; data: MasterHeartbeat }
  | { type: 'COMMAND_UPDATE'; data: CommandRecord };

const initialState: State = {
  latest: {},
  online: {},
  masterStatus: null,
  commands: {},
  bootstrapped: false,
  bootstrapError: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'BOOTSTRAP_OK': {
      const latest: Record<number, NodesensorMessage> = {};
      for (const row of action.latest) latest[row.node_id] = row;
      return {
        ...state,
        latest,
        online: action.status?.nodes
          ? Object.fromEntries(Object.entries(action.status.nodes).map(([k, v]) => [Number(k), v]))
          : {},
        masterStatus: action.status,
        bootstrapped: true,
        bootstrapError: null,
      };
    }
    case 'BOOTSTRAP_ERROR':
      return { ...state, bootstrapped: true, bootstrapError: action.error };
    case 'NODESENSOR':
      return { ...state, latest: { ...state.latest, [action.data.node_id]: action.data } };
    case 'HEARTBEAT':
      return {
        ...state,
        masterStatus: action.data,
        online: Object.fromEntries(
          Object.entries(action.data.nodes).map(([k, v]) => [Number(k), v])
        ),
      };
    case 'COMMAND_UPDATE':
      return { ...state, commands: { ...state.commands, [action.data.id]: action.data } };
    default:
      return state;
  }
}

type Ctx = State & {
  wsStatus: ReturnType<typeof useWebSocket>;
  /** True online/offline per the last heartbeat — NOT inferred from `latest`. */
  isOnline: (nodeId: number) => boolean;
  publishCommand: (payload: ControlPayload) => Promise<CommandRecord>;
};

const NodesContext = createContext<Ctx | null>(null);

export function NodesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [latest, status] = await Promise.all([
          api.getAllLatestNodes(),
          api.getMasterStatus().catch(() => null), // no heartbeat yet is a valid initial state
        ]);
        if (!cancelled) dispatch({ type: 'BOOTSTRAP_OK', latest, status });
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: 'BOOTSTRAP_ERROR',
            error: err instanceof Error ? err.message : 'Gagal memuat data awal',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'nodesensor') dispatch({ type: 'NODESENSOR', data: msg.data });
    else if (msg.type === 'heartbeat') dispatch({ type: 'HEARTBEAT', data: msg.data });
    else if (msg.type === 'command_update') dispatch({ type: 'COMMAND_UPDATE', data: msg.data });
    // 'status_event' is informational-only for now — command_update already
    // carries the derived state the UI needs.
  }, []);

  const wsStatus = useWebSocket(handleWsMessage);

  const isOnline = useCallback(
    (nodeId: number) => state.online[nodeId]?.online ?? false,
    [state.online]
  );

  const publishCommand = useCallback(async (payload: ControlPayload) => {
    const res = await api.postControl(payload);
    // Seed the command locally so the UI can show "waiting" immediately,
    // without waiting for a round-trip WS echo of our own pending state.
    const seeded: CommandRecord = {
      id: res.command_id,
      node_id: 'target_node_id' in payload ? payload.target_node_id : null,
      mode: payload.mode,
      target_node_id: 'target_node_id' in payload ? payload.target_node_id : null,
      solenoid_state: 'solenoid_state' in payload ? payload.solenoid_state : null,
      auto_on_level: 'auto_on_level' in payload ? payload.auto_on_level : null,
      auto_off_level: 'auto_off_level' in payload ? payload.auto_off_level : null,
      status: payload.mode === 0 ? 'sent' : 'pending',
      master_seq: null,
      requested_at: Date.now(),
      updated_at: Date.now(),
      confirmed_at: null,
    };
    dispatch({ type: 'COMMAND_UPDATE', data: seeded });
    return seeded;
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...state, wsStatus, isOnline, publishCommand }),
    [state, wsStatus, isOnline, publishCommand]
  );

  return <NodesContext.Provider value={value}>{children}</NodesContext.Provider>;
}

export function useNodes() {
  const ctx = useContext(NodesContext);
  if (!ctx) throw new Error('useNodes must be used within NodesProvider');
  return ctx;
}
