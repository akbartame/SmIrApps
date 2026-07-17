import { formatRelativeTime } from '../../lib/format';
import type { NodeOnlineInfo } from '../../types';

// Deliberately takes NodeOnlineInfo (heartbeat's nodes.<id>) rather than a
// nodeId + latest-reading lookup — online/offline must come from the
// master's own view, not from "did we recently receive any packet".
export function OnlineBadge({ info }: { info: NodeOnlineInfo | undefined }) {
  const online = info?.online ?? false;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ${
        online ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'
      }`}
      title={info ? `seen ${formatRelativeTime(info.seen_ms_ago)}` : 'belum ada heartbeat'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-ok' : 'bg-danger'}`}
        aria-hidden
      />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
