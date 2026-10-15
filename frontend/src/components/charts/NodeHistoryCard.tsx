import { useMemo } from 'react';
import { CollapsibleChartCard } from './CollapsibleChartCard';
import { HistoryChart } from './HistoryChart';
import { VoltageCurrentChart } from './VoltageCurrentChart';
import { OnlineBadge } from '../nodes/OnlineBadge';
import { useNodeHistory } from '../../hooks/useNodeHistory';
import { useNodes } from '../../context/NodesContext';
import { FLOW_CALIBRATION_CONSTANT } from '../../lib/format';
import type { HistoryBucket, RelayHistoryBucket, SensorHistoryBucket } from '../../types';

function isSensorBucket(point: HistoryBucket): point is SensorHistoryBucket {
  return 'voltage_v' in point;
}

function isRelayBucket(point: HistoryBucket): point is RelayHistoryBucket {
  return 'flow_pulses_first' in point;
}

// Flow rate for one bucket from its boundary cumulative counters.
// null = unknown (lone sample) or node rebooted inside the bucket.
function flowLitersPerMinute(bucket: RelayHistoryBucket): number | null {
  const { flow_pulses_first, flow_pulses_last, span_s, sample_count } = bucket;
  if (flow_pulses_first === null || flow_pulses_last === null) return null;
  if (span_s <= 0 || sample_count < 2) return null;
  const deltaPulses = flow_pulses_last - flow_pulses_first;
  if (deltaPulses < 0) return null;
  return Number((deltaPulses / span_s / FLOW_CALIBRATION_CONSTANT).toFixed(2));
}

export function NodeHistoryCard({ nodeId, rangeMs }: { nodeId: 1 | 2 | 3 | 4; rangeMs: number }) {
  const { online } = useNodes();
  const { points, loading, error } = useNodeHistory(nodeId, rangeMs);
  const isRelay = nodeId === 1 || nodeId === 2;

  const sensorBuckets = useMemo(() => points.filter(isSensorBucket), [points]);
  const relayBuckets = useMemo(() => points.filter(isRelayBucket), [points]);

  // Level air % bukan lagi dari field water_level firmware, melainkan
  // calibrated_water_level_pct yang diturunkan backend dari jarak mentah.
  const waterLevelData = useMemo(
    () =>
      sensorBuckets.map((p) => ({
        x: p.x,
        calibrated_water_level_pct: p.calibrated_water_level_pct,
      })),
    [sensorBuckets]
  );

  const voltageCurrentData = useMemo(
    () =>
      sensorBuckets.map((p) => ({
        x: p.x,
        voltage_v: p.voltage_v,
        current_ma: p.current_ma,
      })),
    [sensorBuckets]
  );

  const temperatureData = useMemo(
    () =>
      relayBuckets.map((p) => ({
        x: p.x,
        temperature_c: p.temperature_c,
      })),
    [relayBuckets]
  );

  const flowRateData = useMemo(
    () =>
      relayBuckets.map((p) => ({
        x: p.x,
        l_per_min: flowLitersPerMinute(p),
      })),
    [relayBuckets]
  );

  return (
    <CollapsibleChartCard
      title={`Node ${nodeId}`}
      subtitle={isRelay ? 'Relay — suhu & flow rate' : 'Sensor LoRa — level air & daya'}
      right={<OnlineBadge info={online[nodeId]} />}
      defaultOpen={true}
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
                { dataKey: 'calibrated_water_level_pct', name: 'Level Air', color: '#1B6B76' },
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
