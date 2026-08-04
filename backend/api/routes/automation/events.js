const express = require('express');
const db = require('../../../db');
const hub = require('../../../ws/hub');

const router = express.Router();

function now() {
  return Date.now();
}

function parsePositiveInt(value, fallback, fieldName) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

router.get('/events', (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, 'limit');
    const offset = parsePositiveInt(req.query.offset, 0, 'offset');
    const typeFilter = typeof req.query.type === 'string' ? req.query.type : null;
    const severityFilter = typeof req.query.severity === 'string' ? req.query.severity : null;
    const unresolvedOnly = req.query.unresolved_only === 'true';

    const clauses = [];
    const params = [];

    if (typeFilter) {
      clauses.push('event_type = ?');
      params.push(typeFilter);
    }
    if (severityFilter) {
      clauses.push('severity = ?');
      params.push(severityFilter);
    }
    if (unresolvedOnly) {
      clauses.push('resolved_at IS NULL');
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM automation_events ${whereClause}`);
    const total = countStmt.get(...params).total;

    const selectStmt = db.prepare(`
      SELECT * FROM automation_events
      ${whereClause}
      ORDER BY triggered_at DESC, id DESC
      LIMIT ? OFFSET ?
    `);
    const events = selectStmt.all(...params, limit, offset);

    return res.json({
      events,
      total,
      offset,
      limit,
    });
  } catch (err) {
    if (err.message.includes('must be')) {
      return res.status(400).json({ error: 'validation_error', detail: err.message });
    }
    console.error('[automation/events] list failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/events/:id/resolve', (req, res) => {
  try {
    if (req.body && req.body.confirm !== true) {
      return res.status(400).json({ error: 'confirmation_required', detail: 'confirm must be true' });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_event_id' });
    }

    const event = db.prepare('SELECT * FROM automation_events WHERE id = ?').get(id);
    if (!event) {
      return res.status(404).json({ error: 'event_not_found' });
    }

    if (event.resolved_at) {
      return res.json({ id: event.id, resolved_at: event.resolved_at });
    }

    const resolvedAt = now();
    db.prepare('UPDATE automation_events SET resolved_at = ? WHERE id = ?').run(resolvedAt, id);
    hub.broadcast('event_resolved', { event_id: id, resolved_at: resolvedAt });

    return res.json({ id, resolved_at: resolvedAt });
  } catch (err) {
    console.error('[automation/events] resolve failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
