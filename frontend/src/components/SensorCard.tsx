import type { SensorReading } from '../api'
import { DeviceStatusBadge } from './DeviceStatusBadge'
import { getDeviceStatus, getSensorHealth } from '../hooks/useLatest'
import { getCurrentTimeSeconds, secondsToDate } from '../api'
import { TEMP_MIN_C, TEMP_MAX_C, HUMIDITY_MIN, HUMIDITY_MAX, GAS_PPM_WARNING } from '../constant'
import { cn } from '../utils/cn'
import { Typography } from './Typography'

export interface SensorCardProps {
  reading: SensorReading
  className?: string
}

export const SensorCard = ({ reading, className = '' }: SensorCardProps) => {
  const deviceStatus = getDeviceStatus(reading.received_at)
  const sensorHealth = getSensorHealth(reading.is_valid)
  const readingAge = getCurrentTimeSeconds() - reading.received_at
  const readingTime = secondsToDate(reading.received_at)
  const readingTimeStr = readingTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  // Logika diubah: Bukan me-return string warna mentah, tapi me-return nama class Tailwind
  const getTempColorClass = (temp: number | null): string => {
    if (temp === null) return 'text-text-muted'
    if (temp < TEMP_MIN_C || temp > TEMP_MAX_C) return 'text-red-500'
    if (temp < TEMP_MIN_C + 5 || temp > TEMP_MAX_C - 5) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getHumidityColorClass = (humidity: number | null): string => {
    if (humidity === null) return 'text-text-muted'
    if (humidity < HUMIDITY_MIN || humidity > HUMIDITY_MAX) return 'text-red-500'
    if (humidity < HUMIDITY_MIN + 10 || humidity > HUMIDITY_MAX - 10) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getGasColorClass = (ppm: number | null): string => {
    if (ppm === null) return 'text-text-muted'
    if (ppm > GAS_PPM_WARNING) return 'text-red-500'
    if (ppm > GAS_PPM_WARNING / 2) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <div className={cn("rounded border border-border-subtle bg-surface p-5", className)}>
      
      {/* Header: Device ID + Status Badge */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <Typography variant="caption" className="mb-1 block">DEVICE ID</Typography>
          <div className="mb-1 font-mono text-sm font-semibold text-text-primary">
            {reading.device_id}
          </div>
          <Typography variant="caption" className="normal-case">
            {readingTimeStr} ({readingAge}s ago)
          </Typography>
        </div>
        <DeviceStatusBadge status={deviceStatus} />
      </div>

      {/* Sensor Health Indicator */}
      <div
        className={cn(
          "mb-4 rounded-sm border px-3 py-2",
          sensorHealth === 'clean' 
            ? "border-green-500/20 bg-green-500/5" 
            : "border-red-500/20 bg-red-500/5"
        )}
      >
        <div
          className={cn(
            "font-mono text-[9px] font-semibold uppercase tracking-widest",
            sensorHealth === 'clean' ? "text-green-500" : "text-red-500"
          )}
        >
          {sensorHealth === 'clean' ? '✓ VALID DATA' : '⚠ FLAGGED DATA'}
        </div>
      </div>

      {/* Sensor Readings Grid */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        {/* Temperature */}
        <div className="rounded-sm border border-border-subtle p-3">
          <Typography variant="caption" className="mb-1 block">TEMPERATURE</Typography>
          <div className={cn("font-mono text-xl font-semibold", getTempColorClass(reading.temperature_c))}>
            {reading.temperature_c != null ? reading.temperature_c.toFixed(1) : '-'}°C
          </div>
        </div>

        {/* Humidity */}
        <div className="rounded-sm border border-border-subtle p-3">
          <Typography variant="caption" className="mb-1 block">HUMIDITY</Typography>
          <div className={cn("font-mono text-xl font-semibold", getHumidityColorClass(reading.humidity))}>
            {reading.humidity != null ? reading.humidity.toFixed(1) : '-'}%
          </div>
        </div>

        {/* Gas PPM */}
        <div className="rounded-sm border border-border-subtle p-3">
          <Typography variant="caption" className="mb-1 block">GAS PPM</Typography>
          <div className={cn("font-mono text-xl font-semibold", getGasColorClass(reading.gas_ppm))}>
            {reading.gas_ppm != null ? reading.gas_ppm.toFixed(1) : '-'}
          </div>
        </div>

        {/* MQ2 Ratio */}
        <div className="rounded-sm border border-border-subtle p-3">
          <Typography variant="caption" className="mb-1 block">MQ2 RATIO</Typography>
          <div
            className={cn(
              "font-mono text-xl font-semibold",
              reading.mq2_ratio != null && reading.mq2_ratio > 1.2 ? "text-green-500" : "text-yellow-500"
            )}
          >
            {reading.mq2_ratio != null ? reading.mq2_ratio.toFixed(2) : '-'}
          </div>
        </div>
      </div>

      {/* Footer: Metadata */}
      <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3 text-[10px]">
        <div>
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">UPTIME</span>
          <div className="mt-0.5 font-mono text-text-secondary">
            {reading.device_uptime_ms != null ? `${(reading.device_uptime_ms / 1000 / 60 / 60).toFixed(2)}h` : '-'}
          </div>
        </div>
        <div>
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">MQ2 RS</span>
          <div className="mt-0.5 font-mono text-text-secondary">
            {reading.mq2_rs_kohm != null ? reading.mq2_rs_kohm.toFixed(1) : '-'}kΩ
          </div>
        </div>
      </div>
    </div>
  )
}