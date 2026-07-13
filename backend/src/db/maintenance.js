import db from './database.js';

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function cleanupInvalidReadings() {
    const retentionDaysAgo = Date.now() - RETENTION_MS;
    const retentionDaysAgoSeconds = Math.floor(retentionDaysAgo / 1000);
    
    try {
        const result = db.prepare(`
            DELETE FROM sensor_readings 
            WHERE is_valid = 0 AND received_at < ?
        `).run(retentionDaysAgoSeconds);
        
        if (result.changes > 0) {
            console.log(`[DB] Cleanup: Deleted ${result.changes} invalid readings older than ${RETENTION_DAYS} days`);
        }
    } catch (err) {
        console.error('[DB] Cleanup failed:', err.message);
    }
}

/**
 * Start periodic cleanup job (runs every 24 hours)
 */
export function startMaintenanceJob() {
    // Run cleanup immediately on startup
    cleanupInvalidReadings();
    
    // Then run every 24 hours
    const interval = setInterval(() => {
        cleanupInvalidReadings();
    }, 24 * 60 * 60 * 1000);
    
    console.log(`[DB] Maintenance job started (cleanup every 24 hours)`);
    
    return interval;
}