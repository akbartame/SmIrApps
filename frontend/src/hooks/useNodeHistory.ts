import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useNodes } from '../context/NodesContext';
import type { NodesensorMessage } from '../types';

export function useNodeHistory(nodeId: number, rangeMs: number) {
  const { latest } = useNodes();
  const [points, setPoints] = useState<NodesensorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rangeRef = useRef(rangeMs);
  rangeRef.current = rangeMs;

  // Re-fetch the window whenever the node or the selected range changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const to = Date.now();
    const from = to - rangeMs;
    api
      .getNodeHistoryRange(nodeId, from, to)
      .then((rows) => {
        if (!cancelled) setPoints(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat riwayat');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, rangeMs]);

  // Live-append the latest reading for this node as it arrives over WS
  // (via context), instead of re-polling the REST endpoint.
  const latestForNode = latest[nodeId];
  useEffect(() => {
    if (!latestForNode) return;
    setPoints((prev) => {
      if (prev.length && prev[prev.length - 1].received_at === latestForNode.received_at) {
        return prev;
      }
      const cutoff = Date.now() - rangeRef.current;
      return [...prev, latestForNode].filter((p) => p.received_at >= cutoff);
    });
  }, [latestForNode]);

  // Keep the window rolling even when no new data arrives.
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - rangeRef.current;
      setPoints((prev) => prev.filter((p) => p.received_at >= cutoff));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  return { points, loading, error };
}
