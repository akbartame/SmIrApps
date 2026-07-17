import { useState } from 'react';
import { NodesProvider, useNodes } from './context/NodesContext';
import { SystemStatusBar } from './components/layout/SystemStatusBar';
import { RelayNodeCard } from './components/nodes/RelayNodeCard';
import { SensorNodeCard } from './components/nodes/SensorNodeCard';
import { NodeHistoryCard } from './components/charts/NodeHistoryCard';
import { TimeRangePicker, DEFAULT_RANGE_MS } from './components/charts/TimeRangePicker';
import { ALL_NODE_IDS } from './types';

function Dashboard() {
  const { bootstrapped, bootstrapError } = useNodes();
  const [rangeMs, setRangeMs] = useState(DEFAULT_RANGE_MS);

  if (!bootstrapped) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16 text-center text-ink-faint text-sm">
        Memuat data awal…
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
      {bootstrapError && (
        <div className="bg-danger-soft text-danger text-sm rounded-lg px-4 py-3">
          Gagal memuat data awal dari backend: {bootstrapError}. Data akan tetap masuk lewat
          koneksi realtime begitu tersedia.
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display font-semibold text-base text-ink">Live Monitoring</h2>
            <p className="text-xs text-ink-faint mt-0.5">
              Level air, suhu, flow rate, dan tegangan/arus per node
            </p>
          </div>
          <TimeRangePicker value={rangeMs} onChange={setRangeMs} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {ALL_NODE_IDS.map((id) => (
            <NodeHistoryCard key={id} nodeId={id} rangeMs={rangeMs} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display font-semibold text-base text-ink mb-4">Kontrol Relay</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
          <RelayNodeCard nodeId={1} />
          <RelayNodeCard nodeId={2} />
        </div>
      </section>

      <section>
        <h2 className="font-display font-semibold text-base text-ink mb-4">Sensor Node (Ringkasan)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
          <SensorNodeCard nodeId={3} />
          <SensorNodeCard nodeId={4} />
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <NodesProvider>
      <SystemStatusBar />
      <Dashboard />
    </NodesProvider>
  );
}
