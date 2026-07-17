const express = require('express');
const repo = require('../../db/repository');

const router = express.Router();

// GET /nodes — latest known reading for every node that has ever reported in
router.get('/', (req, res) => {
  res.json(repo.getAllLatest());
});

// GET /nodes/:id — latest reading for a single node
router.get('/:id', (req, res) => {
  const nodeId = Number(req.params.id);
  const row = repo.getLatestByNode(nodeId);
  if (!row) return res.status(404).json({ error: 'node_not_found' });
  res.json(row);
});

// GET /nodes/:id/history?limit=100 — most recent N readings, newest first
// GET /nodes/:id/history?from=<ms>&to=<ms>&limit=5000 — chronological (ascending),
//   for chart plotting over an adjustable time range. `from`/`to` are unix ms.
router.get('/:id/history', (req, res) => {
  const nodeId = Number(req.params.id);
  const { from, to } = req.query;

  if (from !== undefined || to !== undefined) {
    const fromTs = from !== undefined ? Number(from) : 0;
    const toTs = to !== undefined ? Number(to) : Date.now();
    const limit = Math.min(Number(req.query.limit) || 5000, 20000);
    return res.json(repo.getHistoryByNodeRange(nodeId, fromTs, toTs, limit));
  }

  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  res.json(repo.getHistoryByNode(nodeId, limit));
});

module.exports = router;
