import { useState, useMemo } from 'react'
import { useHistory, computeStats, toChartData, type MetricKey } from '../hooks/useHistory'
import { SensorChart } from '../components/SensorChart'
import { useDevices } from '../hooks/useDevices'
import { Typography } from '../components/Typography'
import { cn } from '../utils/cn'

// ── Constants ─────────────────────────────────────────────

const RANGES: { label: string; seconds: number }[] = [
  { label: '1H',  seconds: 3_600   },
  { label: '6H',  seconds: 21_600  },
  { label: '24H', seconds: 86_400  },
  { label: '7D',  seconds: 604_800 },
]

const METRICS: { key: MetricKey; label: string; color: string; unit: string }[] = [
  { key: 'temperature_c', label: 'TEMPERATURE', color: '#f5a623', unit: '°C'  },
  { key: 'humidity',      label: 'HUMIDITY',    color: '#38bdf8', unit: '%'   },
  { key: 'gas_ppm',       label: 'GAS PPM',     color: '#a78bfa', unit: 'ppm' },
]

// ── Helpers ───────────────────────────────────────────────

const fmt = (v: number | null, decimals: number, unit: string): string =>
  v !== null ? `${v.toFixed(decimals)} ${unit}` : '—'

// ── Component ─────────────────────────────────────────────

export default function History() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [activeRange, setActiveRange]       = useState<string>('24H')
  const [activeMetric, setActiveMetric]     = useState<MetricKey>('temperature_c')
  const [validOnly, setValidOnly]           = useState<boolean>(true)

  const rangeSeconds = RANGES.find(r => r.label === activeRange)?.seconds ?? 86_400
  const metricMeta   = METRICS.find(m => m.key === activeMetric)!

  // Load device list for the selector
  const { devices, loading: devicesLoading } = useDevices()

  // Load history data
  const { readings, loading, error, idle, refetch } = useHistory({
    deviceId:     selectedDevice,
    rangeSeconds,
    validOnly,
  })

  // Derived chart data and stats
  const chartData = useMemo(() => toChartData(readings, activeMetric), [readings, activeMetric])
  const stats     = useMemo(() => computeStats(readings, activeMetric), [readings, activeMetric])

  const decimals = activeMetric === 'gas_ppm' ? 1 : 1

  return (
    <div className="animate-fade-up p-5 md:p-8">

      {/* Header */}
      <div className="mb-8">
        <Typography variant="caption" className="mb-1.5 block">
          HISTORICAL DATA
        </Typography>
        <Typography variant="h1">
          History
        </Typography>
      </div>

      {/* Controls row - Responsif: Stack di mobile, sebaris di MD */}
      <div className="mb-6 flex flex-col items-start gap-4 md:flex-row md:flex-wrap md:items-end md:gap-4">

        {/* Device selector */}
        <div className="flex w-full flex-col gap-1 md:w-auto">
          <Typography variant="caption" as="label">
            DEVICE
          </Typography>
          <select
            value={selectedDevice ?? ''}
            onChange={e => setSelectedDevice(e.target.value || null)}
            className={cn(
              "min-w-full cursor-pointer border border-border-subtle bg-surface px-3 py-2 font-mono text-xs outline-none md:min-w-55",
              selectedDevice ? "text-text-primary" : "text-text-muted"
            )}
          >
            <option value="">— select device —</option>
            {devicesLoading && (
              <option disabled>loading...</option>
            )}
            {devices.map(d => (
              <option key={d.device_id} value={d.device_id}>
                {d.device_id}
              </option>
            ))}
          </select>
        </div>

        {/* Time range */}
        <div className="flex w-full flex-col gap-1 md:w-auto">
          <Typography variant="caption" as="label">
            TIME RANGE
          </Typography>
          <div className="flex border border-border-subtle bg-border-subtle gap-px">
            {RANGES.map(({ label }) => (
              <button
                key={label}
                onClick={() => setActiveRange(label)}
                className={cn(
                  "flex-1 px-3.5 py-2 font-mono text-[11px] font-medium transition-colors md:flex-none",
                  activeRange === label 
                    ? "bg-accent text-black" 
                    : "bg-surface text-text-secondary hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Valid only toggle */}
        <div className="flex w-full flex-col gap-1 md:w-auto">
          <Typography variant="caption" as="label">
            FILTER
          </Typography>
          <button
            onClick={() => setValidOnly(v => !v)}
            className={cn(
              "w-full border px-3.5 py-2 font-mono text-[11px] tracking-widest transition-colors md:w-auto",
              validOnly
                ? "border-green-500/30 bg-green-500/10 text-green-500"
                : "border-border-subtle bg-surface text-text-muted hover:text-text-primary"
            )}
          >
            {validOnly ? '✓ VALID ONLY' : '  ALL DATA'}
          </button>
        </div>

        {/* Refetch button */}
        {selectedDevice && (
          <button
            onClick={refetch}
            disabled={loading}
            className={cn(
              "w-full border border-border-subtle bg-surface px-3.5 py-2 font-mono text-[11px] tracking-widest transition-colors md:w-auto",
              loading 
                ? "cursor-not-allowed text-text-muted opacity-50" 
                : "cursor-pointer text-text-secondary hover:bg-raised hover:text-text-primary"
            )}
          >
            ↺ REFRESH
          </button>
        )}
      </div>

      {/* Metric tabs */}
      <div className="flex flex-wrap gap-px border border-border-subtle bg-border-subtle mb-0">
        {METRICS.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setActiveMetric(key)}
            className={cn(
              "flex-1 px-4 py-2 font-mono text-[10px] tracking-widest transition-colors sm:flex-none border-b-2",
              activeMetric === key 
                ? "bg-raised" 
                : "bg-surface border-transparent text-text-muted hover:bg-raised hover:text-text-primary"
            )}
            style={{
              borderBottomColor: activeMetric === key ? color : 'transparent',
              color: activeMetric === key ? color : undefined
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-px flex items-center justify-between border border-red-500/20 bg-red-500/10 px-4 py-3 font-mono text-[11px] text-red-500">
          <span>⚠ {error}</span>
          <button
            onClick={refetch}
            className="cursor-pointer border-none bg-red-500 px-2.5 py-1 font-mono text-[10px] tracking-widest text-white transition-opacity hover:opacity-80"
          >
            RETRY
          </button>
        </div>
      )}

      {/* Chart */}
      <SensorChart
        data={chartData}
        metric={activeMetric}
        rangeSeconds={rangeSeconds}
        loading={loading}
        idle={idle}
      />

      {/* Stats row - Grid responsif (2 kolom di mobile, 4 kolom di desktop) */}
      <div className="mt-px grid grid-cols-2 gap-px border border-border-subtle bg-border-subtle md:grid-cols-4">
        {[
          {
            label: 'MIN',
            value: fmt(stats.min, decimals, metricMeta.unit),
            color: stats.min !== null ? metricMeta.color : undefined,
          },
          {
            label: 'MAX',
            value: fmt(stats.max, decimals, metricMeta.unit),
            color: stats.max !== null ? metricMeta.color : undefined,
          },
          {
            label: 'AVG',
            value: fmt(stats.avg, decimals, metricMeta.unit),
            color: stats.avg !== null ? metricMeta.color : undefined,
          },
          {
            label: 'READINGS',
            value: stats.count > 0 ? `${stats.count}` : '—',
            color: stats.count > 0 ? 'var(--text-primary)' : undefined,
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface px-3 py-2.5 md:px-5 md:py-4">
            <Typography variant="caption" className="mb-1.5 block">
              {label}
            </Typography>
            <div
              className="justify-self-center md:justify-self-end font-mono text-xl font-medium md:text-2xl"
              style={{ color: color ?? 'var(--text-muted)' }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Idle state */}
      {!selectedDevice && (
        <div className="mt-6 border border-border-subtle bg-surface p-6 text-center font-mono text-[11px] tracking-widest text-text-muted">
          SELECT A DEVICE ABOVE TO LOAD HISTORICAL DATA
        </div>
      )}

    </div>
  )
}