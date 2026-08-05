import { AlertTriangle } from 'lucide-react';
import { Card } from '../common/Card';
import { useAutomation } from '../../hooks/useAutomation';
import { formatRelativeTime } from '../../lib/format';
import { ToggleAutomationButton } from './ToggleAutomationButton.tsx';

export function AutomationStatusCard() {
  const { currentPhase, automationState, sensorHealth } = useAutomation();

  if (!automationState) {
    return (
      <Card>
        <p className="text-sm text-ink-soft">Status otomasi belum tersedia.</p>
      </Card>
    );
  }

  const sensorStale = (sensorHealth?.last_update_ms_ago ?? 0) > 30000;
  const solenoidLabel = automationState.last_solenoid_state === 1 ? 'ON' : 'OFF';
  const targetRange = currentPhase
    ? `${currentPhase.min_water_level_pct}–${currentPhase.max_water_level_pct}%`
    : '–';

  return (
    <Card className="space-y-5 border-l-4 border-ok/70">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-ink-faint uppercase tracking-wide">Otomasi Air</p>
          <h2 className="text-lg font-semibold text-ink">{automationState.enabled ? 'Aktif' : 'Nonaktif'}</h2>
        </div>
        <ToggleAutomationButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-canvas p-4">
          <p className="text-[11px] text-ink-faint uppercase tracking-wide">Target</p>
          <p className="mt-2 text-sm font-semibold text-ink">{targetRange}</p>
        </div>
        <div className="rounded-3xl bg-canvas p-4">
          <p className="text-[11px] text-ink-faint uppercase tracking-wide">Tingkat air</p>
          <p className="mt-2 text-lg font-semibold text-ok">{automationState.last_water_level}%</p>
        </div>
        <div className="rounded-3xl bg-canvas p-4">
          <p className="text-[11px] text-ink-faint uppercase tracking-wide">Solenoid</p>
          <p className={`mt-2 text-lg font-semibold ${solenoidLabel === 'ON' ? 'text-ok' : 'text-ink-faint'}`}>
            {solenoidLabel}
          </p>
        </div>
      </div>

      {sensorStale && (
        <div className="flex items-center gap-2 rounded-3xl bg-warn-soft p-4 text-sm text-warn">
          <AlertTriangle className="h-4 w-4" />
          <p>Data sensor terlambat {Math.round((sensorHealth?.last_update_ms_ago ?? 0) / 1000)} detik.</p>
        </div>
      )}

      <p className="text-xs text-ink-faint">Pengecekan terakhir: {formatRelativeTime(automationState.last_check_at)}</p>
    </Card>
  );
}
