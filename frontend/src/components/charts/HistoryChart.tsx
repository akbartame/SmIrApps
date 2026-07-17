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

export type ChartLine = {
  dataKey: string;
  name: string;
  color: string;
};

export function HistoryChart({
  data,
  lines,
  yUnit,
  emptyLabel = 'Belum ada data pada rentang ini',
}: {
  data: Record<string, number | null>[];
  lines: ChartLine[];
  yUnit?: string;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-xs text-ink-faint">
        {emptyLabel}
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
            tick={{ fontSize: 10, fill: '#8A9A9D' }}
            axisLine={false}
            tickLine={false}
            width={36}
            unit={yUnit}
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
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
