    const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { initializeDatabaseState } = require('../init');

const dbPath = path.join(__dirname, 'tmp-automation-migration.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE plant_phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    min_water_level_pct INTEGER NOT NULL,
    max_water_level_pct INTEGER NOT NULL,
    is_system_phase BOOLEAN DEFAULT false,
    order_index REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE field_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    first_planting_date INTEGER,
    current_phase_id INTEGER NOT NULL,
    phase_started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE automation_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_check_at INTEGER,
    last_water_level INTEGER,
    last_solenoid_state INTEGER,
    last_action TEXT,
    next_allowed_action_at INTEGER,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE sensor_health (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sensor_node_ids TEXT,
    last_sensor_update_at INTEGER,
    updated_at INTEGER NOT NULL
  );
`);

initializeDatabaseState(db, 1722700000000);

const fieldColumns = db.prepare("PRAGMA table_info(field_state)").all().map((row) => row.name);
const automationColumns = db.prepare("PRAGMA table_info(automation_state)").all().map((row) => row.name);
const sensorColumns = db.prepare("PRAGMA table_info(sensor_health)").all().map((row) => row.name);

assert.ok(fieldColumns.includes('automation_enabled'), 'field_state should gain automation_enabled');
assert.ok(automationColumns.includes('min_toggle_interval_ms'), 'automation_state should gain min_toggle_interval_ms');
assert.ok(sensorColumns.includes('offline_alert_sent_at'), 'sensor_health should gain offline_alert_sent_at');

console.log('migration test passed');

db.close();
fs.unlinkSync(dbPath);
