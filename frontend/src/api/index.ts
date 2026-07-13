import axios from 'axios'
import { API_BASE_URL } from '../constant'

/**
 * ============================================================================
 * TYPE DEFINITIONS — Match backend DB schema
 * ============================================================================
 */

export interface SensorReading {
  id: number
  device_id: string
  received_at: number // Unix seconds
  device_uptime_ms: number | null
  temperature_c: number | null
  humidity: number | null
  gas_ppm: number | null
  mq2_voltage_v: number |  null
  mq2_rs_kohm: number | null
  mq2_ratio: number | null
  is_valid: number | null // 1 = clean, 0 = flagged
}

export interface Device {
  device_id: string
  last_seen: number // Unix seconds
  total_readings: number
  valid_readings: number
}

export interface HistoryQueryParams {
  deviceId?: string
  from?: number // Unix seconds
  to?: number // Unix seconds
  limit?: number
  validOnly?: boolean
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error'
  checks: {
    mqtt: 'ok' | 'disconnected' | 'error' | 'unreachable'
    db: 'ok' | 'error' | 'unreachable'
  }
}

export interface WiFiCommandPayload {
  deviceId: string
}

export interface GenericCommandPayload {
  deviceId: string
  payload: string
}

/**
 * ============================================================================
 * API CLIENT INITIALIZATION
 * ============================================================================
 */

// Build headers with optional API key
const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
}

// If VITE_API_KEY is set, include it in all requests
const apiKey = import.meta.env.VITE_API_KEY;
if (apiKey) {
  defaultHeaders['X-API-Key'] = apiKey;
  console.log('[API] Using API key authentication');
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: defaultHeaders,
})

/**
 * ============================================================================
 * DEVICES API
 * ============================================================================
 */

/**
 * GET /devices
 * Fetch list of all registered devices with metadata
 */
export const getDevices = async (signal?: AbortSignal): Promise<Device[]> => {
  const { data } = await apiClient.get<Device[]>('/devices', { signal })
  return data
}

/**
 * POST /export/raw
 * Download raw sensor export as ZIP blob
 * 
 * Rate limited to 10 exports per hour per IP.
 * Returns 429 if limit exceeded.
 */
export const exportRawDataAPI = async (
  deviceIds: string[],
  startTime: number,
  endTime: number
): Promise<Blob> => {
  const response = await apiClient.post('/api/export/raw', {
    deviceIds,
    startTime,
    endTime,
  }, {
    responseType: 'blob',
  })

  return response.data
}

/**
 * ============================================================================
 * SENSORS API
 * ============================================================================
 */

/**
 * GET /sensors/latest
 * Fetch latest sensor reading(s)
 * @param deviceId - Optional device ID; if omitted, returns latest from all devices
 */
export const getLatestSensorReading = async (
    deviceId?: string,
    signal?: AbortSignal
): Promise<SensorReading[]> => {
  const params = deviceId 
    ? { deviceId } 
    : {}
  const { data } = 
    await apiClient.get<SensorReading[]>(
        '/sensors/latest',
        { 
            params, 
            signal 
        }
    )
  return data
}

/**
 * GET /sensors/history
 * Fetch historical sensor readings with optional filtering
 * @param params - Query parameters (deviceId, from, to, limit, validOnly)
 */
export const getSensorHistory = async (params: HistoryQueryParams = {}): Promise<SensorReading[]> => {
  const queryParams: Record<string, unknown> = {}
  
  if (params.deviceId) queryParams.deviceId = params.deviceId
  if (params.from !== undefined) queryParams.from = params.from
  if (params.to !== undefined) queryParams.to = params.to
  if (params.limit !== undefined) queryParams.limit = params.limit
  if (params.validOnly !== undefined) queryParams.validOnly = params.validOnly

  const { data } = await apiClient.get<SensorReading[]>('/sensors/history', {
    params: queryParams,
  })
  return data
}

/**
 * ============================================================================
 * WIFI CONTROL API
 * ============================================================================
 */

/**
 * POST /wifi/open
 * Open WiFi access point on device
 */
export const openWiFi = async (deviceId: string): Promise<{ success: boolean; message?: string }> => {
  const { data } = await apiClient.post('/wifi/open', { deviceId })
  return data
}

/**
 * POST /wifi/close
 * Close WiFi access point on device
 */
export const closeWiFi = async (deviceId: string): Promise<{ success: boolean; message?: string }> => {
  const { data } = await apiClient.post('/wifi/close', { deviceId })
  return data
}

/**
 * ============================================================================
 * COMMAND API
 * ============================================================================
 */

/**
 * POST /command
 * Send arbitrary command to device
 */
export const sendCommand = async (
  deviceId: string,
  payload: string
): Promise<{ success: boolean; response?: unknown; message?: string }> => {
  const { data } = await apiClient.post('/command', {
    deviceId,
    payload,
  })
  return data
}

/**
 * ============================================================================
 * HEALTH CHECK API
 * ============================================================================
 */

/**
 * GET /health
 * Check backend server health status
 * 
 * Note: Health endpoint does NOT require API key authentication,
 * allowing status checks from load balancers and monitoring tools.
 */
export const getHealth = async (): Promise<HealthStatus> => {
  const { data } = await apiClient.get<HealthStatus>('/health')
  return data
}

/**
 * ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

/**
 * Get current time in Unix seconds 
 */
export const getCurrentTimeSeconds = (): number => Math.floor(Date.now() / 1000)

/**
 * Convert Unix seconds to Date object
 */
export const secondsToDate = (seconds: number): Date => new Date(seconds * 1000)

/**
 * Convert Date object to Unix seconds
 */
export const dateToSeconds = (date: Date): number => Math.floor(date.getTime() / 1000)

/**
 * ============================================================================
 * ERROR HANDLING
 * ============================================================================
 */

/**
 * Generic error handler for API calls
 * Can be used in try-catch blocks or chained with .catch()
 */
export const handleApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      // Handle rate limit errors specifically
      if (error.response.status === 429) {
        return `Rate limited. ${error.response.data?.message || 'Please wait before retrying.'}`
      }
      // Handle auth errors
      if (error.response.status === 401 || error.response.status === 403) {
        return `Authentication failed: ${error.response.data?.message || 'Invalid or missing API key'}`
      }
      return `API Error ${error.response.status}: ${error.response.data?.message || error.response.data?.error || error.message}`
    }
    if (error.request) {
      return 'No response from server. Check if API is running.'
    }
    return `Request error: ${error.message}`
  }
  return `Unknown error: ${String(error)}`
}

export default apiClient