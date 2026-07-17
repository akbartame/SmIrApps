import { useMemo } from 'react';
import { Card, CardHeader } from '../common/Card';
import { HistoryChart } from './HistoryChart';
import { VoltageCurrentChart } from './VoltageCurrentChart';
import { OnlineBadge } from '../nodes/OnlineBadge';
import { useNodeHistory } from '../../hooks/useNodeHistory';
import { useNodes } from '../../context/NodesContext';
import { computeFlowDelta, isTemperatureReadable } from '../../lib/format';
import type { LoraSensorData, RelaySensorData } from '../../types';

export function NodeHistoryCard({ nodeId, rangeMs }: { nodeId: 1 | 2 | 3 | 4; rangeMs: number }) {
  const { online } = useNodes();
  const { points, loading, error } = useNodeHistory(nodeId, rangeMs);
  const isRelay = nodeId === 1 || nodeId === 2;

  const sensorPoints = useMemo(
    () => points.filter((p): p is LoraSensorData & { received_at: number } => p.source === 'sensor'),
    [points]
  );
  const relayPoints = useMemo(
    () => points.filter((p): p is RelaySensorData & { received_at: number } => p.source === 'relay'),
    [points]
  );

  const waterLevelData = useMemo(
    () =>
      sensorPoints.map((p) => ({
        x: p.received_at,
        water_level_a: p.water_level_a,
        water_level_b: p.water_level_b,
      })),
    [sensorPoints]
  );

  const voltageCurrentData = useMemo(
    () =>
      sensorPoints.map((p) => ({
        x: p.received_at,
        voltage_v: (p.sensor_ok & 1) === 1 ? p.bus_voltage_mv / 1000 : null,
        current_ma: (p.sensor_ok & 1) === 1 ? p.current_ma : null,
      })),
    [sensorPoints]
  );

  const temperatureData = useMemo(
    () =>
      relayPoints.map((p) => ({
        x: p.received_at,
        temperature_c: isTemperatureReadable(p.temperature_c_x100)
          ? p.temperature_c_x100 / 100
          : null,
      })),
    [relayPoints]
  );

  const flowRateData = useMemo(() => {
    const out: { x: number; pulses_per_sec: number | null }[] = [];
    for (let i = 1; i < relayPoints.length; i++) {
      const delta = computeFlowDelta(relayPoints[i - 1], relayPoints[i]);
      out.push({
        x: relayPoints[i].received_at,
        pulses_per_sec: delta ? Number((delta.pulses / delta.seconds).toFixed(2)) : null,
      });
    }
    return out;
  }, [relayPoints]);

  return (
    <Card>
      <CardHeader
        title={`Node ${nodeId}`}
        subtitle={isRelay ? 'Relay — suhu & flow rate' : 'Sensor LoRa — level air & daya'}
        right={<OnlineBadge info={online[nodeId]} />}
      />

      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      {loading && points.length === 0 && !error && (
        <p className="text-xs text-ink-faint mb-2">Memuat riwayat…</p>
      )}

      {isRelay ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] text-ink-faint mb-1">Suhu (°C)</p>
            <HistoryChart
              data={temperatureData}
              lines={[{ dataKey: 'temperature_c', name: 'Suhu', color: '#B23B3B' }]}
              yUnit="°C"
            />
          </div>
          <div>
            <p className="text-[11px] text-ink-faint mb-1">Flow rate (pulsa/dtk)</p>
            <p className="text-[10px] text-ink-faint mb-1">
              Belum dikalibrasi ke L/menit — dokumentasi tidak mencantumkan konstanta
              pulsa-per-liter, jadi ditampilkan sebagai laju pulsa mentah.
            </p>
            <HistoryChart
              data={flowRateData}
              lines={[{ dataKey: 'pulses_per_sec', name: 'Flow', color: '#1B6B76' }]}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] text-ink-faint mb-1">Level Air (%)</p>
            <HistoryChart
              data={waterLevelData}
              lines={[
                { dataKey: 'water_level_a', name: 'Level A', color: '#1B6B76' },
                { dataKey: 'water_level_b', name: 'Level B', color: '#8A9A9D' },
              ]}
              yUnit="%"
            />
          </div>
          <div>
            <p className="text-[11px] text-ink-faint mb-1">Tegangan / Arus</p>
            <VoltageCurrentChart data={voltageCurrentData} />
          </div>
        </div>
      )}
    </Card>
  );
}
