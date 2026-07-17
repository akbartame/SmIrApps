const express = require('express');
const repo = require('../../db/repository');

const router = express.Router();

// GET /status — latest master heartbeat (wifi, mqtt, mode, per-node online map)
router.get('/', (req, res) => {
  const row = repo.getMasterStatus();
  if (!row) return res.status(404).json({ error: 'no_heartbeat_received_yet' });
  res.json(row);
});

module.exports = router;
