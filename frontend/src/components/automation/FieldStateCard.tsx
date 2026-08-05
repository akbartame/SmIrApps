import { Card } from '../common/Card';
import { useAutomation } from '../../hooks/useAutomation';

function formatDate(timestamp: number | null) {
  return timestamp ? new Date(timestamp).toLocaleDateString('id-ID') : '–';
}

export function FieldStateCard() {
  const { fieldState, currentPhase, daysInPhase, daysSincePlanting } = useAutomation();

  if (!fieldState || !currentPhase) {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-ink-soft">Tidak ada musim aktif saat ini.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-ink-soft uppercase tracking-wide">Status Ladang</p>
          <h2 className="text-xl font-semibold capitalize text-ink">{currentPhase.name}</h2>
        </div>
        <div className="rounded-3xl bg-canvas px-4 py-2 text-xs text-ink-faint">
          Hari di fase
          <span className="block text-lg font-semibold text-ink mt-0.5">
            {daysInPhase ?? '-'}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl bg-canvas p-4">
          <p className="text-[11px] text-ink-faint uppercase tracking-wide">Hari sejak tanam</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{daysSincePlanting ?? '–'}</p>
        </div>
        <div className="rounded-3xl bg-canvas p-4">
          <p className="text-[11px] text-ink-faint uppercase tracking-wide">Tanggal tanam</p>
          <p className="mt-2 text-sm text-ink">{formatDate(fieldState.first_planting_date)}</p>
        </div>
      </div>
    </Card>
  );
}
