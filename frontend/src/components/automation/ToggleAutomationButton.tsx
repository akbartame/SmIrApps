import { useState } from 'react';
import { useAutomation } from '../../hooks/useAutomation';

export function ToggleAutomationButton() {
  const { automationState, toggleAutomation } = useAutomation();
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    if (!automationState) return;
    setIsLoading(true);
    try {
      await toggleAutomation(!automationState.enabled);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading || !automationState}
      className={`relative inline-flex h-9 w-16 items-center rounded-full transition ${
        automationState?.enabled ? 'bg-ok' : 'bg-ink-soft'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`inline-block h-7 w-7 rounded-full bg-white shadow-sm transition-transform ${
          automationState?.enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
