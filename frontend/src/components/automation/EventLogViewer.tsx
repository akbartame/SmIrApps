import { useMemo, useState } from 'react';
import { ChevronDown, History, AlertCircle, AlertTriangle } from 'lucide-react';
import { Card } from '../common/Card';
import { useAutomation } from '../../hooks/useAutomation';
import type { AutomationEvent } from '../../types/automation';
import { formatRelativeTime } from '../../lib/format';

const SEVERITY_OPTIONS = ['all', 'info', 'warn', 'error'] as const;

type SeverityOption = (typeof SEVERITY_OPTIONS)[number];

export function EventLogViewer() {
  const { events, resolveEvent } = useAutomation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityOption>('all');

  const filteredEvents = useMemo(
    () =>
      events.filter((event) =>
        severityFilter === 'all' ? true : event.severity === severityFilter
      ),
    [events, severityFilter]
  );

  const unresolvedCount = useMemo(
    () => events.filter((event) => !event.resolved_at).length,
    [events]
  );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-3xl bg-canvas px-4 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <History className="h-4 w-4 text-ink-faint" />
          <div>
            <p className="text-sm font-semibold text-ink">Catatan Otomasi</p>
            <p className="text-xs text-ink-faint">{unresolvedCount} acara belum diselesaikan</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {SEVERITY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSeverityFilter(option)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  severityFilter === option
                    ? 'bg-ok text-white'
                    : 'bg-canvas text-ink border border-line'
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => (
                <EventLogItem key={event.id} event={event} onResolve={() => resolveEvent(event.id)} />
              ))
            ) : (
              <p className="text-sm text-ink-faint">Tidak ada acara.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function EventLogItem({
  event,
  onResolve,
}: {
  event: AutomationEvent;
  onResolve: () => void;
}) {
  const isError = event.severity === 'error';
  const Icon = isError ? AlertCircle : AlertTriangle;
  const bgClass = isError ? 'bg-danger-soft text-danger' : event.severity === 'warn' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-ink';

  return (
    <div className={`rounded-3xl p-4 ${bgClass}`}>
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">{event.message}</p>
          <p className="mt-1 text-xs text-ink-faint">{formatRelativeTime(event.triggered_at)}</p>
        </div>
        {!event.resolved_at ? (
          <button
            type="button"
            onClick={onResolve}
            className="rounded-full border border-ok px-3 py-1 text-xs font-semibold text-ok transition hover:bg-ok/10"
          >
            Atur
          </button>
        ) : null}
      </div>
    </div>
  );
}
