import { useState } from 'react';
import { SensorNodeCard } from '../components/nodes/SensorNodeCard';
import { NodeHistoryCard } from '../components/charts/NodeHistoryCard';
import { TimeRangePicker, DEFAULT_RANGE_MS } from '../components/charts/TimeRangePicker';
import { SENSOR_NODE_IDS } from '../types';

export function SensorPage() {
  const [rangeMs, setRangeMs] = useState(DEFAULT_RANGE_MS);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-semibold text-ink">
              Pemantauan Sensor LoRa
            </h2>
            <p className="text-sm text-ink-faint mt-1">
              Level air (ultrasonik) dan daya baterai (INA226)
            </p>
          </div>
          <div className="md:ml-auto">
            <TimeRangePicker value={rangeMs} onChange={setRangeMs} />
          </div>
        </header>

        {/* Ringkasan Angka Terkini — single column on mobile */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {SENSOR_NODE_IDS.map((id) => (
            <SensorNodeCard key={id} nodeId={id} />
          ))}
        </section>

        {/* Grafik Historis — collapsed on mobile by default */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {SENSOR_NODE_IDS.map((id) => (
            <NodeHistoryCard key={id} nodeId={id} rangeMs={rangeMs} />
          ))}
        </section>
      </div>
    </div>
  );
}