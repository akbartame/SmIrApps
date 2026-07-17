import { API_BASE } from './config';
import type { CommandRecord, ControlPayload, MasterHeartbeat, NodesensorMessage } from '../types';

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

  getNodeHistoryRange: (nodeId: number, fromMs: number, toMs: number) =>
    request<NodesensorMessage[]>(
      `/nodes/${nodeId}/history?from=${fromMs}&to=${toMs}&limit=20000`
    ),

  getMasterStatus: () => request<MasterHeartbeat>('/status'),

  postControl: (payload: ControlPayload) =>
    request<{ command_id: number; published: ControlPayload; note: string }>('/control', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCommand: (id: number) => request<CommandRecord>(`/commands/${id}`),
};
