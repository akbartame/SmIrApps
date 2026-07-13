import { useLatest, getDeviceStatus } from '../hooks/useLatest'
import { SensorCard } from '../components/SensorCard'
import { getCurrentTimeSeconds } from '../api'
import { Typography } from '../components/Typography'

export default function Dashboard() {
  const { readings, loading, error, refetch } = useLatest()

  // Kalkulasi statistik
  const totalReadings = readings.length
  const onlineReadings = readings.filter(
    (r) => getDeviceStatus(r.received_at) === 'online'
  ).length
  const oldestReadingRaw =
    readings.length > 0
      ? Math.min(...readings.map((r) => getCurrentTimeSeconds() - r.received_at))
      : null

  let oldestReading = null
  let unit = 's'

  if (oldestReadingRaw !== null) {
    if (oldestReadingRaw < 60) {
      oldestReading = oldestReadingRaw
      unit = 's'
    } else if (oldestReadingRaw < 60 * 60) {
      oldestReading = Math.floor(oldestReadingRaw / 60)
      unit = 'm'
    } else if (oldestReadingRaw < 60 * 60 * 24) {
      oldestReading = Math.floor(oldestReadingRaw / (60 * 60))
      unit = 'h'
    } else if (oldestReadingRaw < 60 * 60 * 24 * 30) {
      oldestReading = Math.floor(oldestReadingRaw / (60 * 60 * 24))
      unit = 'd'
    } else {
      oldestReading = Math.floor(oldestReadingRaw / (60 * 60 * 24 * 30))
      unit = 'mo'
    }
  }

  return (
    // Mengganti class "page-enter" dengan utility animasi dari @theme di index.css
    <div className="p-5 sm:p-8 animate-fade-up">
      
      {/* Header */}
      <div className="mb-8">
        <Typography variant="caption" className="mb-1.5 block">
          LIVE MONITOR
        </Typography>
        <Typography variant="h1">
          Dashboard
        </Typography>
      </div>

      {/* Summary bar - Responsif: 1 kolom di HP, 3 kolom di sm (tablet/desktop) */}
      <div className="mb-8 grid grid-cols-3 gap-2">
        {[
          { label: 'DEVICES', value: loading ? '—' : totalReadings, unit: 'total' },
          { label: 'ONLINE',  value: loading ? '—' : onlineReadings, unit: 'active' },
          { label: 'LAST UPDATE', value: loading ? '—' : oldestReading ? `${oldestReading}${unit}` : '—', unit: 'ago' },
        ].map(({ label, value, unit }) => (
          <div key={label} className="border border-border-subtle bg-surface p-2.5 sm:p-4 transition-normal duration-100">
            <Typography variant="caption" className="mb-2 block">
              {label}
            </Typography>
            <div className="font-mono text-lg font-semibold leading-none text-accent sm:text-3xl transition-normal duration-100">
              {value}
            </div>
            <div className="mt-1 font-mono text-[10px] text-text-muted">
              {unit}
            </div>
          </div>
        ))}
      </div>

      <Typography variant="caption" className="mb-4 block">
        SENSOR READINGS
      </Typography>

      {/* Error State */}
      {error && (
        <div className="mb-4 rounded border border-red-500/20 bg-red-500/10 p-4 font-mono text-xs text-red-500">
          ⚠ {error}
          <button
            onClick={refetch}
            className="ml-3 cursor-pointer rounded-sm border border-red-500 bg-red-500/20 px-2 py-1 font-mono text-[11px] text-text-primary transition-colors hover:text-red-500 hover:border-red-500/20 "
          >
            RETRY
          </button>
        </div>
      )}

      {/* Loading State - Menggunakan animate-pulse bawaan Tailwind */}
      {loading && readings.length === 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border border-border-subtle bg-surface p-5 animate-pulse"
            >
              <div className="h-50 rounded-sm bg-border-subtle" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && readings.length === 0 && (
        <div className="p-8 text-center font-mono text-text-muted">
          No readings available. Backend may be offline or devices haven't reported yet.
        </div>
      )}

      {/* Cards Grid */}
      {readings.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-normal duration-100">
          {readings.map((reading) => (
            <SensorCard key={reading.id} reading={reading} />
          ))}
        </div>
      )}

    </div>
  )
}