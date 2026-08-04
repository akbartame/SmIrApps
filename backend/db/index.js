const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { initializeDatabaseState } = require('./init');

const dbDir = path.dirname(config.db.path);
if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const now = Date.now();
initializeDatabaseState(db, now);

try {
  const fieldColumns = db.prepare('PRAGMA table_info(field_state)').all().map((row) => row.name);
  if (!fieldColumns.includes('automation_enabled')) {
    db.exec('ALTER TABLE field_state ADD COLUMN automation_enabled BOOLEAN DEFAULT true');
  }

  const automationColumns = db.prepare('PRAGMA table_info(automation_state)').all().map((row) => row.name);
  if (!automationColumns.includes('min_toggle_interval_ms')) {
    db.exec('ALTER TABLE automation_state ADD COLUMN min_toggle_interval_ms INTEGER DEFAULT 120000');
  }

  const sensorColumns = db.prepare('PRAGMA table_info(sensor_health)').all().map((row) => row.name);
  if (!sensorColumns.includes('offline_alert_sent_at')) {
    db.exec('ALTER TABLE sensor_health ADD COLUMN offline_alert_sent_at INTEGER');
  }
} catch (err) {
  console.error('[db] schema migration failed:', err.message);
}

module.exports = db;
