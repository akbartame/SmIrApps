const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const nodesRouter = require('./routes/nodes');
const statusRouter = require('./routes/status');
const controlRouter = require('./routes/control');
const commandsRouter = require('./routes/commands');
const diagnosticsRouter = require('./routes/diagnostics');
const phasesRouter = require('./routes/automation/phases');
const stateRouter = require('./routes/automation/state');
const eventsRouter = require('./routes/automation/events');

function createApp(mqttClient) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());
  app.use(morgan(':method :url :status :response-time ms'));
  
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/nodes', nodesRouter);
  app.use('/status', statusRouter);
  app.use('/control', controlRouter(mqttClient));
  app.use('/commands', commandsRouter);
  app.use('/automation', phasesRouter);
  app.use('/automation', stateRouter);
  app.use('/automation', eventsRouter);

  // Buat objek stats yang dievaluasi secara dinamis
  const systemStats = {
    get mqttConnected() { 
      return mqttClient.connected; 
    },
    // Jika Anda belum menambahkan listener untuk melacak waktu pesan terakhir,
    // biarkan null agar tidak menyebabkan undefined error.
    lastMessageAt: null 
  };
  
  // Daftarkan route diagnostics SEBELUM handler 404
  app.use('/diagnostics', diagnosticsRouter(systemStats));

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  });
  
  return app;
}

module.exports = { createApp };