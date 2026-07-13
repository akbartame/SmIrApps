import { useReducer, useEffect } from 'react'
import {
  getSensorHistory,
  handleApiError,
  type SensorReading,
} from '../api'
import { DEFAULT_VALID_ONLY } from '../constant'

// ── State & actions ───────────────────────────────────────

interface State {
  readings:   SensorReading[]
  resolvedId: number
  idle:       boolean
  error:      string | null
}

type Action =
  | { type: 'FETCH_SUCCESS'; fetchId: number; payload: SensorReading[] }
  | { type: 'FETCH_ERROR';   fetchId: number; payload: string           }
  | { type: 'RESET_IDLE' }

const initialState: State = {
  readings:   [],
  resolvedId: -1,
  idle:       true,
  error:      null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET_IDLE':
      return initialState

    case 'FETCH_SUCCESS':
      return {
        readings:   action.payload,
        resolvedId: action.fetchId,
        idle:       false,
        error:      null,
      }

    case 'FETCH_ERROR':
      return {
        ...state,
        resolvedId: action.fetchId,
        idle:       false,
        error:      action.payload,
      }
  }
}

// ── Hook ─────────────────────────────────────────────────

export interface UseHistoryParams {
  deviceId:     string | null
  rangeSeconds: number
  validOnly?:   boolean
}

export interface UseHistoryReturn {
  readings: SensorReading[]
  loading:  boolean
  error:    string | null
  idle:     boolean
  refetch:  () => void
}

export const useHistory = ({
  deviceId,
  rangeSeconds,
  validOnly = DEFAULT_VALID_ONLY,
}: UseHistoryParams): UseHistoryReturn => {
  // Compute limit from range: device publishes ~every 5s; backend hard-caps at 5000
  const limit = Math.min(Math.ceil(rangeSeconds / 5), 5000)
  const [fetchId, bumpFetch] = useReducer((n: number) => n + 1, 0)
  const [state,   dispatch]  = useReducer(reducer, initialState)

  // Reset to idle when deviceId is cleared — separate effect so it
  // never runs alongside the fetch effect.
  useEffect(() => {
    if (deviceId === null) {
      dispatch({ type: 'RESET_IDLE' })
    }
  }, [deviceId])

  // Fetch effect — only runs when deviceId is non-null.
  // fetchId is a plain closure capture; no ref needed.
  useEffect(() => {
    if (deviceId === null) return

    let cancelled = false
    const id          = fetchId
    const nowSeconds  = Math.floor(Date.now() / 1000)
    const fromSeconds = nowSeconds - rangeSeconds

    getSensorHistory({ deviceId, from: fromSeconds, to: nowSeconds, limit, validOnly })
      .then(data => {
        if (cancelled) return
        dispatch({ type: 'FETCH_SUCCESS', fetchId: id, payload: data })
      })
      .catch(err => {
        if (cancelled) return
        dispatch({ type: 'FETCH_ERROR', fetchId: id, payload: handleApiError(err) })
      })

    return () => { cancelled = true }
  }, [deviceId, rangeSeconds, validOnly, limit, fetchId])

  return {
    readings: state.readings,
    loading:  deviceId !== null && fetchId !== state.resolvedId,
    error:    state.error,
    idle:     state.idle,
    refetch: bumpFetch,
  }
}

// ── Derived stats helpers ─────────────────────────────────

export type MetricKey = 'temperature_c' | 'humidity' | 'gas_ppm'

export interface MetricStats {
  min:   number | null
  max:   number | null
  avg:   number | null
  count: number
}

export function computeStats(readings: SensorReading[], key: MetricKey): MetricStats {
  const values = readings
    .map(r => r[key])
    .filter((v): v is number => v !== null && isFinite(v))

  if (values.length === 0) return { min: null, max: null, avg: null, count: 0 }

  return {
    min:   Math.min(...values),
    max:   Math.max(...values),
    avg:   values.reduce((a, b) => a + b, 0) / values.length,
    count: values.length,
  }
}

export interface ChartPoint {
  time:  number
  value: number | null
}

export function toChartData(readings: SensorReading[], key: MetricKey): ChartPoint[] {
  return readings.map(r => ({ time: r.received_at, value: r[key] }))
}