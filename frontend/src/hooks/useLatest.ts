import { useState, useEffect, useCallback } from 'react'
import {
  getLatestSensorReading,
  getCurrentTimeSeconds,
  type SensorReading,
  handleApiError,
} from '../api'
import {
  POLL_INTERVAL_MS,
  DEVICE_STALE_THRESHOLD_S,
  DEVICE_OFFLINE_THRESHOLD_S,
} from '../constant'
import axios from 'axios'

type Status = 'loading' | 'success' | 'error'

export interface UseLatestReturn {
  readings: SensorReading[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export const useLatest = (
  deviceId?: string
): UseLatestReturn => {
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  const fetchLatest = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setError(null)

        const data = await getLatestSensorReading(
          deviceId,
          signal
        )

        if (signal?.aborted) return

        setReadings(data)
        setStatus('success')
      } catch (err) {
        if (axios.isCancel(err)) {
          return
        }

        setError(handleApiError(err))
        setStatus('error')
      }
    },
    [deviceId]
  )

  useEffect(() => {
    const controller = new AbortController()

    let timeoutId: ReturnType<typeof setTimeout>

    const poll = async () => {
      await fetchLatest(controller.signal)

      if (controller.signal.aborted) return

      timeoutId = setTimeout(
        poll,
        POLL_INTERVAL_MS
      )
    }

    poll()

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [fetchLatest])

  const refetch = useCallback(async () => {
    setStatus('loading')
    await fetchLatest()
  }, [fetchLatest])

  return {
    readings,
    loading: status === 'loading',
    error,
    refetch,
  }
}

/**
 * Helper: Get device status based on last_seen timestamp
 * Used by DeviceStatusBadge and other components
 */
export const getDeviceStatus = (lastSeenSeconds: number, nowSeconds: number = getCurrentTimeSeconds()): 'online' | 'stale' | 'offline' | 'waiting' => {
  const ageSec = nowSeconds - lastSeenSeconds
  if (ageSec < 0) return 'waiting' // Future timestamp, treat as waiting
  if (ageSec < DEVICE_STALE_THRESHOLD_S) return 'online'
  if (ageSec < DEVICE_OFFLINE_THRESHOLD_S) return 'stale'
  return 'offline'
}

/**
 * Helper: Get sensor health status based on is_valid flag
 */
export const getSensorHealth = (isValid: number | null): 'clean' | 'flagged' => {
  return isValid === 1 ? 'clean' : 'flagged'
}
