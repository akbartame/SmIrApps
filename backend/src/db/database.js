import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/fsiot.db');

// Open (or create) the database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL'); // Better concurrency
db.pragma('synchronous = NORMAL'); // Good durability with better performance

export default db;

export function closeDatabase() {
    try {
        db.close();
        console.log('[DB] Database connection closed');
    } catch (err) {
        console.error('[DB] Error closing database:', err.message);
    }
}
