const express = require('express');
const repo = require('../../db/repository');

const router = express.Router();

// GET /commands/:id — status: sent | pending | send_failed | not_confirmed | confirmed | stale
router.get('/:id', (req, res) => {
  const cmd = repo.getCommandById(Number(req.params.id));
  if (!cmd) return res.status(404).json({ error: 'command_not_found' });
  res.json(cmd);
});

module.exports = router;
