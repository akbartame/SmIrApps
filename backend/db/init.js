const DEFAULT_SYSTEM_PHASES = [
  { name: 'tanam', minWaterLevelPct: 20, maxWaterLevelPct: 50, orderIndex: 0 },
  { name: 'vegetatif', minWaterLevelPct: 50, maxWaterLevelPct: 100, orderIndex: 1 },
  { name: 'primordia', minWaterLevelPct: 100, maxWaterLevelPct: 150, orderIndex: 2 },
  { name: 'pengisian', minWaterLevelPct: 150, maxWaterLevelPct: 200, orderIndex: 3 },
  { name: 'pematangan', minWaterLevelPct: 0, maxWaterLevelPct: 10, orderIndex: 4 },
];

function seedSystemPhases(db, now = Date.now()) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO plant_phases (
      name,
      min_water_level_pct,
      max_water_level_pct,
      is_system_phase,
      order_index,
      created_at,
      updated_at
    )
    VALUES (
      @name,
      @minWaterLevelPct,
      @maxWaterLevelPct,
      1,
      @orderIndex,
      @now,
      @now
    )
  `);

  const tx = db.transaction((rows) => {
    rows.forEach((phase) => stmt.run({ ...phase, now }));
  });

  tx(DEFAULT_SYSTEM_PHASES);
}

function ensureAutomationColumns(db) {
  const fieldColumns = db.prepare("PRAGMA table_info(field_state)").all().map((row) => row.name);
  if (!fieldColumns.includes('automation_enabled')) {
    db.exec('ALTER TABLE field_state ADD COLUMN automation_enabled BOOLEAN DEFAULT true');
  }

  const automationColumns = db.prepare("PRAGMA table_info(automation_state)").all().map((row) => row.name);
  if (!automationColumns.includes('min_toggle_interval_ms')) {
    db.exec('ALTER TABLE automation_state ADD COLUMN min_toggle_interval_ms INTEGER DEFAULT 120000');
  }

  const sensorColumns = db.prepare("PRAGMA table_info(sensor_health)").all().map((row) => row.name);
  if (!sensorColumns.includes('offline_alert_sent_at')) {
    db.exec('ALTER TABLE sensor_health ADD COLUMN offline_alert_sent_at INTEGER');
  }
}

function seedSingletonAutomationState(db, now = Date.now()) {
  ensureAutomationColumns(db);

  db.exec(`
    INSERT OR IGNORE INTO field_state (
      id, first_planting_date, current_phase_id, phase_started_at, automation_enabled, updated_at
    )
    SELECT 1, NULL, id, ${now}, 0, ${now}
    FROM plant_phases
    WHERE name = 'tanam';

    INSERT OR IGNORE INTO automation_state (
      id,
      last_check_at,
      last_water_level,
      last_solenoid_state,
      last_action,
      next_allowed_action_at,
      min_toggle_interval_ms,
      updated_at
    )
    VALUES (1, NULL, NULL, NULL, NULL, NULL, 120000, ${now});

    INSERT OR IGNORE INTO sensor_health (
      id,
      sensor_node_ids,
      last_sensor_update_at,
      offline_alert_sent_at,
      updated_at
    )
    VALUES (1, '3,4', NULL, NULL, ${now});
  `);
}

function initializeDatabaseState(db, now = Date.now()) {
  seedSystemPhases(db, now);
  seedSingletonAutomationState(db, now);
}

module.exports = {
  DEFAULT_SYSTEM_PHASES,
  seedSystemPhases,
  seedSingletonAutomationState,
  initializeDatabaseState,
};
