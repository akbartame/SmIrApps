import { API_BASE } from './config';
import type { CommandRecord, ControlPayload, HistoryBucket, MasterHeartbeat, NodeCalibration, NodesensorMessage } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getAllLatestNodes: () => request<NodesensorMessage[]>('/nodes'),
  getNodeHistoryRange: (nodeId: number, fromMs: number, toMs: number, maxPoints = 500) =>
    request<HistoryBucket[]>(
      `/nodes/${nodeId}/history?from=${fromMs}&to=${toMs}&maxPoints=${maxPoints}`
    ),
  getMasterStatus: () => request<MasterHeartbeat>('/status'),
  postControl: (payload: ControlPayload) =>
    request<{ command_id: number; published: ControlPayload; note: string }>('/control', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getCommand: (id: number) => request<CommandRecord>(`/commands/${id}`),
  // Tambahan untuk mengambil status koneksi MQTT dari backend
  getDiagnosticsHealth: () => 
    request<{ backend_online: boolean; mqtt_connected: boolean }>('/diagnostics/health'),
  getCalibrations: () => request<{ calibrations: NodeCalibration[] }>('/calibration'),
  updateCalibration: (
    nodeId: number,
    values: { raw_distance_at_0_pct_mm: number; raw_distance_at_100_pct_mm: number }
  ) =>
    request<NodeCalibration>(`/calibration/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify(values),
    }),
};