import { useReducer, useEffect } from 'react'
import axios from 'axios'
import { getDevices, handleApiError, type Device } from '../api'
import { POLL_INTERVAL_MS } from '../constant'

// ── State & actions ───────────────────────────────────────

interface State {
  devices:    Device[]
  resolvedId: number
  error:      string | null
}

type Action =
  | { type: 'FETCH_SUCCESS'; fetchId: number; payload: Device[] }
  | { type: 'FETCH_ERROR';   fetchId: number; payload: string   }

const initialState: State = {
  devices:    [],
  resolvedId: -1,   // -1 so fetchId=0 is immediately seen as "in flight"
  error:      null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_SUCCESS':
      return { devices: action.payload, resolvedId: action.fetchId, error: null }
    case 'FETCH_ERROR':
      return { ...state, resolvedId: action.fetchId, error: action.payload }
  }
}

// ── Hook ─────────────────────────────────────────────────

export interface UseDevicesReturn {
  devices: Device[]
  loading: boolean
  error:   string | null
  refetch: () => void
}

export const useDevices = (): UseDevicesReturn => {
  const [fetchId, bumpFetch] = useReducer((n: number) => n + 1, 0)
  const [state,   dispatch]  = useReducer(reducer, initialState)
  useEffect(() => {
    const controller = new AbortController()
    const id = fetchId

    let timeoutId: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const data = await getDevices(controller.signal)
        if (controller.signal.aborted) return
        dispatch({ type: 'FETCH_SUCCESS', fetchId: id, payload: data })
      } catch (err) {
        if (axios.isCancel(err)) return
        if (controller.signal.aborted) return
        dispatch({ type: 'FETCH_ERROR', fetchId: id, payload: handleApiError(err) })
      }

      if (controller.signal.aborted) return

      timeoutId = setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [fetchId])

  return {
    devices: state.devices,
    loading: fetchId !== state.resolvedId,
    error:   state.error,
    refetch: bumpFetch,
  }
}