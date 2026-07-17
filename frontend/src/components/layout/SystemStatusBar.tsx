import { useState } from 'react';
import { useNodes } from '../../context/NodesContext';

const MODE_LABEL: Record<number, string> = {
  0: 'Off',
  1: 'Manual',
  2: 'Auto',
};

export function SystemStatusBar() {
  const { masterStatus, wsStatus, publishCommand } = useNodes();
  const [sendingOff, setSendingOff] = useState(false);

  async function turnAllOff() {
    setSendingOff(true);
    try {
      await publishCommand({ mode: 0 });
    } finally {
      setSendingOff(false);
    }
  }

  return (
    <header className="sticky top-0 z-10 bg-canvas/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-semibold text-lg text-ink tracking-tight">
            SmIr Monitoring
          </h1>
          <p className="text-xs text-ink-faint mt-0.5">Live monitoring & kontrol irigasi</p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <Pill
            label="Realtime"
            ok={wsStatus === 'open'}
            okText="Terhubung"
            badText={wsStatus === 'connecting' ? 'Menyambung…' : 'Terputus'}
          />
          <Pill
            label="MQTT"
            ok={masterStatus?.mqtt_connected ?? false}
            okText="Terhubung"
            badText="Terputus"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-ink-faint">Mode sistem</span>
            <span className="font-medium text-ink px-2 py-0.5 rounded-full bg-accent-soft text-accent-strong">
              {masterStatus ? MODE_LABEL[masterStatus.mode] ?? masterStatus.mode : '—'}
            </span>
          </div>

          <button
            type="button"
            disabled={sendingOff}
            onClick={turnAllOff}
            title="Mengirim mode 0 — mematikan seluruh sistem secara global"
            className="px-3 py-1.5 rounded-md border border-danger/30 text-danger text-xs font-medium hover:bg-danger-soft disabled:opacity-50"
          >
            {sendingOff ? 'Mengirim…' : 'Matikan Semua'}
          </button>
        </div>
      </div>
    </header>
  );
}

function Pill({
  label,
  ok,
  okText,
  badText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-faint">{label}</span>
      <span
        className={`flex items-center gap-1 font-medium px-2 py-0.5 rounded-full ${
          ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-ok' : 'bg-danger'}`} aria-hidden />
        {ok ? okText : badText}
      </span>
    </div>
  );
}
