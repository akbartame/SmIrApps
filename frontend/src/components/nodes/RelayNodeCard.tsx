import { useState } from 'react';
import { Card, CardHeader } from '../common/Card';
import { OnlineBadge } from './OnlineBadge';
import { SolenoidControl } from './SolenoidControl';
import { useNodes } from '../../context/NodesContext';
import { formatDistanceMm, formatTemperatureC, isDistanceReadable, isTemperatureReadable } from '../../lib/format';
import type { RelaySensorData } from '../../types';

export function RelayNodeCard({ nodeId }: { nodeId: 1 | 2 }) {
  const { latest, online, publishCommand } = useNodes();
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoOn, setAutoOn] = useState(70);
  const [autoOff, setAutoOff] = useState(30);
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  const data = latest[nodeId] as RelaySensorData | undefined;

  async function submitAuto() {
    setAutoSubmitting(true);
    try {
      await publishCommand({
        mode: 2,
        target_node_id: nodeId,
        solenoid_state: data?.solenoid_state ?? 0,
        auto_on_level: autoOn,
        auto_off_level: autoOff,
      });
      setAutoOpen(false);
    } finally {
      setAutoSubmitting(false);
    }
  }

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

      <button
        type="button"
        onClick={() => setAutoOpen((v) => !v)}
        className="mt-3 text-xs text-accent hover:text-accent-strong font-medium"
      >
        {autoOpen ? 'Tutup pengaturan auto' : 'Atur mode auto (berdasarkan level air)'}
      </button>

      {autoOpen && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          <p className="text-[11px] text-ink-faint">
            Mengirim mode ini akan mengubah mode sistem menjadi Auto (global) — lihat catatan di
            header.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-soft w-16">ON di</label>
            <input
              type="number"
              min={0}
              max={100}
              value={autoOn}
              onChange={(e) => setAutoOn(Number(e.target.value))}
              className="flex-1 border border-line rounded-md px-2 py-1 text-sm font-mono"
            />
            <span className="text-xs text-ink-faint">%</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-soft w-16">OFF di</label>
            <input
              type="number"
              min={0}
              max={100}
              value={autoOff}
              onChange={(e) => setAutoOff(Number(e.target.value))}
              className="flex-1 border border-line rounded-md px-2 py-1 text-sm font-mono"
            />
            <span className="text-xs text-ink-faint">%</span>
          </div>
          <button
            type="button"
            disabled={autoSubmitting}
            onClick={submitAuto}
            className="w-full py-1.5 rounded-md bg-accent text-white text-sm font-medium disabled:opacity-50"
          >
            {autoSubmitting ? 'Mengirim…' : 'Terapkan'}
          </button>
        </div>
      )}
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
