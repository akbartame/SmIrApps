import { useState, useEffect } from 'react';
import { useNodes } from '../../context/NodesContext';
import { api } from '../../lib/api';
import { AlertCircle } from 'lucide-react';

const MODE_LABEL: Record<number, string> = {
  0: 'Off',
  1: 'Manual',
};

export function SystemStatusBar() {
  const { masterStatus, wsStatus, publishCommand } = useNodes();
  const [sendingOff, setSendingOff] = useState(false);
  const [backendMqttOk, setBackendMqttOk] = useState(false);

  // Polling kesehatan backend untuk mendapatkan status koneksi MQTT-nya ke broker
  useEffect(() => {
    let mounted = true;
    const checkMqttHealth = async () => {
      try {
        const res = await api.getDiagnosticsHealth();
        if (mounted) setBackendMqttOk(res.mqtt_connected);
      } catch (err) {
        if (mounted) setBackendMqttOk(false);
      }
    };

    checkMqttHealth(); // Cek langsung saat mount
    const interval = setInterval(checkMqttHealth, 5000); // Polling setiap 5 detik
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function turnAllOff() {
    setSendingOff(true);
    try {
      await publishCommand({ mode: 0 });
    } finally {
      setSendingOff(false);
    }
  }

  // Determine overall system health for mobile compact view
  const wsConnected = wsStatus === 'open';
  const systemHealthy = wsConnected && backendMqttOk;

  return (
    <header className="bg-surface border-b border-line">
      {/* Desktop Layout — full information */}
      <div className="hidden md:block">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-semibold text-lg text-ink tracking-tight">
              SmIr Monitoring
            </h1>
            <p className="text-xs text-ink-faint mt-0.5">Live monitoring & kontrol irigasi</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Pill
              label="Realtime"
              ok={wsConnected}
              okText="Terhubung"
              badText={wsStatus === 'connecting' ? 'Menyambung…' : 'Terputus'}
            />
            <Pill
              label="MQTT Backend"
              ok={backendMqttOk}
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
              className="px-3 py-1.5 rounded-md border border-danger/30 text-danger text-xs font-medium hover:bg-danger-soft disabled:opacity-50 transition-colors"
            >
              {sendingOff ? 'Mengirim…' : 'Matikan Semua'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Compact Layout — badge + emergency button only */}
      <div className="md:hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium flex-shrink-0 ${
                systemHealthy
                  ? 'bg-ok-soft text-ok'
                  : 'bg-danger-soft text-danger'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${systemHealthy ? 'bg-ok' : 'bg-danger'}`} aria-hidden />
              {systemHealthy ? 'Online' : 'Offline'}
            </span>
          </div>
          <button
            type="button"
            disabled={sendingOff}
            onClick={turnAllOff}
            title="Mematikan seluruh sistem (mode 0)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-danger-soft text-danger text-xs font-medium hover:bg-danger/20 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{sendingOff ? 'Mengirim…' : 'Off'}</span>
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