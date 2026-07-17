import type { RelaySensorData } from '../types';

const UNREADABLE = 'Sensor tidak terbaca';

/**
 * distance_mm: 0 is documented as ambiguous — could be a real 0mm reading or
 * "no echo / sensor fault", and the two are not distinguished in the
 * payload. Per spec, this UI always renders 0 as "sensor tidak terbaca"
 * rather than a valid 0mm distance.
 *
 * Caveat worth knowing (not hidden, just not overridable from the UI): if
 * the physical setup can ever legitimately produce a true 0mm reading,
 * this will mask it identically to a sensor fault. That's a limitation of
 * the payload itself, not something this formatting choice can fix.
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
  return `${(temperature_c_x100 / 100).toFixed(1)} °C`;
}

export function isTemperatureReadable(temperature_c_x100: number): boolean {
  return temperature_c_x100 !== -12700;
}

/**
 * bus_voltage_mv / current_ma are only meaningful when sensor_ok's bit0 (the
 * INA226 begin() success flag) was set on that read cycle.
 */
export function isPowerReadingReliable(sensor_ok: number): boolean {
  return (sensor_ok & 1) === 1;
}

export function formatVoltage(bus_voltage_mv: number): string {
  return `${(bus_voltage_mv / 1000).toFixed(2)} V`;
}

export function formatCurrent(current_ma: number): string {
  const sign = current_ma > 0 ? '+' : '';
  return `${sign}${current_ma.toFixed(1)} mA`;
}

export function formatRelativeTime(ms: number | null): string {
  if (ms === null) return 'belum pernah';
  if (ms < 1000) return 'baru saja';
  if (ms < 60_000) return `${Math.round(ms / 1000)} dtk lalu`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} mnt lalu`;
  return `${Math.round(ms / 3_600_000)} jam lalu`;
}

export function formatClockTime(unixMs: number): string {
  return new Date(unixMs).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * flow_pulses is cumulative since node boot. Given two readings, returns the
 * pulse delta over the elapsed time — or null if the node rebooted in
 * between (pulses went down), per the documented caveat.
 */
export function computeFlowDelta(
  prev: Pick<RelaySensorData, 'flow_pulses'> & { received_at: number },
  curr: Pick<RelaySensorData, 'flow_pulses'> & { received_at: number }
): { pulses: number; seconds: number } | null {
  if (curr.flow_pulses < prev.flow_pulses) return null; // node rebooted
  const seconds = (curr.received_at - prev.received_at) / 1000;
  if (seconds <= 0) return null;
  return { pulses: curr.flow_pulses - prev.flow_pulses, seconds };
}
