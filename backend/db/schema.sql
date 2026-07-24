-- Latest known state per node from SmIr/nodesensor (either source: "relay" or "sensor")
CREATE TABLE IF NOT EXISTS nodesensor_latest (
  node_id     INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,
  payload     TEXT NOT NULL,  -- full original JSON message, verbatim
  received_at INTEGER NOT NULL -- unix ms
);

-- Full history of every SmIr/nodesensor message, for archiving.
CREATE TABLE IF NOT EXISTS nodesensor_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id     INTEGER NOT NULL,
  source      TEXT NOT NULL,
  payload     TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodesensor_history_node_time
  ON nodesensor_history (node_id, received_at);

-- Latest master heartbeat (single row, id is always 1).
CREATE TABLE IF NOT EXISTS master_status_latest (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  payload     TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

-- Full history of SmIr/status messages: heartbeats + one-off events
-- (command_send_failed, command_not_confirmed). kind = 'heartbeat' or the
-- event name.
CREATE TABLE IF NOT EXISTS status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_history_time ON status_history (received_at);

-- Every control command this backend has published, plus its reconciliation
-- lifecycle. See db/repository.js and mqtt/handlers.js for how status
-- transitions happen.
--
-- status values:
--   'sent'          - mode 0 (global off); no per-node ack is described in
--                      the docs for this case, so it is not tracked further.
--   'pending'       - mode 1 published, no send_failed/not_confirmed event yet.
--   'send_failed'   - master rejected it at the radio layer (ESP-NOW send
--                      itself failed) — genuinely failed, per docs.
--   'not_confirmed' - ack timed out, but per docs this does NOT mean the
--                      command failed — waiting on a relay status packet.
--   'confirmed'     - a subsequent relay status packet's solenoid_state
--                      matched what was requested.
--   'stale'         - reconcileStaleMs elapsed with no matching relay status;
--                      genuinely unknown outcome, not a confirmed failure.
--
-- Notes:
-- - mode: 0 = global OFF, 1 = manual relay control. Mode 2 (auto) removed from firmware.
-- - auto_on_level, auto_off_level: kept for schema compatibility, always null (not used).
-- - master_seq: populated when an ack event (command_send_failed, command_not_confirmed)
--   arrives with a seq field. Used for debugging/audit.
CREATE TABLE IF NOT EXISTS commands (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id         INTEGER,           -- null for mode 0 (global), relay node id (1-2) for mode 1
  mode            INTEGER NOT NULL,  -- 0 = global OFF, 1 = manual relay control
  target_node_id  INTEGER,           -- for mode 1: relay node to command (1 or 2)
  solenoid_state  INTEGER,           -- for mode 1: 0 (OFF) or 1 (ON)
  auto_on_level   INTEGER,           -- DEPRECATED: kept for schema compat, always null
  auto_off_level  INTEGER,           -- DEPRECATED: kept for schema compat, always null
  status          TEXT NOT NULL DEFAULT 'pending',
  master_seq      INTEGER,           -- populated from ack event, used for audit/correlation
  requested_at    INTEGER NOT NULL,  -- unix ms when command was published
  updated_at      INTEGER NOT NULL,  -- unix ms when status last changed
  confirmed_at    INTEGER            -- unix ms when command was confirmed
);
CREATE INDEX IF NOT EXISTS idx_commands_node_status ON commands (node_id, status);