import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import type { ChartPoint, MetricKey } from '../hooks/useHistory'
import {
  TEMP_MIN_C,
  TEMP_MAX_C,
  HUMIDITY_MIN,
  HUMIDITY_MAX,
  GAS_PPM_WARNING,
  CHART_HEIGHT,
  CHART_MARGIN,
} from '../constant'
// import { cn } from '../utils/cn'

// ── Per-metric config ─────────────────────────────────────

interface MetricConfig {
  label:     string
  unit:      string
  color:     string
  refLines?: { value: number; label: string; color: string }[]
  domain?:   [number | 'auto', number | 'auto']
  decimals:  number
}

const METRIC_CONFIG: Record<MetricKey, MetricConfig> = {
  temperature_c: {
    label:  'Temperature',
    unit:   '°C',
    color:  '#f5a623', // Raw HEX diperlukan oleh Recharts Line stroke
    decimals: 1,
    domain: ['auto', 'auto'],
    refLines: [
      { value: TEMP_MIN_C,     label: `min ${TEMP_MIN_C}°`,     color: 'rgba(239,68,68,0.5)'  },
      { value: TEMP_MAX_C,     label: `max ${TEMP_MAX_C}°`,     color: 'rgba(239,68,68,0.5)'  },
    ],
  },
  humidity: {
    label:  'Humidity',
    unit:   '%',
    color:  '#38bdf8',
    decimals: 1,
    domain: [0, 100],
    refLines: [
      { value: HUMIDITY_MIN, label: `min ${HUMIDITY_MIN}%`, color: 'rgba(239,68,68,0.5)' },
      { value: HUMIDITY_MAX, label: `max ${HUMIDITY_MAX}%`, color: 'rgba(239,68,68,0.5)' },
    ],
  },
  gas_ppm: {
    label:  'Gas PPM',
    unit:   'ppm',
    color:  '#a78bfa',
    decimals: 1,
    domain: [0, 'auto'],
    refLines: [
      { value: GAS_PPM_WARNING,     label: `warn ${GAS_PPM_WARNING}`,     color: 'rgba(239,68,68,0.5)'  },
      { value: GAS_PPM_WARNING / 2, label: `caution ${GAS_PPM_WARNING/2}`, color: 'rgba(234,179,8,0.5)'  },
    ],
  },
}

// ── Custom tooltip ────────────────────────────────────────

interface TooltipProps {
  active?:  boolean
  payload?: { value: number | null }[]
  label?:   number
  metric:   MetricKey
}

const CustomTooltip = ({ active, payload, label, metric }: TooltipProps) => {
  if (!active || !payload?.length || label === undefined) return null

  const cfg   = METRIC_CONFIG[metric]
  const value = payload[0]?.value

  return (
    <div className="pointer-events-none border border-border-bright bg-raised p-3 font-mono text-[11px] text-text-primary shadow-lg">
      <div className="mb-1 text-[10px] text-text-muted">
        {format(new Date(label * 1000), 'HH:mm:ss · dd MMM')}
      </div>
      <div style={{ color: cfg.color }} className="text-sm font-semibold">
        {value !== null && value !== undefined
          ? `${value.toFixed(cfg.decimals)} ${cfg.unit}`
          : '—'}
      </div>
    </div>
  )
}

// ── X-axis tick formatter ────────────────────────────────

const formatXTick = (unixSeconds: number, rangeSeconds: number): string => {
  const d = new Date(unixSeconds * 1000)
  if (rangeSeconds <= 3600)  return format(d, 'HH:mm')
  if (rangeSeconds <= 86400)  return format(d, 'HH:mm')
  return format(d, 'dd/MM HH:mm')
}

// ── Component ─────────────────────────────────────────────

export interface SensorChartProps {
  idle?:        boolean
  data:         ChartPoint[]
  metric:       MetricKey
  rangeSeconds: number
  loading?:     boolean
}

export const SensorChart = ({
  data,
  metric,
  rangeSeconds,
  loading = false,
  idle    = false,
}: SensorChartProps) => {
  const cfg = METRIC_CONFIG[metric]

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="flex items-center justify-center border border-border-subtle bg-surface"
        style={{ height: CHART_HEIGHT }}
      >
        <div className="animate-pulse font-mono text-[11px] tracking-widest text-text-muted">
          LOADING DATA...
        </div>
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    const msg    = idle ? 'SELECT A DEVICE TO VIEW CHART' : 'NO DATA IN RANGE'
    const detail = idle ? undefined : 'no readings match the current filters'
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 border border-border-subtle bg-surface"
        style={{ height: CHART_HEIGHT }}
      >
        <div className="font-mono text-[11px] tracking-widest text-text-muted">
          {msg}
        </div>
        {detail && (
          <div className="font-mono text-[10px] opacity-50 text-text-muted">
            {detail}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-border-subtle bg-surface pt-4 pr-2 pb-2">
      {/* Metric label */}
      <div
        className="mb-3 pl-6 font-mono text-[10px] tracking-[0.12em] opacity-80"
        style={{ color: cfg.color }}
      >
        {cfg.label.toUpperCase()} ({cfg.unit})
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={CHART_MARGIN}>
          {/* Recharts SVG elements still need raw CSS variables for stroke/fill */}
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="var(--border)"
            vertical={false}
          />

          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => formatXTick(v, rangeSeconds)}
            tick={{
              fontFamily: 'var(--font-mono)',
              fontSize:   10,
              fill:       'var(--text-muted)',
            }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={50}
          />

          <YAxis
            domain={cfg.domain ?? ['auto', 'auto']}
            tickFormatter={v => `${v}`}
            tick={{
              fontFamily: 'var(--font-mono)',
              fontSize:   10,
              fill:       'var(--text-muted)',
            }}
            axisLine={false}
            tickLine={false}
            width={42}
          />

          <Tooltip
            content={<CustomTooltip metric={metric} />}
            cursor={{ stroke: 'var(--border-bright)', strokeWidth: 1, strokeDasharray: '3 3' }}
          />

          {/* Reference lines for thresholds */}
          {cfg.refLines?.map(ref => (
            <ReferenceLine
              key={ref.value}
              y={ref.value}
              stroke={ref.color}
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value:      ref.label,
                position:   'insideTopRight',
                fontFamily: 'var(--font-mono)',
                fontSize:   9,
                fill:       ref.color,
              }}
            />
          ))}

          <Line
            type="monotone"
            dataKey="value"
            stroke={cfg.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{
              r:           4,
              fill:        cfg.color,
              stroke:      'var(--bg-base)',
              strokeWidth: 2,
            }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default SensorChart