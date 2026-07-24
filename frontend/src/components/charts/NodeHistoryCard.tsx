import { useMemo } from 'react';
import { Card, CardHeader } from '../common/Card';
import { CollapsibleChartCard } from './CollapsibleChartCard';
import { HistoryChart } from './HistoryChart';
import { VoltageCurrentChart } from './VoltageCurrentChart';
import { OnlineBadge } from '../nodes/OnlineBadge';
import { useNodeHistory } from '../../hooks/useNodeHistory';
import { useNodes } from '../../context/NodesContext';
import { computeFlowDelta, isTemperatureReadable, FLOW_CALIBRATION_CONSTANT } from '../../lib/format';
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

  // Telah diperbarui untuk menggunakan water_level tunggal alih-alih a/b[cite: 3]
  const waterLevelData = useMemo(
    () =>
      sensorPoints.map((p) => ({
        x: p.received_at,
        water_level: p.water_level,
      })),
    [sensorPoints]
  );

  // Memastikan pembacaan andal menggunakan bitmask sensor_ok[cite: 3]
  const voltageCurrentData = useMemo(
    () =>
      sensorPoints.map((p) => ({
        x: p.received_at,
        voltage_v: (p.sensor_ok & 0x01) !== 0 ? p.bus_voltage_mv / 1000 : null,
        current_ma: (p.sensor_ok & 0x01) !== 0 ? p.current_ma : null,
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

  // Kalkulasi flow rate dalam L/menit
  const flowRateData = useMemo(() => {
    const out: { x: number; l_per_min: number | null }[] = [];
    for (let i = 1; i < relayPoints.length; i++) {
      const delta = computeFlowDelta(relayPoints[i - 1], relayPoints[i]);
      let l_per_min = null;
      if (delta) {
        const pulses_per_sec = delta.pulses / delta.seconds;
        l_per_min = Number((pulses_per_sec / FLOW_CALIBRATION_CONSTANT).toFixed(2));
      }
      out.push({
        x: relayPoints[i].received_at,
        l_per_min,
      });
    }
    return out;
  }, [relayPoints]);

  return (
    <CollapsibleChartCard
      title={`Node ${nodeId}`}
      subtitle={isRelay ? 'Relay — suhu & flow rate' : 'Sensor LoRa — level air & daya'}
      right={<OnlineBadge info={online[nodeId]} />}
      defaultOpen={false}
    >
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      {loading && points.length === 0 && !error && (
        <p className="text-xs text-ink-faint mb-2">Memuat riwayat…</p>
      )}

      {isRelay ? (
        <div className="space-y-6">
          <div>
            <p className="text-[11px] text-ink-faint mb-2">Suhu (°C)</p>
            <HistoryChart
              data={temperatureData}
              lines={[{ dataKey: 'temperature_c', name: 'Suhu', color: '#B23B3B' }]}
              yUnit="°C"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-ink-faint">Flow rate (L/menit)</p>
              <p className="text-[9px] text-ink-faint">Konstanta: {FLOW_CALIBRATION_CONSTANT}</p>
            </div>
            <HistoryChart
              data={flowRateData}
              lines={[{ dataKey: 'l_per_min', name: 'Flow', color: '#1B6B76' }]}
              yUnit=" L/m"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-[11px] text-ink-faint mb-2">Level Air (%)</p>
            <HistoryChart
              data={waterLevelData}
              lines={[
                { dataKey: 'water_level', name: 'Level Air', color: '#1B6B76' }, // Menghapus line untuk Level B[cite: 3]
              ]}
              yUnit="%"
            />
          </div>
          <div>
            <p className="text-[11px] text-ink-faint mb-2">Tegangan / Arus</p>
            <VoltageCurrentChart data={voltageCurrentData} />
          </div>
        </div>
      )}
    </CollapsibleChartCard>
  );
}