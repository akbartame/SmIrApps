import { useEffect, useMemo, useState } from 'react';
import { Card } from '../common/Card';
import { useAutomation } from '../../hooks/useAutomation';
import type { PhaseInput, PlantPhase } from '../../context/AutomationContext';

export function PhaseEditorModal({
  phaseId,
  isCreating = false,
  onClose,
  onSave,
}: {
  phaseId?: number;
  isCreating?: boolean;
  onClose: () => void;
  onSave: (id: number | null, data: PhaseInput) => Promise<void>;
}) {
  const { phases } = useAutomation();
  const phase = useMemo(
    () => (phaseId ? phases.find((item) => item.id === phaseId) ?? null : null),
    [phaseId, phases]
  );

  const [form, setForm] = useState<PhaseInput>({
    name: '',
    min_water_level_pct: 0,
    max_water_level_pct: 50,
  });

  useEffect(() => {
    if (phase) {
      setForm({
        name: phase.name,
        min_water_level_pct: phase.min_water_level_pct,
        max_water_level_pct: phase.max_water_level_pct,
      });
    }
  }, [phase]);

  const isValid = useMemo(
    () =>
      form.min_water_level_pct < form.max_water_level_pct &&
      (!isCreating || form.name.trim().length > 0),
    [form, isCreating]
  );

  const handleSave = async () => {
    if (!isValid) return;
    await onSave(phaseId ?? null, form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <Card className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-ink">
            {isCreating ? 'Buat Fase Baru' : `Edit fase: ${phase?.name ?? '–'}`}
          </h2>
          <p className="text-sm text-ink-faint">
            Atur ambang batas air dan nama fase. Nama hanya dapat diubah untuk fase kustom.
          </p>
        </div>

        {isCreating && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Nama fase
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-ok"
              placeholder="misal: vegetatif"
            />
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Air minimum: {form.min_water_level_pct}%
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={form.min_water_level_pct}
              onChange={(event) =>
                setForm({
                  ...form,
                  min_water_level_pct: Number(event.target.value),
                })
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Air maksimum: {form.max_water_level_pct}%
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={form.max_water_level_pct}
              onChange={(event) =>
                setForm({
                  ...form,
                  max_water_level_pct: Number(event.target.value),
                })
              }
              className="w-full"
            />
          </div>
        </div>

        {!isValid && (
          <p className="text-sm text-danger">Pastikan nilai minimum lebih kecil dari maksimum.</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-line bg-canvas px-4 py-3 text-sm font-semibold text-ink transition hover:border-ink"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className="flex-1 rounded-2xl bg-ok px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
          >
            Simpan
          </button>
        </div>
      </Card>
    </div>
  );
}
