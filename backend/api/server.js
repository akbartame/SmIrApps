const express = require('express');
const cors = require('cors');

const nodesRouter = require('./routes/nodes');
const statusRouter = require('./routes/status');
const controlRouter = require('./routes/control');
const commandsRouter = require('./routes/commands');

function createApp(mqttClient) {
  const app = express();
  // Open CORS by default — this matches the broker's own unauthenticated
  // posture per the docs, i.e. fine for prototype/dev, not for anything
  // internet-facing. Restrict via `origin` before deploying for real.
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/nodes', nodesRouter);
  app.use('/status', statusRouter);
  app.use('/control', controlRouter(mqttClient));
  app.use('/commands', commandsRouter);

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };
