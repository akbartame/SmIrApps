import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useNodes } from '../context/NodesContext';
import type { NodesensorMessage, LoraSensorData, RelaySensorData } from '../types';

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
        if (!cancelled) {
          // Normalize historical records if necessary (e.g., legacy water_level_a/b fallback)
          const normalized = rows.map((row) => {
            if (row.source === 'sensor') {
              const sensorRow = row as LoraSensorData & { received_at: number; water_level_a?: number; water_level_b?: number };
              // Fallback if historical record uses old format but frontend expects new `water_level`
              if (sensorRow.water_level === undefined && sensorRow.water_level_a !== undefined && sensorRow.water_level_b !== undefined) {
                return {
                  ...sensorRow,
                  water_level: Math.round((sensorRow.water_level_a + sensorRow.water_level_b) / 2),
                  water_distance_mm: sensorRow.water_distance_mm ?? 0,
                };
              }
            }
            return row;
          });
          setPoints(normalized);
        }
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

  // Map sensor points for chart plotting, ensuring backward-compatible field extraction
  const mappedPoints = points.map((p) => {
    if (p.source === 'sensor') {
      const s = p as LoraSensorData & { water_level_a?: number; water_level_b?: number };
      const effectiveWaterLevel = s.water_level !== undefined 
        ? s.water_level 
        : (s.water_level_a !== undefined && s.water_level_b !== undefined ? (s.water_level_a + s.water_level_b) / 2 : 0);
      return {
        ...s,
        water_level: effectiveWaterLevel,
      };
    }
    return p;
  });

  return { points: mappedPoints, loading, error };
}