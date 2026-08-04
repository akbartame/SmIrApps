# SmIrApps Backend: Phase-Based Automatic Watering System Design

## Overview

The backend extends the existing control pipeline with an automated decision loop that monitors water levels, transitions between rice growth phases, and manages solenoid state based on hysteresis-driven targets. All decisions are logged for audit and safety.

---

## 1. Database Schema Additions

### 1.1 Plant Phases Configuration

**Table: `plant_phases`**

Stores phase definitions (system-locked and user-custom). System phases have fixed order; custom phases can be inserted anywhere.

```sql
CREATE TABLE IF NOT EXISTS plant_phases (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL UNIQUE,           -- 'tanam', 'vegetatif', 'preplant' (custom), etc.
  min_water_level_pct   INTEGER NOT NULL,               -- e.g., 20 for 20%
  max_water_level_pct   INTEGER NOT NULL,               -- e.g., 50 for 50%
  is_system_phase       BOOLEAN DEFAULT false,          -- true for tanam/vegetatif/primordia/pengisian/pematangan
  order_index           REAL,                           -- 0, 1, 2, 3, 4 for system; 0.5, 1.5, etc. for custom
  created_at            INTEGER NOT NULL,               -- unix ms
  updated_at            INTEGER NOT NULL                -- unix ms
);

-- System phases seeded at init (run once):
INSERT INTO plant_phases (name, min_water_level_pct, max_water_level_pct, is_system_phase, order_index, created_at, updated_at)
VALUES
  ('tanam', 20, 50, true, 0, timestamp, timestamp),
  ('vegetatif', 50, 100, true, 1, timestamp, timestamp),
  ('primordia', 100, 150, true, 2, timestamp, timestamp),
  ('pengisian', 150, 200, true, 3, timestamp, timestamp),
  ('pematangan', 0, 10, true, 4, timestamp, timestamp);
```

**Fields:**
- `id`: Unique phase identifier
- `name`: Human-readable phase name (unique)
- `min_water_level_pct`, `max_water_level_pct`: Hysteresis thresholds (0–100% scale from device firmware)
- `is_system_phase`: If true, cannot be deleted; order is fixed. If false, custom phase (can be deleted, order is mutable)
- `order_index`: Determines navigation sequence (Next Phase follows ascending order_index)
- `created_at`, `updated_at`: Audit timestamps

---

### 1.2 Field State (Season)

**Table: `field_state`**

Singleton table (id=1) tracking the current season's state.

```sql
CREATE TABLE IF NOT EXISTS field_state (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  first_planting_date     INTEGER,                       -- unix ms; null until farmer starts tanam
  current_phase_id        INTEGER NOT NULL REFERENCES plant_phases(id),
  phase_started_at        INTEGER NOT NULL,              -- unix ms; when farmer entered this phase
  automation_enabled      BOOLEAN DEFAULT true,
  updated_at              INTEGER NOT NULL
);
```

**Fields:**
- `id`: Always 1 (singleton)
- `first_planting_date`: Set when farmer clicks "Start Season" in tanam phase. Null if no season active yet.
- `current_phase_id`: Foreign key to current phase
- `phase_started_at`: Timestamp of phase entry (used to calculate "days in phase")
- `automation_enabled`: Toggled OFF if sensors offline >30 min; can be manually toggled by farmer
- `updated_at`: Last state change timestamp

---

### 1.3 Phase Transition History

**Table: `phase_transitions`**

Audit log of all phase movements (system-driven or user-triggered).

```sql
CREATE TABLE IF NOT EXISTS phase_transitions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_phase_id   INTEGER REFERENCES plant_phases(id),  -- null if transition from initial state
  to_phase_id     INTEGER NOT NULL REFERENCES plant_phases(id),
  triggered_at    INTEGER NOT NULL,                     -- unix ms
  triggered_by    TEXT NOT NULL,                        -- 'manual_user_action' or 'sensor_resume' (future: auto timer)
  notes           TEXT                                  -- optional context
);

CREATE INDEX idx_phase_transitions_time ON phase_transitions (triggered_at);
```

**Fields:**
- `id`: Unique transition record
- `from_phase_id`: Previous phase (null if first season start)
- `to_phase_id`: New phase entered
- `triggered_at`: When the transition occurred
- `triggered_by`: Who/what caused it (UI button click vs. automation recovery)
- `notes`: Free-form context (e.g., "Farmer confirmed; expected 35 days vegetative")

---

### 1.4 Automation Events Log

**Table: `automation_events`**

Time-series log of all alerts, warnings, and state changes during automation.

```sql
CREATE TABLE IF NOT EXISTS automation_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT NOT NULL,                          -- 'flow_alert', 'sensor_offline', 'overflow', 'sensor_resume', etc.
  severity      TEXT DEFAULT 'info',                    -- 'info', 'warn', 'error'
  message       TEXT NOT NULL,
  triggered_at  INTEGER NOT NULL,                       -- unix ms
  resolved_at   INTEGER                                 -- null until event is resolved
);

CREATE INDEX idx_automation_events_time ON automation_events (triggered_at);
CREATE INDEX idx_automation_events_unresolved ON automation_events (event_type, resolved_at);
```

**Fields:**
- `id`: Unique event record
- `event_type`: Enum-like; determines UI icon/color ('flow_alert' = warning, 'sensor_resume' = success, etc.)
- `severity`: 'info' (log only), 'warn' (farmer sees), 'error' (critical, automation paused)
- `message`: Human-readable description
- `triggered_at`: When detected
- `resolved_at`: When farmer confirmed/resolved, or null if ongoing

---

### 1.5 Automation State (Runtime)

**Table: `automation_state`**

Singleton table (id=1) tracking the automation loop's runtime state and configuration.

```sql
CREATE TABLE IF NOT EXISTS automation_state (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  last_check_at           INTEGER,                       -- unix ms of last automation loop cycle
  last_water_level        INTEGER,                       -- % (0-100) from latest sensor
  last_solenoid_state     INTEGER,                       -- 0 or 1 (current actual state)
  last_action             TEXT,                          -- 'opened_solenoid', 'closed_solenoid', 'no_action', null (never run)
  next_allowed_action_at  INTEGER,                       -- unix ms; rate-limiting lock
  min_toggle_interval_ms  INTEGER DEFAULT 120000,        -- 2 min default; configurable by admin
  updated_at              INTEGER NOT NULL
);
```

**Fields:**
- `id`: Always 1 (singleton)
- `last_check_at`: Timestamp of last automation loop iteration (for freshness monitoring)
- `last_water_level`: Last % reading from sensors (for display; also used to detect stale data)
- `last_solenoid_state`: Current ground truth (0=OFF, 1=ON)
- `last_action`: What did the loop decide last time (for audit)
- `next_allowed_action_at`: Unix ms when the solenoid can be toggled again (prevents thrashing)
- `min_toggle_interval_ms`: Configurable minimum between toggles (default 2 min = 120000 ms)

---

### 1.6 Sensor Health Tracking

**Table: `sensor_health`**

Singleton table (id=1) monitoring freshness of sensor updates.

```sql
CREATE TABLE IF NOT EXISTS sensor_health (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  sensor_node_ids         TEXT,                          -- '3,4' (comma-separated; LoRa sensor nodes)
  last_sensor_update_at   INTEGER,                       -- unix ms of most recent sensor reading (any node)
  offline_alert_sent_at   INTEGER,                       -- null, or timestamp when ">30 min offline" alert was sent
  updated_at              INTEGER NOT NULL
);
```

**Fields:**
- `id`: Always 1 (singleton)
- `sensor_node_ids`: Which sensor nodes to monitor (e.g., '3,4'). Read from config.
- `last_sensor_update_at`: Latest timestamp from any sensor node (from `nodesensor_latest.received_at`)
- `offline_alert_sent_at`: Timestamp when farmer was alerted of offline state (null = no alert yet this outage)
- `updated_at`: Last record update

---

## 2. API Routes (New & Modified)

### 2.1 Automation Configuration Routes

#### **GET `/automation/phases`**
Returns all phases (system + custom) in order.

**Response:**
```json
{
  "phases": [
    {
      "id": 1,
      "name": "tanam",
      "min_water_level_pct": 20,
      "max_water_level_pct": 50,
      "is_system_phase": true,
      "order_index": 0,
      "typical_duration_days": 5
    },
    {
      "id": 6,
      "name": "preplant",
      "min_water_level_pct": 0,
      "max_water_level_pct": 20,
      "is_system_phase": false,
      "order_index": -0.5,
      "typical_duration_days": null
    },
    ...
  ]
}
```

---

#### **POST `/automation/phases`** (Create custom phase)
Creates a new user-defined phase.

**Request:**
```json
{
  "name": "post-harvest-drain",
  "min_water_level_pct": 0,
  "max_water_level_pct": 10,
  "order_index": 4.5
}
```

**Response:**
```json
{
  "id": 7,
  "name": "post-harvest-drain",
  "min_water_level_pct": 0,
  "max_water_level_pct": 10,
  "is_system_phase": false,
  "order_index": 4.5,
  "created_at": 1722700000000
}
```

**Validation:**
- System phases cannot be created (reject if name in [tanam, vegetatif, primordia, pengisian, pematangan])
- `order_index` must not collide with system phases' indices

---

#### **PUT `/automation/phases/:id`** (Update phase)
Edit phase thresholds or reorder (custom phases only).

**Request:**
```json
{
  "min_water_level_pct": 5,
  "max_water_level_pct": 15,
  "order_index": 1.5
}
```

**Response:**
```json
{
  "id": 6,
  "name": "preplant",
  "min_water_level_pct": 5,
  "max_water_level_pct": 15,
  "is_system_phase": false,
  "order_index": 1.5,
  "updated_at": 1722700100000
}
```

**Validation:**
- System phases: only min/max can be edited; order_index is immutable
- Custom phases: all fields mutable
- Reject if order_index would break sequence (no gaps, no duplicates)

---

#### **DELETE `/automation/phases/:id`** (Delete custom phase only)
Remove a user-defined phase.

**Response:**
```json
{
  "success": true,
  "deleted_id": 6
}
```

**Validation:**
- Reject if `is_system_phase = true` (cannot delete tanam/vegetatif/primordia/pengisian/pematangan)
- Reject if phase is currently active (`field_state.current_phase_id = id`)

---

### 2.2 Field State & Phase Transition Routes

#### **GET `/automation/state`**
Returns current field state, phase info, and automation status.

**Response:**
```json
{
  "field": {
    "first_planting_date": 1722528000000,
    "current_phase": {
      "id": 2,
      "name": "vegetatif",
      "min_water_level_pct": 50,
      "max_water_level_pct": 100,
      "typical_duration_days": 35
    },
    "phase_started_at": 1722528000000,
    "days_in_phase": 18,
    "days_since_planting": 58
  },
  "automation": {
    "enabled": true,
    "last_check_at": 1722700500000,
    "last_water_level": 72,
    "last_solenoid_state": 1,
    "last_action": "opened_solenoid",
    "min_toggle_interval_ms": 120000
  },
  "sensor_health": {
    "online": true,
    "last_update_ms_ago": 45,
    "last_update_at": 1722700455000
  }
}
```

---

#### **POST `/automation/start-season`**
Farmer starts a new planting season (initializes in tanam phase).

**Request:**
```json
{
  "confirm": true
}
```

**Response:**
```json
{
  "success": true,
  "field": {
    "first_planting_date": 1722700600000,
    "current_phase": { "id": 1, "name": "tanam", ... },
    "phase_started_at": 1722700600000
  },
  "message": "Season started in tanam phase. Automation paused."
}
```

**Behavior:**
- Creates entry in `field_state` (or resets existing)
- Sets `automation_enabled = false` (tanam is observation phase, no automation)
- Logs transition to `phase_transitions`

---

#### **POST `/automation/next-phase`**
Farmer advances to next phase in sequence.

**Request:**
```json
{
  "confirm": true
}
```

**Response:**
```json
{
  "success": true,
  "previous_phase": { "id": 1, "name": "tanam", ... },
  "new_phase": { "id": 2, "name": "vegetatif", ... },
  "transitioned_at": 1722700650000,
  "automation_status": "enabled"
}
```

**Behavior:**
- Finds next phase by `order_index`
- Updates `field_state.current_phase_id` and `phase_started_at`
- Logs to `phase_transitions` with `triggered_by = 'manual_user_action'`
- If new phase is vegetatif/primordia/pengisian: enable automation
- If new phase is tanam/pematangan: disable automation
- Broadcasts WebSocket event `phase_changed`

**Validation:**
- Reject if already in last phase (pematangan)

---

#### **PUT `/automation/state`**
Update automation config (rate-limiting interval, enable/disable).

**Request:**
```json
{
  "automation_enabled": true,
  "min_toggle_interval_ms": 180000
}
```

**Response:**
```json
{
  "automation_enabled": true,
  "min_toggle_interval_ms": 180000,
  "updated_at": 1722700700000
}
```

**Broadcast:** WebSocket event `automation_config_changed`

---

### 2.3 Automation Events Routes

#### **GET `/automation/events`**
Fetch event log (paginated, with optional filters).

**Query params:**
- `limit=50`: Max records to return
- `offset=0`: Pagination offset
- `type=flow_alert`: Filter by event_type (optional)
- `severity=warn`: Filter by severity (optional)
- `unresolved_only=true`: Only events with `resolved_at = null` (optional)

**Response:**
```json
{
  "events": [
    {
      "id": 1,
      "event_type": "sensor_offline",
      "severity": "error",
      "message": "Sensors offline >30 min. Automation paused.",
      "triggered_at": 1722700400000,
      "resolved_at": 1722700500000
    },
    {
      "id": 2,
      "event_type": "flow_alert",
      "severity": "warn",
      "message": "Solenoid opened but no water flow detected.",
      "triggered_at": 1722700450000,
      "resolved_at": null
    }
  ],
  "total": 42,
  "offset": 0,
  "limit": 50
}
```

---

#### **POST `/automation/events/:id/resolve`**
Mark an event as resolved (farmer acknowledged alert).

**Request:**
```json
{
  "confirm": true
}
```

**Response:**
```json
{
  "id": 2,
  "resolved_at": 1722700500000
}
```

**Broadcast:** WebSocket event `event_resolved`

---

## 3. Automation Loop (Core Logic)

### 3.1 Loop Lifecycle

**Trigger:** Runs every 5 seconds via `setInterval(automationCheck, 5000)` at server startup.

**Entry conditions:**
1. Server running
2. Database connected
3. MQTT connected

**Exit conditions (graceful):**
- Server shutdown
- Database error (log, retry next cycle)
- MQTT error (log, retry next cycle)

---

### 3.2 Automation Check Sequence

Each 5-second cycle follows this order:

#### **Step 1: Fetch latest sensor data**
```
Query: SELECT * FROM nodesensor_latest WHERE source = 'sensor' AND node_id IN (3, 4)
Check: Is there a reading? Is it <30 min old?
```

**Outcomes:**
- Fresh sensor data (≤30 min): Continue to Step 2
- No data or >30 min stale: Jump to Step 5 (sensor offline)

---

#### **Step 2: Check automation enable flag**
```
Query: SELECT automation_enabled FROM automation_state WHERE id = 1
Check: Is automation_enabled = true?
```

**Outcomes:**
- true: Continue to Step 3
- false: Exit (no further checks this cycle)

---

#### **Step 3: Get current phase & water level target**
```
Query: SELECT min_water_level_pct, max_water_level_pct FROM plant_phases 
       WHERE id = (SELECT current_phase_id FROM field_state WHERE id = 1)

Extract: latest.water_level (from sensor data)
```

**Example:**
- Phase: vegetatif (50–100%)
- Current: 72%
- Target band: 50–100% (no action needed)

---

#### **Step 4: Apply hysteresis logic**
```
If latest.water_level < phase.min:
  → targetSolenoid = 1 (OPEN)
Else if latest.water_level > phase.max:
  → targetSolenoid = 0 (CLOSE)
Else:
  → targetSolenoid = last_solenoid_state (NO CHANGE)
```

**Outcomes:**
- targetSolenoid = 0 or 1 (decision made)

---

#### **Step 5: Check rate-limiting**
```
Query: SELECT next_allowed_action_at FROM automation_state WHERE id = 1
Check: Is Date.now() >= next_allowed_action_at?
```

**Outcomes:**
- Yes (can act): Continue to Step 6
- No (locked): Record last_action as 'rate_limited', exit cycle

---

#### **Step 6: If solenoid should be ON, check flow**
```
If targetSolenoid = 1:
  Get last 30 sec of flow_pulses from relay node 1
  If flow_pulses_delta = 0 AND solenoid was ON for >5 sec:
    → Create automation_event { type: 'flow_alert', severity: 'warn', ... }
    → Exit cycle (don't toggle yet)
Else:
  Continue to Step 7
```

**Rationale:** Detect stuck solenoid or pipe blockage before wasting water.

---

#### **Step 7: Check overflow**
```
If latest.water_level >= 100:
  → targetSolenoid = 0 (FORCE OFF)
  → Create automation_event { type: 'overflow', severity: 'info', 
                             message: "Water overflow. Pump turned off. It might be rain outside." }
```

**Rationale:** Prevent continued pumping during monsoon.

---

#### **Step 8: Compare and toggle if needed**
```
current = last_solenoid_state (from automation_state)
if targetSolenoid != current:
  → Publish MQTT control command
  → Set next_allowed_action_at = Date.now() + min_toggle_interval_ms
  → Record last_action = 'opened_solenoid' or 'closed_solenoid'
Else:
  → Record last_action = 'no_action'

Update automation_state:
  - last_check_at = Date.now()
  - last_water_level = latest.water_level
  - last_solenoid_state = latest.solenoid_state (ground truth from relay node)
```

**Broadcast:** WebSocket event `automation_state_updated`

---

### 3.3 Sensor Offline Detection (Parallel to Loop)

**Trigger:** Every 30 seconds, separate check (independent of 5-sec loop).

**Logic:**
```
Query: SELECT last_sensor_update_at FROM sensor_health WHERE id = 1
Check: Is (Date.now() - last_sensor_update_at) > 30 * 60 * 1000?

If YES and offline_alert_sent_at = null:
  1. Set automation_enabled = false
  2. Publish MQTT control: { mode: 0 } (global OFF)
  3. Create automation_event { type: 'sensor_offline', severity: 'error', 
                              message: "Sensors offline >30 min. Automation paused. All solenoids OFF." }
  4. Set offline_alert_sent_at = Date.now()
  5. Broadcast WebSocket event 'sensor_offline_alert'

If NO and offline_alert_sent_at != null:
  1. Create automation_event { type: 'sensor_resume', severity: 'info', ... }
  2. Broadcast WebSocket event 'sensor_online_prompt' (ask farmer to resume)
  3. Set offline_alert_sent_at = null
```

---

## 4. MQTT Integration

### 4.1 Incoming Sensor Data Handler

**Topic:** `SmIr/nodesensor` (existing, unchanged)

**On message receipt:**
```
Parse payload (JSON)
Store in nodesensor_latest and nodesensor_history (existing)
Update sensor_health.last_sensor_update_at = Date.now()
```

---

### 4.2 Outgoing Control Commands

**Topic:** `SmIr/command` (existing, unchanged)

**When automation loop toggles solenoid:**
```
Publish: { mode: 1, target_node_id: 1, solenoid_state: 0 or 1 }
Log: Create command record in commands table (existing)
Broadcast: WebSocket update
```

---

## 5. WebSocket Broadcasts

New events broadcast to all connected frontend clients:

| Event | Payload | Trigger |
|-------|---------|---------|
| `phase_changed` | `{ previous_phase_id, new_phase_id, transitioned_at }` | User clicks "Next Phase" |
| `automation_state_updated` | `{ last_water_level, last_solenoid_state, last_action, ... }` | Each automation loop cycle |
| `automation_config_changed` | `{ automation_enabled, min_toggle_interval_ms }` | Admin updates config |
| `sensor_offline_alert` | `{ message, triggered_at }` | Sensors offline >30 min |
| `sensor_online_prompt` | `{ message }` | Sensors come back online (asking to resume) |
| `automation_event_created` | `{ event_type, severity, message, triggered_at }` | Any event logged |
| `event_resolved` | `{ event_id, resolved_at }` | Farmer acknowledges alert |

---

## 6. Initialization & Seeding

### 6.1 Server Startup

On backend start:

1. **Check `field_state` exists:**
   - If not: create with `current_phase_id = 1` (tanam), `automation_enabled = false`, `first_planting_date = null`

2. **Seed system phases:**
   - Query: `SELECT COUNT(*) FROM plant_phases WHERE is_system_phase = true`
   - If count < 5: insert tanam/vegetatif/primordia/pengisian/pematangan with default thresholds

3. **Initialize singleton tables:**
   - `automation_state`: Set `last_check_at = null`, `min_toggle_interval_ms = 120000`
   - `sensor_health`: Set `last_sensor_update_at = null`

4. **Start automation loop:**
   - `setInterval(automationCheck, 5000)`
   - `setInterval(sensorOfflineCheck, 30000)`

---

### 6.2 Config File (Environment)

```env
# Automation thresholds (in milliseconds)
AUTOMATION_CHECK_INTERVAL_MS=5000
SENSOR_OFFLINE_THRESHOLD_MS=1800000  # 30 min
FLOW_CHECK_TIMEOUT_MS=5000
RATE_LIMIT_DEFAULT_MS=120000         # 2 min

# Sensor node IDs
SENSOR_NODE_IDS=3,4
RELAY_NODE_IDS=1,2

# Default system phase thresholds (% water level)
TANAM_MIN_WATER=20
TANAM_MAX_WATER=50
VEGETATIF_MIN_WATER=50
VEGETATIF_MAX_WATER=100
PRIMORDIA_MIN_WATER=100
PRIMORDIA_MAX_WATER=150
PENGISIAN_MIN_WATER=150
PENGISIAN_MAX_WATER=200
PEMATANGAN_MIN_WATER=0
PEMATANGAN_MAX_WATER=10
```

---

## 7. Error Handling & Recovery

### 7.1 Database Errors
- Log error, skip cycle, retry next iteration
- If persistent (>5 consecutive failures): broadcast error to frontend

### 7.2 MQTT Errors
- If publish fails: log, skip action for this cycle
- Next cycle will retry
- Frontend shows "⚠️ MQTT disconnected" if persistent

### 7.3 Sensor Data Corruption
- If water_level is null or out of range (not 0–100): skip cycle, log warning
- Alert farmer if persistent

---

## 8. Summary of Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Hysteresis (not bang-bang)** | Prevents oscillation near threshold; respects real-world sensor noise |
| **Rate-limiting (default 2 min)** | Protects pump from rapid cycling; configurable by admin |
| **Flow detection** | Warns farmer of pipe blockage/stuck solenoid before wasting water |
| **Sensor offline pause** | Default to OFF (safe) if sensors fail; farmer can enable manual mode |
| **Overflow logging (not stop)** | Assumes monsoon will pass; logs for audit trail |
| **Phase transitions manual** | Farmer owns schedule; system only provides reminders (days/duration) |
| **Separate sensor-health thread** | Decoupled from 5-sec loop; 30-sec check is sufficient for offline detection |
| **Event log audit trail** | Every automation decision logged; farmer can replay history |

