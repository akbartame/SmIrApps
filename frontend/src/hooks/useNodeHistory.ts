import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useNodes } from '../context/NodesContext';
import {
  isPowerReadingReliable,
  isTemperatureReadable,
  isWaterReadingReliable,
} from '../lib/format';
import type {
  HistoryBucket,
  NodesensorMessage,
  RelayHistoryBucket,
  SensorHistoryBucket,
} from '../types';

const HISTORY_MAX_POINTS = 500;

// A live WS reading carries full payload fields; map it into the same
// slim bucket shape the range endpoint returns, so chart code sees one
// uniform point type.
function toSensorBucket(
  msg: Extract<NodesensorMessage, { source: 'sensor' }>
): SensorHistoryBucket {
  return {
    x: msg.received_at,
    calibrated_water_level_pct: isWaterReadingReliable(msg.sensor_ok)
      ? (msg.calibrated_water_level_pct ?? null)
      : null,
    voltage_v: isPowerReadingReliable(msg.sensor_ok) ? msg.bus_voltage_mv / 1000 : null,
    current_ma: isPowerReadingReliable(msg.sensor_ok) ? msg.current_ma : null,
    sample_count: 1,
  };
}

// Pairs the live relay reading against the previous point's trailing
// cumulative counter — the same consecutive-reading segment the old
// client-side delta loop computed. sample_count 2 marks a real segment;
// 1 means "lone point, rate unknown".
function toRelayBucket(
  msg: Extract<NodesensorMessage, { source: 'relay' }>,
  prevPulses: number | null,
  prevT: number | null
): RelayHistoryBucket {
  return {
    x: msg.received_at,
    temperature_c: isTemperatureReadable(msg.temperature_c_x100)
      ? msg.temperature_c_x100 / 100
      : null,
    flow_pulses_first: prevPulses,
    flow_pulses_last: msg.flow_pulses,
    span_s: prevT !== null && msg.received_at > prevT ? (msg.received_at - prevT) / 1000 : 0,
    sample_count: prevPulses === null ? 1 : 2,
  };
}

function trailingPulses(bucket: RelayHistoryBucket): number | null {
  return bucket.flow_pulses_last ?? bucket.flow_pulses_first ?? null;
}

function isRelayBucket(point: HistoryBucket): point is RelayHistoryBucket {
  return 'flow_pulses_first' in point;
}

export function useNodeHistory(nodeId: number, rangeMs: number) {
  const { latest } = useNodes();
  const [points, setPoints] = useState<HistoryBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rangeRef = useRef(rangeMs);
  rangeRef.current = rangeMs;

  // Re-fetch the window whenever the node or the selected range changes.
  // The backend returns at most HISTORY_MAX_POINTS time buckets no matter
  // how wide the range is, so 24h/7d stay cheap.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const to = Date.now();
    const from = to - rangeMs;
    api
      .getNodeHistoryRange(nodeId, from, to, HISTORY_MAX_POINTS)
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
      if (prev.length && prev[prev.length - 1].x === latestForNode.received_at) {
        return prev;
      }
      const next: HistoryBucket =
        latestForNode.source === 'sensor'
          ? toSensorBucket(latestForNode)
          : (() => {
              const tail = [...prev].reverse().find(isRelayBucket);
              return toRelayBucket(
                latestForNode,
                tail ? trailingPulses(tail) : null,
                tail ? tail.x : null
              );
            })();
      const cutoff = Date.now() - rangeRef.current;
      return [...prev, next].filter((p) => p.x >= cutoff);
    });
  }, [latestForNode]);

  // Keep the window rolling even when no new data arrives.
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - rangeRef.current;
      setPoints((prev) => prev.filter((p) => p.x >= cutoff));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  return { points, loading, error };
}
