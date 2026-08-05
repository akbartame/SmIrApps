import { useEffect, useState } from 'react';
import { useAutomation } from './useAutomation';

const PHASE_DURATIONS: Record<string, number> = {
  vegetatif: 35,
  primordia: 20,
  pengisian: 25,
  pematangan: 15,
};

function getDaysSince(timestamp: number | null | undefined) {
  if (!timestamp) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

export function usePhaseTimer() {
  const { fieldState, currentPhase } = useAutomation();
  const [daysInPhase, setDaysInPhase] = useState(() =>
    getDaysSince(fieldState?.phase_started_at)
  );

  useEffect(() => {
    if (!fieldState?.phase_started_at) {
      setDaysInPhase(0);
      return;
    }

    const update = () => {
      setDaysInPhase(getDaysSince(fieldState.phase_started_at));
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [fieldState?.phase_started_at]);

  return {
    daysInPhase,
    typicalDurationDays:
      currentPhase?.name
        ? PHASE_DURATIONS[currentPhase.name] ?? null
        : null,
  };
}
