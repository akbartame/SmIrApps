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

module.exports = db;
