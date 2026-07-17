import { Card, CardHeader } from '../common/Card';
import { OnlineBadge } from './OnlineBadge';
import { useNodes } from '../../context/NodesContext';
import { formatCurrent, formatVoltage, isPowerReadingReliable } from '../../lib/format';
import type { LoraSensorData } from '../../types';

export function SensorNodeCard({ nodeId }: { nodeId: 3 | 4 }) {
  const { latest, online } = useNodes();
  const data = latest[nodeId] as LoraSensorData | undefined;
  const powerReliable = data ? isPowerReadingReliable(data.sensor_ok) : true;

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
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] text-ink-faint">Level Air A</div>
              <div className="font-mono text-lg text-accent-strong">{data.water_level_a}%</div>
            </div>
            <div>
              <div className="text-[11px] text-ink-faint">Level Air B</div>
              <div className="font-mono text-lg text-accent-strong">{data.water_level_b}%</div>
            </div>
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

          <div className="pt-2 text-[11px] text-ink-faint">
            boot_count: <span className="font-mono">{data.boot_count}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
