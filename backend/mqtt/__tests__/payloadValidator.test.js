const validator = require('../payloadValidator');

describe('Payload Validators', () => {
  describe('validateRelayStatus', () => {
    it('accepts valid relay packet', () => {
      const msg = {
        source: 'relay',
        node_id: 1,
        solenoid_state: 1,
        flow_pulses: 1000,
        distance_mm: 500,
        temperature_c_x100: 2431,
        soil_moisture_raw: 2048,
        seq: 42,
        telemetry_delay_ms: 100,
      };
      const result = validator.validateRelayStatus(msg);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid node_id', () => {
      const msg = { source: 'relay', node_id: 5, /* ... */ };
      const result = validator.validateRelayStatus(msg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('node_id'))).toBe(true);
    });

    it('rejects out-of-range flow_pulses', () => {
      const msg = { source: 'relay', node_id: 1, flow_pulses: 0x100000000, /* ... */ };
      const result = validator.validateRelayStatus(msg);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateSensorStatus', () => {
    it('accepts valid sensor packet with new water_level format', () => {
      const msg = {
        source: 'sensor',
        node_id: 3,
        bus_voltage_mv: 5120,
        current_ma: -34.2,
        water_level: 62,
        water_distance_mm: 940,
        boot_count: 187,
        sensor_ok: 3, // 0x03 = both bits set
        seq: 128,
        e2e_latency_ms: 245,
        toa_ms: 42,
      };
      const result = validator.validateSensorStatus(msg);
      expect(result.valid).toBe(true);
    });

    it('rejects water_level out of range', () => {
      const msg = { source: 'sensor', node_id: 3, water_level: 150, /* ... */ };
      const result = validator.validateSensorStatus(msg);
      expect(result.valid).toBe(false);
    });

    it('rejects sensor_ok > 255', () => {
      const msg = { source: 'sensor', node_id: 3, sensor_ok: 256, /* ... */ };
      const result = validator.validateSensorStatus(msg);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateHeartbeat', () => {
    it('accepts valid heartbeat packet', () => {
      const msg = {
        device: 'MasterBridge',
        wifi_connected: true,
        wifi_channel: 6,
        mqtt_connected: true,
        mode: 1,
        auto_rule_active: false,
        target_node_id: 0,
        nodes: {
          1: { online: true, seen_ms_ago: 1000 },
          2: { online: false, seen_ms_ago: 25000 },
          3: { online: true, seen_ms_ago: 5000 },
          4: { online: true, seen_ms_ago: 2000 },
        },
      };
      const result = validator.validateHeartbeat(msg);
      expect(result.valid).toBe(true);
    });

    it('rejects mode > 1', () => {
      const msg = { /* ... */ mode: 2, /* ... */ };
      const result = validator.validateHeartbeat(msg);
      expect(result.valid).toBe(false);
    });
  });
});