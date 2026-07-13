import { initDatabase } from './src/db/init.js';
import { closeDatabase } from './src/db/database.js';
import { startMaintenanceJob } from './src/db/maintenance.js';
import { createMqttClient } from './src/mqtt/client.js';
import { registerSubscriber } from './src/mqtt/subscriber.js';
import { createHttpServer } from './src/api/server.js';
import { SERVER } from './src/config/index.js';
import { startAggregatorCron } from './src/cron/aggregator.js';

let mqttClient = null;
let httpServer = null;
let maintenanceInterval = null;

console.log('[APP] Starting FullStackIOT Backend...');

// Initialize database on startup
try {
    initDatabase();
    startAggregatorCron();
} catch (err) {
    console.error('[APP] Fatal: Database initialization failed:', err.message);
    process.exit(1);
}

// Create and configure MQTT client
try {
    mqttClient = createMqttClient();
    registerSubscriber(mqttClient);
} catch (err) {
    console.error('[APP] Fatal: MQTT client initialization failed:', err.message);
    closeDatabase();
    process.exit(1);
}

// Start HTTP control server
try {
    const app = createHttpServer(SERVER.port);
    httpServer = app.listen(SERVER.port, SERVER.bindAddr, () => {
        console.log(`[API] Control server listening on http://${SERVER.bindAddr}:${SERVER.port}`);
    });
} catch (err) {
    console.error('[APP] Fatal: HTTP server initialization failed:', err.message);
    closeDatabase();
    mqttClient.end();
    process.exit(1);
}

// Start database maintenance job (cleanup old invalid records)
try {
    maintenanceInterval = startMaintenanceJob();
} catch (err) {
    console.error('[APP] Warning: Maintenance job failed to start:', err.message);
}

console.log('[APP] Backend initialization complete');

// ── Graceful Shutdown ──────────────────────────────────────────
function gracefulShutdown(signal) {
    console.log(`\n[APP] Received ${signal}, shutting down gracefully...`);

    const forceExit = setTimeout(() => {
        console.log('[APP] Shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, 5000);

    // Allow the timeout to not block the process if everything closes cleanly
    forceExit.unref();

    function teardown() {
        if (maintenanceInterval) {
            clearInterval(maintenanceInterval);
            console.log('[DB] Maintenance job stopped');
        }

        if (mqttClient) {
            mqttClient.end(false, () => {
                console.log('[MQTT] Client disconnected');
                closeDatabase();
                process.exit(0);
            });
        } else {
            closeDatabase();
            process.exit(0);
        }
    }

    if (httpServer) {
        httpServer.close(() => {
            console.log('[API] Server closed');
            teardown();
        });
    } else {
        teardown();
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── Unhandled Error Handlers ──────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('[APP] Uncaught exception:', err);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[APP] Unhandled rejection at', promise, ':', reason);
});
