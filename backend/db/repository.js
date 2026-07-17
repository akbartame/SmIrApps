const db = require('./index');

function parseRow(row) {
  if (!row) return null;
  const { payload, ...rest } = row;
  return { ...rest, ...JSON.parse(payload) };
}

// ---------------------------------------------------------------- nodesensor

const stmtUpsertLatest = db.prepare(`
  INSERT INTO nodesensor_latest (node_id, source, payload, received_at)
  VALUES (@node_id, @source, @payload, @received_at)
  ON CONFLICT(node_id) DO UPDATE SET
    source = excluded.source,
    payload = excluded.payload,
    received_at = excluded.received_at
`);

const stmtInsertHistory = db.prepare(`
  INSERT INTO nodesensor_history (node_id, source, payload, received_at)
  VALUES (@node_id, @source, @payload, @received_at)
`);

const txSaveNodesensor = db.transaction((row) => {
  stmtUpsertLatest.run(row);
  stmtInsertHistory.run(row);
});

function saveNodesensor(msg) {
  const row = {
    node_id: msg.node_id,
    source: msg.source,
    payload: JSON.stringify(msg),
    received_at: Date.now(),
  };
  txSaveNodesensor(row);
  return row.received_at;
}

const stmtGetLatestByNode = db.prepare(`SELECT * FROM nodesensor_latest WHERE node_id = ?`);
const stmtGetAllLatest = db.prepare(`SELECT * FROM nodesensor_latest ORDER BY node_id`);
const stmtGetHistoryByNode = db.prepare(`
  SELECT * FROM nodesensor_history WHERE node_id = ?
  ORDER BY received_at DESC LIMIT ?
`);

function getLatestByNode(nodeId) {
  return parseRow(stmtGetLatestByNode.get(nodeId));
}

function getAllLatest() {
  return stmtGetAllLatest.all().map(parseRow);
}

function getHistoryByNode(nodeId, limit = 100) {
  return stmtGetHistoryByNode.all(nodeId, limit).map(parseRow);
}

// Chronological (ascending) — for chart plotting, unlike getHistoryByNode
// above which is newest-first for "recent readings list" use.
const stmtGetHistoryByNodeRange = db.prepare(`
  SELECT * FROM nodesensor_history
  WHERE node_id = ? AND received_at >= ? AND received_at <= ?
  ORDER BY received_at ASC
  LIMIT ?
`);

function getHistoryByNodeRange(nodeId, fromTs, toTs, limit = 5000) {
  return stmtGetHistoryByNodeRange.all(nodeId, fromTs, toTs, limit).map(parseRow);
}

// -------------------------------------------------------------- master/status

const stmtUpsertMasterStatus = db.prepare(`
  INSERT INTO master_status_latest (id, payload, received_at)
  VALUES (1, @payload, @received_at)
  ON CONFLICT(id) DO UPDATE SET
    payload = excluded.payload,
    received_at = excluded.received_at
`);

const stmtGetMasterStatus = db.prepare(`SELECT * FROM master_status_latest WHERE id = 1`);

const stmtInsertStatusHistory = db.prepare(`
  INSERT INTO status_history (kind, payload, received_at) VALUES (?, ?, ?)
`);

function saveHeartbeat(msg) {
  const now = Date.now();
  stmtUpsertMasterStatus.run({ payload: JSON.stringify(msg), received_at: now });
  stmtInsertStatusHistory.run('heartbeat', JSON.stringify(msg), now);
}

function saveStatusEvent(msg) {
  stmtInsertStatusHistory.run(msg.event, JSON.stringify(msg), Date.now());
}

function getMasterStatus() {
  return parseRow(stmtGetMasterStatus.get());
}

// ------------------------------------------------------------------ commands

const stmtInsertCommand = db.prepare(`
  INSERT INTO commands
    (node_id, mode, target_node_id, solenoid_state, auto_on_level, auto_off_level, status, requested_at, updated_at)
  VALUES
    (@node_id, @mode, @target_node_id, @solenoid_state, @auto_on_level, @auto_off_level, @status, @now, @now)
`);

function createCommand(payload) {
  const now = Date.now();
  const info = stmtInsertCommand.run({
    node_id: payload.target_node_id ?? null,
    mode: payload.mode,
    target_node_id: payload.target_node_id ?? null,
    solenoid_state: payload.solenoid_state ?? null,
    auto_on_level: payload.auto_on_level ?? null,
    auto_off_level: payload.auto_off_level ?? null,
    // mode 0 has no documented ack/confirm flow — mark it terminal immediately.
    status: payload.mode === 0 ? 'sent' : 'pending',
    now,
  });
  return info.lastInsertRowid;
}

const stmtGetCommandById = db.prepare(`SELECT * FROM commands WHERE id = ?`);

function getCommandById(id) {
  return stmtGetCommandById.get(id) || null;
}

// NOTE / known limitation: correlation between an inbound status event or
// relay reading and a specific outstanding command is done by "oldest
// pending/not_confirmed command for this node_id" (FIFO), because the
// control payload this backend publishes has no seq of its own — seq is
// assigned internally by the master and only surfaces later, inside the
// command_send_failed / command_not_confirmed events. If a client issues a
// second command for the same node before the first one resolves, this FIFO
// matching can misattribute which command a given event/status belongs to.
// Safe as long as callers wait for one command to resolve (or go stale)
// before sending another for the same node.
const stmtGetOldestPendingByNode = db.prepare(`
  SELECT * FROM commands
  WHERE node_id = ? AND status IN ('pending', 'not_confirmed')
  ORDER BY requested_at ASC
  LIMIT 1
`);

function getOldestPendingByNode(nodeId) {
  return stmtGetOldestPendingByNode.get(nodeId) || null;
}

const stmtUpdateCommandStatus = db.prepare(`
  UPDATE commands
  SET status = ?, master_seq = COALESCE(?, master_seq), updated_at = ?, confirmed_at = ?
  WHERE id = ?
`);

function markCommand(id, status, { masterSeq = null, confirmedAt = null } = {}) {
  stmtUpdateCommandStatus.run(status, masterSeq, Date.now(), confirmedAt, id);
}

const stmtGetStalePending = db.prepare(`
  SELECT * FROM commands WHERE status IN ('pending', 'not_confirmed') AND requested_at < ?
`);

function getStalePending(cutoffTs) {
  return stmtGetStalePending.all(cutoffTs);
}

module.exports = {
  saveNodesensor,
  getLatestByNode,
  getAllLatest,
  getHistoryByNode,
  getHistoryByNodeRange,
  saveHeartbeat,
  saveStatusEvent,
  getMasterStatus,
  createCommand,
  getCommandById,
  getOldestPendingByNode,
  markCommand,
  getStalePending,
};
