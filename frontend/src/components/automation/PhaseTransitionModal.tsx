import { Card } from '../common/Card';
import type { PlantPhase } from '../../types/automation';

const PHASE_TIPS: Record<string, string> = {
  vegetatif: 'Fase vegetatif membutuhkan air 5–10 cm secara konsisten. Biasanya berlangsung 35 hari.',
  primordia: '⚠️ Primordia adalah fase kritis untuk inisiasi pani. Jangan biarkan air terlalu rendah!',
  pengisian: 'Pengisian bulir membutuhkan air 15–20 cm penuh. Jangan dihentikan di fase ini.',
  pematangan: 'Drainase alami akan terjadi. Solenoid akan OFF. Periksa apakah tanaman siap dipanen.',
};

const PHASE_DURATIONS: Record<string, number> = {
  vegetatif: 35,
  primordia: 20,
  pengisian: 25,
  pematangan: 15,
};

export function PhaseTransitionModal({
  currentPhase,
  nextPhase,
  isOpen,
  onConfirm,
  onCancel,
}: {
  currentPhase: PlantPhase;
  nextPhase: PlantPhase;
  isOpen: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  const tip = PHASE_TIPS[nextPhase.name] ?? null;
  const typicalDuration = PHASE_DURATIONS[nextPhase.name] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <Card className="w-full max-w-2xl space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-ink">Lanjut ke fase berikutnya?</h2>
          <p className="text-sm text-ink-faint">
            Anda akan berpindah dari <strong className="capitalize">{currentPhase.name}</strong> ke{' '}
            <strong className="capitalize text-ok">{nextPhase.name}</strong>.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl bg-canvas p-4">
            <p className="text-xs uppercase tracking-wide text-ink-faint">Target air</p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {nextPhase.min_water_level_pct}–{nextPhase.max_water_level_pct}%
            </p>
          </div>
          {typicalDuration !== null ? (
            <div className="rounded-3xl bg-canvas p-4">
              <p className="text-xs uppercase tracking-wide text-ink-faint">Durasi tipikal</p>
              <p className="mt-2 text-sm font-semibold text-ink">{typicalDuration} hari</p>
            </div>
          ) : null}
        </div>

        {tip ? (
          <div className={`rounded-3xl p-4 ${tip.includes('⚠️') ? 'bg-warn-soft text-warn' : 'bg-info-soft text-ink'}`}>
            <p className="text-sm">{tip}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-line bg-canvas px-4 py-3 text-sm font-semibold text-ink transition hover:border-ink"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-2xl bg-ok px-4 py-3 text-sm font-semibold text-white transition"
          >
            Lanjutkan
          </button>
        </div>
      </Card>
    </div>
  );
}
