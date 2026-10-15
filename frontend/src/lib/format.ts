const UNREADABLE = 'Sensor tidak terbaca';

/**
 * distance_mm: 0 is documented as ambiguous — could be a real 0mm reading or
 * "no echo / sensor fault", and the two are not distinguished in the
 * payload. Per spec, this UI always renders 0 as "sensor tidak terbaca"
 * rather than a valid 0mm distance.
 */
export function formatDistanceMm(distance_mm: number): string {
  if (distance_mm === 0) return UNREADABLE;
  return `${distance_mm} mm`;
}

export function isDistanceReadable(distance_mm: number): boolean {
  return distance_mm !== 0;
}

/**
 * temperature_c_x100: -12700 is the DS18B20 library's disconnected-sensor
 * sentinel (-127.0°C) passed straight through. Never render it as a real
 * temperature.
 */
export function formatTemperatureC(temperature_c_x100: number): string {
  if (temperature_c_x100 === -12700) return UNREADABLE;
  return `${(temperature_c_x100 / 100).toFixed(1)}°C`;
}

export function isTemperatureReadable(temperature_c_x100: number): boolean {
  return temperature_c_x100 !== -12700;
}

/**
 * bus_voltage_mv / current_ma are only meaningful when sensor_ok's bit0 (the
 * INA226 begin() success flag) was set on that read cycle[cite: 3].
 */
export function isPowerReadingReliable(sensor_ok: number): boolean {
  return (sensor_ok & 0x01) !== 0; // bit0 = INA226 OK[cite: 3]
}

/**
 * Check if ultrasonic water sensor reading is reliable based on sensor_ok bit1[cite: 3].
 */
export function isWaterReadingReliable(sensor_ok: number): boolean {
  return (sensor_ok & 0x02) !== 0; // bit1 = ultrasonic echo OK[cite: 3]
}

export function formatVoltage(bus_voltage_mv: number): string {
  return `${(bus_voltage_mv / 1000).toFixed(2)} V`;
}

export function formatCurrent(current_ma: number): string {
  const sign = current_ma > 0 ? '+' : '';
  return `${sign}${current_ma.toFixed(1)} mA`;
}

/**
 * Format the calibrated water level percentage (derived by the backend
 * from the raw echo distance + the node's calibration anchors) next
 * to the raw distance for calibration verification.
 */
export function formatCalibratedWaterLevel(
  calibratedWaterLevelPct: number | null | undefined,
  rawDistanceMm: number,
  sensorOk: number
): string {
  if (calibratedWaterLevelPct === null || calibratedWaterLevelPct === undefined) {
    return 'Belum dikalibrasi';
  }
  if (!isWaterReadingReliable(sensorOk)) {
    return `Sensor tidak terbaca (raw: ${rawDistanceMm}mm)`;
  }
  return `${calibratedWaterLevelPct}% (${rawDistanceMm} mm)`;
}

/**
 * Interpret sensor_ok bitmask for diagnostics display[cite: 3].
 */
export function formatSensorHealth(sensor_ok: number): {
  powerMeter: string;
  waterSensor: string;
} {
  return {
    powerMeter: (sensor_ok & 0x01) !== 0 ? '✓ Power OK' : '✗ Voltage/current unreliable',
    waterSensor: (sensor_ok & 0x02) !== 0 ? '✓ Water sensor OK' : '✗ Water level unreliable',
  };
}

function normalizeTimestampToMs(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;

  const absValue = Math.abs(value);
  if (absValue >= 1e12) return value;
  if (absValue >= 1e9) return value * 1000;
  return value;
}

export function formatRelativeTime(value: number | null | undefined): string {
  const normalized = normalizeTimestampToMs(value);
  if (normalized === null) return 'belum pernah';

  const deltaMs = Date.now() - normalized;
  if (deltaMs <= 0) return 'baru saja';
  if (deltaMs < 60_000) return `${Math.round(deltaMs / 1000)} dtk lalu`;
  if (deltaMs < 3_600_000) return `${Math.round(deltaMs / 60_000)} mnt lalu`;
  if (deltaMs < 86_400_000) return `${Math.round(deltaMs / 3_600_000)} jam lalu`;
  return `${Math.round(deltaMs / 86_400_000)} hari lalu`;
}

export function formatClockTime(unixMs: number): string {
  return new Date(unixMs).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format a "milliseconds ago" duration (e.g. heartbeat seen_ms_ago).
 * Unlike formatRelativeTime — whose input is an absolute unix timestamp —
 * the input here is a duration, so no Date.now() subtraction happens.
 */
export function formatDurationMsAgo(msAgo: number | null | undefined): string {
  if (msAgo === null || msAgo === undefined || Number.isNaN(msAgo)) return 'belum pernah';

  if (msAgo <= 0) return 'baru saja';
  if (msAgo < 60_000) return `${Math.round(msAgo / 1000)} dtk lalu`;
  if (msAgo < 3_600_000) return `${Math.round(msAgo / 60_000)} mnt lalu`;
  if (msAgo < 86_400_000) return `${Math.round(msAgo / 3_600_000)} jam lalu`;
  return `${Math.round(msAgo / 86_400_000)} hari lalu`;
}

/**
 * Konstanta kalibrasi sensor aliran air.
 * Ganti nilai 7.5 dengan konstanta dari datasheet sensor Anda.
 * YF-S201 = 7.5 | YF-S401 = 98 | YF-B7 = 11
 */
export const FLOW_CALIBRATION_CONSTANT = 7.5;

export function formatFlowRateLMin(pulses_per_sec: number | null): string {
  if (pulses_per_sec === null) return 'N/A';
  const lMin = pulses_per_sec / FLOW_CALIBRATION_CONSTANT;
  return `${lMin.toFixed(2)} L/min`;
}