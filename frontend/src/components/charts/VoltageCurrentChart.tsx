import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatClockTime } from '../../lib/format';

/**
 * Dual-axis chart for voltage and current from INA226 sensor (sensor nodes 3–4).
 *
 * Voltage (bus_voltage_mv): Median of 5 samples, plotted in volts (converted from mV).
 * Current (current_ma): Median of 5 samples, already in milliamps (no conversion needed)[cite: 3].
 * Negative current indicates power drain direction.
 * 
 * Data points filtered by sensor_ok bit0 (INA226 OK) are pre-processed to null 
 * if unreliable, ensuring clean gaps in the chart.
 */
export function VoltageCurrentChart({
  data,
}: {
  data: { x: number; voltage_v: number | null; current_ma: number | null }[];
}) {
  if (data.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-xs text-ink-faint">
        Belum ada data pada rentang ini
      </div>
    );
  }

  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E1E7E7" vertical={false} />
          <XAxis
            dataKey="x"
            tickFormatter={(v) => formatClockTime(v)}
            tick={{ fontSize: 10, fill: '#8A9A9D' }}
            axisLine={{ stroke: '#E1E7E7' }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            yAxisId="v"
            tick={{ fontSize: 10, fill: '#1B6B76' }}
            axisLine={false}
            tickLine={false}
            width={32}
            unit="V"
          />
          <YAxis
            yAxisId="ma"
            orientation="right"
            tick={{ fontSize: 10, fill: '#B8790F' }}
            axisLine={false}
            tickLine={false}
            width={40}
            unit="mA"
          />
          <Tooltip
            labelFormatter={(v) => formatClockTime(Number(v))}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid #E1E7E7',
              boxShadow: '0 2px 8px rgba(19,26,28,0.08)',
            }}
          />
          <Line
            yAxisId="v"
            type="monotone"
            dataKey="voltage_v"
            name="Tegangan"
            stroke="#1B6B76"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            yAxisId="ma"
            type="monotone"
            dataKey="current_ma"
            name="Arus"
            stroke="#B8790F"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}