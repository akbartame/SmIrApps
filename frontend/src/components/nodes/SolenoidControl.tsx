import { useEffect, useState } from 'react';
import { useNodes } from '../../context/NodesContext';
import type { CommandRecord } from '../../types';

const WAITING_STATUSES: CommandRecord['status'][] = ['pending', 'not_confirmed'];

export function SolenoidControl({
  nodeId,
  actualSolenoidState,
}: {
  nodeId: 1 | 2;
  actualSolenoidState: 0 | 1;
}) {
  const { commands, publishCommand } = useNodes();
  const [trackedCommandId, setTrackedCommandId] = useState<number | null>(null);

  const tracked = trackedCommandId ? commands[trackedCommandId] : undefined;
  const isWaiting = tracked ? WAITING_STATUSES.includes(tracked.status) : false;

  // Once a tracked command reaches a terminal state, stop tracking it after
  // a short grace period so the UI settles back to reflecting ground truth
  // (actualSolenoidState) rather than lingering on a stale result banner.
  useEffect(() => {
    if (!tracked) return;
    if (WAITING_STATUSES.includes(tracked.status)) return;
    const t = setTimeout(() => setTrackedCommandId(null), 4000);
    return () => clearTimeout(t);
  }, [tracked]);

  async function sendCommand(desired: 0 | 1) {
    const cmd = await publishCommand({ mode: 1, target_node_id: nodeId, solenoid_state: desired });
    setTrackedCommandId(cmd.id);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isWaiting}
          onClick={() => sendCommand(1)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            actualSolenoidState === 1 && !isWaiting
              ? 'bg-ok text-white'
              : 'bg-canvas text-ink-soft border border-line hover:border-ok'
          }`}
        >
          ON
        </button>
        <button
          type="button"
          disabled={isWaiting}
          onClick={() => sendCommand(0)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            actualSolenoidState === 0 && !isWaiting
              ? 'bg-ink text-white'
              : 'bg-canvas text-ink-soft border border-line hover:border-ink'
          }`}
        >
          OFF
        </button>
      </div>

      <div className="mt-2 h-4 text-xs">
        {isWaiting && (
          <span className="flex items-center gap-1.5 text-warn">
            <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" aria-hidden />
            Menunggu konfirmasi…
          </span>
        )}
        {tracked?.status === 'send_failed' && (
          <span className="text-danger">Perintah gagal terkirim — coba lagi</span>
        )}
        {tracked?.status === 'stale' && (
          <span className="text-danger">Tidak ada konfirmasi — periksa koneksi node</span>
        )}
        {tracked?.status === 'confirmed' && (
          <span className="text-ok">Dikonfirmasi</span>
        )}
      </div>
    </div>
  );
}
