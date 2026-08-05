import { useMemo, useState } from 'react';
import { Card } from '../common/Card';
import { useAutomation } from '../../hooks/useAutomation';
import { PhaseEditorModal } from './PhaseEditorModal';

export function PhaseConfigPanel() {
  const {
    phases,
    createCustomPhase,
    updatePhase,
    deleteCustomPhase,
  } = useAutomation();

  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const systemPhases = useMemo(
    () => phases.filter((phase) => phase.is_system_phase),
    [phases]
  );
  const customPhases = useMemo(
    () => phases.filter((phase) => !phase.is_system_phase),
    [phases]
  );

  return (
    <Card className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Konfigurasi Fase</h2>
          <p className="text-sm text-ink-faint">Kelola fase otomatisasi dan batas air.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-2xl bg-ok px-4 py-2 text-sm font-semibold text-white transition hover:bg-ok-dark"
        >
          + Tambah Fase Kustom
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Fase Standar</h3>
          <p className="text-xs text-ink-faint">Fase sistem tidak dapat dihapus.</p>
          <div className="mt-3 space-y-3">
            {systemPhases.map((phase) => (
              <div key={phase.id} className="rounded-3xl bg-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium capitalize text-ink">{phase.name}</p>
                    <p className="text-xs text-ink-faint">
                      {phase.min_water_level_pct}–{phase.max_water_level_pct}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPhaseId(phase.id)}
                    className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink transition hover:border-ok"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Fase Kustom</h3>
              <p className="text-xs text-ink-faint">Fase yang dapat diubah dan dihapus.</p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {customPhases.length > 0 ? (
              customPhases.map((phase) => (
                <div key={phase.id} className="rounded-3xl bg-canvas p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium capitalize text-ink">{phase.name}</p>
                      <p className="text-xs text-ink-faint">
                        {phase.min_water_level_pct}–{phase.max_water_level_pct}%
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPhaseId(phase.id)}
                        className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink transition hover:border-ok"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCustomPhase(phase.id)}
                        className="rounded-full border border-danger/30 px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-faint">Belum ada fase kustom.</p>
            )}
          </div>
        </div>
      </div>

      {editingPhaseId !== null && (
        <PhaseEditorModal
          phaseId={editingPhaseId}
          onClose={() => setEditingPhaseId(null)}
          onSave={async (id, data) => {
            if (id !== null) await updatePhase(id, data);
          }}
        />
      )}

      {showCreateModal && (
        <PhaseEditorModal
          isCreating
          onClose={() => setShowCreateModal(false)}
          onSave={async (_, data) => {
            await createCustomPhase(data);
          }}
        />
      )}
    </Card>
  );
}
