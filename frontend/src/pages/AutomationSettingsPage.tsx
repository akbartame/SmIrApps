import { useMemo, useState } from 'react';
import { useAutomation } from '../hooks/useAutomation';
import { PhaseConfigPanel } from '../components/automation/PhaseConfigPanel';
import { EventLogViewer } from '../components/automation/EventLogViewer';
import { PhaseTransitionModal } from '../components/automation/PhaseTransitionModal';

export function AutomationSettingsPage() {
  const {
    fieldState,
    currentPhase,
    phases,
    startSeason,
    nextPhase,
  } = useAutomation();
  const [showPhaseTransition, setShowPhaseTransition] = useState(false);

  const nextPhaseCandidate = useMemo(() => {
    if (!currentPhase) return null;
    const sorted = [...phases].sort((a, b) => a.order_index - b.order_index);
    const currentIndex = sorted.findIndex((phase) => phase.id === currentPhase.id);
    return currentIndex >= 0 && currentIndex < sorted.length - 1
      ? sorted[currentIndex + 1]
      : null;
  }, [currentPhase, phases]);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-8">
        <header className="space-y-3">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-semibold text-ink">
              Pengaturan Otomasi
            </h2>
            <p className="text-sm text-ink-faint mt-1">
              Konfigurasi fase, laju respons, dan status otomasi.
            </p>
          </div>
        </header>

        {!fieldState?.first_planting_date ? (
          <div className="rounded-3xl bg-info-soft p-6">
            <p className="text-sm text-ink-faint">
              Belum ada musim aktif. Mulai musim baru untuk mengaktifkan fase otomatis.
            </p>
            <button
              type="button"
              onClick={startSeason}
              className="mt-4 inline-flex items-center justify-center rounded-2xl bg-ok px-4 py-3 text-sm font-semibold text-white transition hover:bg-ok-dark"
            >
              Mulai Musim
            </button>
          </div>
        ) : (
          <div className="rounded-3xl bg-canvas p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-faint">Fase saat ini</p>
                <h3 className="mt-2 text-xl font-semibold capitalize text-ink">
                  {currentPhase?.name ?? '–'}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextPhaseCandidate ? (
                  <button
                    type="button"
                    onClick={() => setShowPhaseTransition(true)}
                    className="rounded-2xl bg-ok px-4 py-3 text-sm font-semibold text-white transition hover:bg-ok-dark"
                  >
                    ⏭️ Fase Berikutnya
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startSeason}
                    className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90"
                  >
                    🔄 Mulai Ulang Musim
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <PhaseConfigPanel />
        <EventLogViewer />
      </div>

      {showPhaseTransition && currentPhase && nextPhaseCandidate && (
        <PhaseTransitionModal
          currentPhase={currentPhase}
          nextPhase={nextPhaseCandidate}
          isOpen={showPhaseTransition}
          onConfirm={async () => {
            await nextPhase();
            setShowPhaseTransition(false);
          }}
          onCancel={() => setShowPhaseTransition(false)}
        />
      )}
    </div>
  );
}
