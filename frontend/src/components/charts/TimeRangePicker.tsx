const RANGES = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1j', ms: 60 * 60_000 },
  { label: '6j', ms: 6 * 60 * 60_000 },
  { label: '24j', ms: 24 * 60 * 60_000 },
  { label: '7h', ms: 7 * 24 * 60 * 60_000 },
] as const;

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (ms: number) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 bg-canvas">
      {RANGES.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={() => onChange(r.ms)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === r.ms ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink-soft'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export const DEFAULT_RANGE_MS = RANGES[1].ms; // 1 jam
