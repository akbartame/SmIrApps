import { Card, CardHeader } from '../common/Card';
import { OnlineBadge } from './OnlineBadge';
import { SolenoidControl } from './SolenoidControl';
import { useNodes } from '../../context/NodesContext';
import { formatDistanceMm, formatTemperatureC, isDistanceReadable, isTemperatureReadable } from '../../lib/format';
import type { RelaySensorData } from '../../types';

export function RelayNodeCard({ nodeId }: { nodeId: 1 | 2 }) {
  const { latest, online } = useNodes();
  const data = latest[nodeId] as RelaySensorData | undefined;

  return (
    <Card>
      <CardHeader
        title={`Relay Node ${nodeId}`}
        subtitle="Solenoid + sensor tambahan"
        right={<OnlineBadge info={online[nodeId]} />}
      />
      {!data ? (
        <p className="text-sm text-ink-faint">Belum ada data masuk untuk node ini.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
          <Metric label="Jarak" value={formatDistanceMm(data.distance_mm)} muted={!isDistanceReadable(data.distance_mm)} />
          <Metric label="Suhu" value={formatTemperatureC(data.temperature_c_x100)} muted={!isTemperatureReadable(data.temperature_c_x100)} />
          <Metric label="Soil (raw)" value={String(data.soil_moisture_raw)} />
        </div>
      )}
      
      <SolenoidControl nodeId={nodeId} actualSolenoidState={data?.solenoid_state ?? 0} />
      
      {/* Tombol dan form konfigurasi mode Auto telah dihapus sesuai spesifikasi baru */}
    </Card>
  );
}

function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className={`font-mono text-[13px] ${muted ? 'text-ink-faint italic' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}