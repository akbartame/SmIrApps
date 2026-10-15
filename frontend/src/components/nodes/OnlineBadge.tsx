import { formatDurationMsAgo } from '../../lib/format';
import type { NodeOnlineInfo } from '../../types';

// Deliberately takes NodeOnlineInfo (heartbeat's nodes.<id>) rather than a
// nodeId + latest-reading lookup — online/offline must come from the
// master's own view, not from "did we recently receive any packet".
// The master's seen_ms_ago is a duration (not a timestamp), so it is
// rendered with formatDurationMsAgo — visible text too, so it also works
// on touch devices (no tooltip hover).
export function OnlineBadge({ info }: { info: NodeOnlineInfo | undefined }) {
  const online = info?.online ?? false;
  const seenMsAgo = info?.seen_ms_ago;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ${
        online ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'
      }`}
      title={info ? `seen ${formatDurationMsAgo(seenMsAgo)}` : 'belum ada heartbeat'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-ok' : 'bg-danger'}`}
        aria-hidden
      />
      {online ? 'Online' : 'Offline'}
      {seenMsAgo !== null && seenMsAgo !== undefined && (
        <span className="opacity-70" aria-label="terakhir terlihat">
          · {formatDurationMsAgo(seenMsAgo)}
        </span>
      )}
    </span>
  );
}
