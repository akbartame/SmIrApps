import { Card, CardHeader } from '../common/Card';
import { OnlineBadge } from './OnlineBadge';
import { useNodes } from '../../context/NodesContext';
import {
  formatCurrent,
  formatVoltage,
  formatWaterLevel,
  formatSensorHealth,
  isPowerReadingReliable,
  isWaterReadingReliable,
} from '../../lib/format';
import type { LoraSensorData } from '../../types';

export function SensorNodeCard({ nodeId }: { nodeId: 3 | 4 }) {
  const { latest, online } = useNodes();
  const data = latest[nodeId] as LoraSensorData | undefined;

  const powerReliable = data ? isPowerReadingReliable(data.sensor_ok) : true;
  const waterReliable = data ? isWaterReadingReliable(data.sensor_ok) : true;
  const health = data ? formatSensorHealth(data.sensor_ok) : { powerMeter: '', waterSensor: '' };

  return (
    <Card>
      <CardHeader
        title={`Sensor Node ${nodeId}`}
        subtitle="LoRa — level air & daya (kirim saja)"
        right={<OnlineBadge info={online[nodeId]} />}
      />
      {!data ? (
        <p className="text-sm text-ink-faint">Belum ada data masuk untuk node ini.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-ink-faint">Level Air (Ultrasonik)</span>
              {!waterReliable && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn-soft text-warn font-medium">
                  Tidak reliable siklus ini
                </span>
              )}
            </div>
            <div className="font-mono text-lg text-accent-strong">
              {formatWaterLevel(data.water_level, data.water_distance_mm, data.sensor_ok)}
            </div>
            <p className="text-[10px] text-ink-faint mt-0.5">
              Jarak mentah: {data.water_distance_mm} mm (digunakan untuk verifikasi kalibrasi)
            </p>
          </div>

          <div className="pt-3 border-t border-line">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-ink-faint">Daya (INA226)</span>
              {!powerReliable && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn-soft text-warn font-medium">
                  Tidak reliable siklus ini
                </span>
              )}
            </div>
            <div className={`grid grid-cols-2 gap-3 text-sm font-mono ${!powerReliable ? 'opacity-40' : ''}`}>
              <span>{formatVoltage(data.bus_voltage_mv)}</span>
              <span>{formatCurrent(data.current_ma)}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11px] text-ink-faint border-t border-line">
            <span>
              boot_count: <span className="font-mono">{data.boot_count}</span>
            </span>
            <span title={`Status: ${health.powerMeter} | ${health.waterSensor}`}>
              sensor_ok: <span className="font-mono">0x{data.sensor_ok.toString(16)}</span>
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}