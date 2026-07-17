# SmIr Backend

Node.js backend for the SmIr irrigation/monitoring system, built against
`MQTT_DATA_REFERENCE.md` / `BACKEND_INTEGRATION_GUIDE.md`.

**Status: syntax-checked only, not runtime-tested.** This sandbox has no
network access, so `npm install` could not run and nothing here has actually
connected to `broker.hivemq.com` or been hit with real traffic. Treat this as
a first pass to run and debug locally, not a verified working system.

## Layout

```
config/     dotenv-backed config object
db/         better-sqlite3 connection, schema.sql, repository.js (all queries)
mqtt/       client (connect/subscribe), handlers (ingest + reconcile), publisher, stale sweeper
api/        express app + routes
script/     monthly Parquet archiver
index.js    entrypoint — wires everything, starts the API server
```

## Setup

```bash
npm install
cp .env.example .env
npm start
```

## Data model

Two tables per inbound topic: a `*_latest` table for O(1) current-state
reads, and a `*_history` table that the archiver drains monthly. A separate
`commands` table tracks every command this backend has published and its
confirmation lifecycle (see next section).

## Command confirmation — how it actually works, and its limitation

The docs describe an important nuance: a `command_not_confirmed` event does
**not** mean the command failed — only that the ack was lost. The real state
has to be reconciled against the next `SmIr/nodesensor` (`source: "relay"`)
packet for that node.

This backend implements that: `POST /control` publishes and returns
immediately with a `command_id`; `GET /commands/:id` reports the current
status (`pending` → `confirmed` / `send_failed` / `stale`).

**The correlation problem, and how I solved it — read this before trusting
it under load:** the control payload this backend publishes has no id of its
own. The master's `seq` only appears later, inside the
`command_send_failed`/`command_not_confirmed` events, so there's no way to
know it in advance. I matched events and reconciling relay packets to
commands by **"oldest still-pending command for that node_id" (FIFO)**. This
is correct as long as you wait for one command on a given node to resolve
(confirmed/failed/stale) before sending another for the *same* node. If a
client fires two commands at the same node back-to-back before the first
resolves, they can get cross-attributed — I have not built any protection
against that (e.g. a per-node command lock at the API layer). If your
frontend can plausibly do that, it needs to be added; I'd flag it as the
single biggest correctness gap in this design.

`mode: 0` (global off) has no ack/confirm flow described in the docs, so
commands with `mode: 0` are marked `sent` immediately and never tracked
further — don't poll `GET /commands/:id` expecting it to move.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | liveness check |
| GET | `/nodes` | latest reading for every node |
| GET | `/nodes/:id` | latest reading for one node |
| GET | `/nodes/:id/history?limit=100` | recent readings, **newest-first**, max 1000 — for "recent list" style UI |
| GET | `/nodes/:id/history?from=<ms>&to=<ms>&limit=5000` | readings in a time window, **chronological**, max 20000 — for chart plotting |
| GET | `/status` | latest master heartbeat |
| POST | `/control` | publish a command, returns `{ command_id }` — see body shapes below |
| GET | `/commands/:id` | poll confirmation status of a published command (fallback; prefer the WS `command_update` event, see below) |
| WS | `/ws` | real-time push, see below |

## WebSocket (`/ws`)

Connect to `ws://<host>:<port>/ws`. No auth, no subscribe handshake needed —
every connected client gets every broadcast. Messages are JSON:
`{ type, data, ts }`.

| `type` | `data` | When |
|---|---|---|
| `nodesensor` | full `SmIr/nodesensor` message + `received_at` | every inbound relay/sensor reading |
| `heartbeat` | full `SmIr/status` master heartbeat | every ~10s |
| `command_update` | full row from the `commands` table | whenever a command's status changes (`pending` → `confirmed` / `send_failed` / `not_confirmed` / `stale`) |
| `status_event` | raw `command_send_failed` / `command_not_confirmed` event | as they occur (informational; command_update is the one to drive UI state off of) |

This is what backs "waiting for confirmation" in the frontend: `POST
/control` returns a `command_id` with `pending` immediately, the UI shows a
waiting state, and the transition to a final state comes from a
`command_update` broadcast — not from the client polling `/commands/:id` in
a loop. The REST endpoint stays as a fallback for initial load or if a
client missed a broadcast while reconnecting.

`POST /control` body — mirrors `SmIr/control` from the docs:

```json
// mode 0 — global off, no target needed
{ "mode": 0 }

// mode 1 — manual on/off
{ "mode": 1, "target_node_id": 1, "solenoid_state": 1 }

// mode 2 — auto, level-based
{ "mode": 2, "target_node_id": 1, "solenoid_state": 1, "auto_on_level": 70, "auto_off_level": 30 }
```

`target_node_id` is validated to 1 or 2 (only relay nodes have a solenoid;
sending to 3/4 wouldn't error at the device but also wouldn't do anything
physically, per the docs — this backend rejects it outright instead of
publishing a no-op).

## Parquet archiver

```bash
npm run archive              # archives last calendar month
node script/archive-to-parquet.js 2026-06   # archive a specific month
```

**Chose `parquetjs-lite` per your instruction** — worth restating the
tradeoff you already accepted: it's a pure-JS writer with a small, not
actively maintained dependency footprint. It also requires a single fixed
schema per file, and `nodesensor_history` contains two incompatible payload
shapes (`source: "relay"` vs `source: "sensor"`). Rather than force both into
one flattened schema (risking silently dropped or null-padded fields if
firmware payloads drift), the archiver stores `payload` as a raw JSON string
column plus the indexed fields (`id`, `node_id`, `received_at`). Anyone
querying the Parquet files downstream needs to `JSON.parse()` that column
themselves — e.g. in DuckDB: `json_extract(payload, '$.water_level_a')`.

Rows are only deleted from SQLite after the Parquet file for that month is
fully written and closed. Run it via cron, e.g.:

```
0 3 1 * * cd /path/to/backend && node script/archive-to-parquet.js >> archive.log 2>&1
```

## Known gaps / things I did not verify

- **Not runtime-tested** (no network in this environment) — no dependency
  version has actually been resolved or run against real MQTT traffic.
- **No auth on the API** — matches the broker's own posture (public,
  unauthenticated) but the docs explicitly flag that as prototype-only. If
  this API becomes internet-facing, it needs its own auth layer; nothing
  here adds one.
- **Concurrent commands per node** — see the FIFO correlation limitation
  above.
- `ARCHIVE_RETENTION_DAYS` in `.env.example` is not enforced by any code
  path yet — the archiver only ever deletes rows for the specific month it
  just archived.
