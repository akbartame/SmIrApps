import { useState } from 'react';
import { RelayNodeCard } from '../components/nodes/RelayNodeCard';
import { NodeHistoryCard } from '../components/charts/NodeHistoryCard';
import { TimeRangePicker, DEFAULT_RANGE_MS } from '../components/charts/TimeRangePicker';
import { RELAY_NODE_IDS } from '../types';

export function ControlPage() {
  const [rangeMs, setRangeMs] = useState(DEFAULT_RANGE_MS);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-semibold text-ink">
              Kontrol Aktuator
            </h2>
            <p className="text-sm text-ink-faint mt-1">
              Manajemen katup solenoid dan laju aliran air
            </p>
          </div>
          <div className="md:ml-auto">
            <TimeRangePicker value={rangeMs} onChange={setRangeMs} />
          </div>
        </header>

        {/* Panel Eksekusi Kontrol — single column on mobile */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {RELAY_NODE_IDS.map((id) => (
            <RelayNodeCard key={id} nodeId={id} />
          ))}
        </section>

        {/* Grafik Historis Mekanis — collapsed on mobile by default */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {RELAY_NODE_IDS.map((id) => (
            <NodeHistoryCard key={id} nodeId={id} rangeMs={rangeMs} />
          ))}
        </section>
      </div>
    </div>
  );
}