import { useNodes } from '../context/NodesContext';
import { ALL_NODE_IDS } from '../types';
import { OnlineBadge } from '../components/nodes/OnlineBadge';
import { Card, CardHeader } from '../components/common/Card';
import { FieldStateCard } from '../components/automation/FieldStateCard';
import { AutomationStatusCard } from '../components/automation/AutomationStatusCard';

export function Dashboard() {
  const { latest, online } = useNodes();

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <header>
          <h2 className="text-xl md:text-2xl font-display font-semibold text-ink">
            Ringkasan Sistem
          </h2>
          <p className="text-sm text-ink-faint mt-1">Status operasional seluruh node</p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FieldStateCard />
          <AutomationStatusCard />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {ALL_NODE_IDS.map((id) => {
            const data = latest[id];
            const isRelay = id === 1 || id === 2;

            return (
              <Card key={id}>
                <CardHeader
                  title={`Node ${id} ${isRelay ? '(Relay)' : '(Sensor LoRa)'}`}
                  right={<OnlineBadge info={online[id]} />}
                />
                <div className="mt-3">
                  {!data ? (
                    <p className="text-sm text-ink-faint italic">Belum ada data masuk</p>
                  ) : data.source === 'relay' ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-canvas p-3 rounded-lg border border-line">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-ink-faint">Status Solenoid</span>
                          <span className={`font-mono text-sm font-medium tabular-nums ${
                            data.solenoid_state === 1 ? 'text-ok' : 'text-ink'
                          }`}>
                            {data.solenoid_state === 1 ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[11px] text-ink-faint">Suhu Area</span>
                          <span className="font-mono text-sm text-ink tabular-nums">
                            {(data.temperature_c_x100 / 100).toFixed(1)}°C
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : data.source === 'sensor' ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-canvas p-3 rounded-lg border border-line">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-ink-faint">Level Air</span>
                          <span className="font-mono text-sm font-medium text-accent-strong tabular-nums">
                            {data.water_level}%
                          </span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[11px] text-ink-faint">Tegangan</span>
                          <span className="font-mono text-sm text-ink tabular-nums">
                            {(data.bus_voltage_mv / 1000).toFixed(2)} V
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}