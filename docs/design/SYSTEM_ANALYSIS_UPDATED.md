# SmIrApps Phase-Based Automatic Watering: Complete System Analysis

## 1. Current System State

### What's Already There (Good News)
1. **Water-level sensor data exists and flows**:
   - LoRa sensor nodes (3, 4) publish `water_level` (0–100%) + raw `water_distance_mm`
   - Data persists in `nodesensor_history` table with timestamps
   - Frontend already displays water level in `SensorNodeCard` and charts
   - ✓ Calibration embedded in device firmware (no backend recalibration needed)

2. **Solenoid control pipeline is working**:
   - Manual control: Frontend → `/control` API → MQTT publish → relay nodes
   - Command lifecycle tracking: `commands` table tracks pending → confirmed/failed
   - WebSocket broadcasts update UI in real-time
   - Flow pulse counter available in relay sensor data

3. **Backend structure supports new features**:
   - Node.js/Express with SQLite
   - MQTT pub/sub already operational
   - API routes are modular (easy to extend)
   - Database schema has room for new fields
   - ✓ WebSocket hub ready for new event types

4. **Frontend ready for iteration**:
   - TypeScript + React with responsive design
   - Hooks for state management (`useNodes`, `useNodeHistory`)
   - API client layer clean and typed
   - ✓ Mobile-responsive design already established

### What's Missing for Phase-Based Automation

**Critical gaps being addressed:**
1. ✓ Phase configuration table (plant_phases)
2. ✓ Field state tracking (field_state, first_planting_date)
3. ✓ Backend automation loop (5-sec cycle with hysteresis)
4. ✓ Phase transition UI & history logging
5. ✓ Flow alert detection (no flow while solenoid ON)
6. ✓ Sensor offline detection (>30 min → pause automation)
7. ✓ Event audit log (all automation decisions logged)
8. ✓ Rate-limiting (configurable, default 2 min between toggles)

---

## 2. Design Decisions & Rationale

### 2.1 Water Level: Percentage-Based (Firmware Calibrated)

**Decision:** Backend works only with `water_level` (0–100%), never raw `distance_mm`.

**Why this works:**
- Calibration math lives on device (doesn't drift during season)
- Backend receives already-converted percentage
- No backend-side calibration needed
- Farmers can recalibrate device annually without code changes

**Implication:** Hysteresis targets are percentages (not cm):
- Tanam: 20–50%
- Vegetatif: 50–100%
- Primordia: 100–150%
- Pengisian: 150–200%
- Pematangan: 0–10%

**Note:** Device firmware *should* enforce 0–100% boundary and average multiple sensor reads (smoothing) to reduce noise. This is outside backend's scope.

---

### 2.2 Hysteresis Logic (Not Bang-Bang)

**Decision:** Solenoid ON if `water_level < phase.min`, OFF if `> phase.max`, else hold.

**Example (Vegetatif: 50–100%):**
```
If water_level < 50%  → Solenoid ON
If water_level > 100% → Solenoid OFF
If 50% ≤ water_level ≤ 100% → No change (hold current state)
```

**Why this prevents oscillation:**
- 50% deadband means solenoid won't toggle until water changes by >50%
- Avoids thrashing when sensor noise causes small fluctuations
- Protects pump lifespan

**Firmware's responsibility:** Smooth the ultrasonic readings (average, median filter) to reduce noise floor.

---

### 2.3 Pematangan Phase: Stop Pumping, Let Nature Drain

**Decision:** Pematangan target 0–10%, solenoid OFF, remain OFF.

**Why NOT complete drain (0cm):**
- Sudden water loss stresses plants
- Soil cracking risk in clay-heavy fields
- Farmer can manually drain if needed post-harvest
- 0–10% allows small residual water; natural percolation handles rest

**Farmer's choice:** If they want faster drain, they can:
- Add a custom "post-pematangan-drain" phase after pematangan
- Or manually open solenoid when ready (automation disabled, manual mode)

**Audit trail:** Phase transition logged to `phase_transitions` table; event log shows when farmer entered pematangan.

---

### 2.4 Phase Transitions: Manual Only, Farmer-Initiated

**Decision:** "Next Phase" button requires explicit click + confirmation.

**Why not auto-timer:**
- Crop variety differences (early/late cultivar)
- Weather variations (cool season delays growth)
- Field condition variations (soil, water availability)
- Farmer is the expert; system provides reminders, not automation

**Safety net:**
- Confirmation modal shows current → next phase
- Phase-specific tips (Primordia = water critical)
- Typical duration shown (e.g., "Vegetatif: typically 35 days")
- Phase transition logged in audit trail

**Resumable:** If farmer transitions wrong, they can't undo (rice can't go backward), but log shows exactly when/why.

---

### 2.5 Sensor Offline: Pause Automation, Go Manual, All OFF

**Decision:** If ANY sensor (nodes 3–4) offline >30 min:
- Set `automation_enabled = false`
- Publish global OFF (mode 0) to all solenoids
- Log event `sensor_offline` with severity='error'
- Broadcast alert to farmer
- Ask farmer to resume when sensors back online

**Why 30 minutes:**
- Sensor battery low? LoRa link flaky? Could recover in <30 min
- After 30 min, assume hardware issue (antenna loose, node dead)
- Prevent unattended field drying out

**Why global OFF (not per-node):**
- Safest assumption: something is broken, stop all pumping
- Farmer can manually open solenoid in `manual` mode if needed
- Forces farmer to check field/sensors before resuming

**Recovery:** Next sensor packet → log event `sensor_resume`, broadcast prompt "Sensors back. Resume automation?"
- Yes → set `automation_enabled = true`, resume from current phase
- No → stay manual (farmer might be doing maintenance)

---

### 2.6 Flow Alert: Detect Stuck Solenoid or Blockage

**Decision:** If solenoid is ON but `flow_pulses` delta = 0 for >5 seconds:
- Log event `flow_alert` with severity='warn'
- Don't toggle solenoid yet (don't stress pump further)
- Alert farmer: "Solenoid opened but no water flow. Check pipe."
- Farmer manually confirms "I fixed it" in UI → resume logic

**Why this works:**
- Relay nodes report `flow_pulses` (cumulative counter)
- Compare last 5-sec: if delta = 0 while solenoid ON → blockage
- Early detection before field dries or wastes water

**Farmer's responsibility:** 
- Check pipe: clogged filter? Stuck solenoid valve? Pump off?
- Confirm via UI when fixed
- Backend resumes trying to pump

---

### 2.7 Overflow Detection: Log and Pause

**Decision:** If `water_level >= 100%`:
- Force solenoid OFF
- Log event `overflow` with severity='info' (not error; might be monsoon)
- Message: "Water overflow. Pump turned off. It might be rain outside."
- Continue monitoring; if water drops below max → resume normal logic

**Why not panic:**
- Rain/canal overflow is normal in rainy season
- Turning off pump is correct response
- Logging allows farmer to see "rained 5cm on Aug 15"
- Water will eventually percolate; system resumes when below threshold

---

### 2.8 Rate-Limiting: Configurable, Default 2 Minutes

**Decision:** Don't toggle solenoid more than once per `min_toggle_interval_ms` (default 120000 = 2 min).

**Why 2 minutes:**
- Pump needs time to pressurize/depressurize
- Solenoid valve has mechanical lag
- Rapid cycling stresses both
- At 5-sec check interval, 2-min lock prevents >1 toggle per cycle

**Configurable because:**
- Some pumps are fast, some slow
- Admin can tune based on field observation
- Frontend provides slider (with warning: "Too fast stresses pump")

**In code:**
```
if (Date.now() < next_allowed_action_at) return; // skip cycle
// ... do automation logic ...
next_allowed_action_at = Date.now() + min_toggle_interval_ms;
```

---

### 2.9 Phase Timeline: Days in Phase + First Planting Date

**Decision:** Store `first_planting_date` and `phase_started_at`; calculate elapsed on frontend.

**Frontend shows:**
- "Days in phase: 18 / 35" (elapsed / typical)
- "Days since planting: 58"
- "First planted: 2 Jul 2026"

**Why useful:**
- Farmer sees season progress
- Gentle reminder of expected duration (no alarm, just info)
- Easy to spot if accidentally in wrong phase (e.g., "in primordia 50 days?" = oops)

**Stored once:** First planting date set only when farmer clicks "Start Season" in tanam. Immutable per season.

---

### 2.10 Five System Phases (Fixed Order, Customizable Thresholds)

**Decision:** System phases (tanam, vegetatif, primordia, pengisian, pematangan) have locked order but editable thresholds.

**Why locked order:**
- Rice phenology is fixed: you can't skip primordia (panicle critical)
- Reordering would break agronomy

**Why editable thresholds:**
- Regional/cultivar variations
- Farmer learns over seasons ("my field needs 15–20% more water")
- Admin can adjust without code change

**Why custom phases allowed:**
- Farmer might add "pre-plant" (soil prep observation)
- Or "post-harvest-drain" (rapid drawdown)
- Custom phases can be inserted between system phases
- Custom phases can be deleted

**Order index:**
- System phases: 0, 1, 2, 3, 4 (immutable)
- Custom phases: 0.5, 1.5, 2.5, etc. (can be reordered via drag)

---

## 3. System Architecture Overview

### 3.1 Three Parallel Threads

**Main automation loop (every 5 sec):**
```
Fetch latest water_level
Check: automation enabled?
Get phase thresholds
Apply hysteresis
Check rate-limit lock
If solenoid should toggle:
  - Check flow (if opening)
  - Check overflow (force OFF if >100%)
  - Toggle
Update audit log
Broadcast WebSocket
```

**Sensor offline check (every 30 sec):**
```
Get last_sensor_update_at
If (now - last_update) > 30 min:
  - Pause automation
  - Global OFF
  - Alert farmer
Else if was offline, now online:
  - Log resume
  - Prompt farmer to enable automation
```

**Database cleanup (hourly, optional):**
```
Archive old nodesensor_history rows to parquet
Trim status_history to last 90 days
(Existing archival process, unchanged)
```

---

### 3.2 Data Flow

**Sensor → Backend → Automation → Control → Relay → Field → Sensor (loop)**

```
LoRa Sensor (node 3/4)
  ↓
  MQTT: SmIr/nodesensor
  ↓
Backend: nodesensor_latest, nodesensor_history
  ↓
Automation Loop (every 5s)
  ├─ Read current phase thresholds
  ├─ Read latest water_level
  ├─ Apply hysteresis
  ├─ Decide: solenoid ON/OFF?
  └─ If change needed:
      ↓
      MQTT: SmIr/command (mode 1, target_node_id 1, solenoid_state)
      ↓
      Relay Node 1
      ├─ Opens/closes solenoid
      └─ Reports new solenoid_state back to backend
  ├─ Log to automation_events
  └─ Broadcast WebSocket: automation_state_updated
      ↓
Frontend WebSocket listener
  └─ Update UI (water level, solenoid status, last action)
```

---

### 3.3 Database Tables (New)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `plant_phases` | Phase config (name, thresholds, order) | `id`, `name`, `min/max_water_level_pct`, `order_index`, `is_system_phase` |
| `field_state` | Current season state (phase, dates, automation enabled) | `id` (=1), `first_planting_date`, `current_phase_id`, `phase_started_at`, `automation_enabled` |
| `phase_transitions` | Audit log of phase changes | `id`, `from_phase_id`, `to_phase_id`, `triggered_at`, `triggered_by` |
| `automation_events` | Event log (flow alerts, sensor offline, overflow, etc.) | `id`, `event_type`, `severity`, `message`, `triggered_at`, `resolved_at` |
| `automation_state` | Runtime state (last check, water level, solenoid state, rate-limit lock) | `id` (=1), `last_check_at`, `last_water_level`, `last_solenoid_state`, `next_allowed_action_at`, `min_toggle_interval_ms` |
| `sensor_health` | Sensor freshness tracking | `id` (=1), `sensor_node_ids`, `last_sensor_update_at`, `offline_alert_sent_at` |

---

## 4. Frontend Architecture Overview

### 4.1 New Context

**AutomationContext:** Manages phases, field state, automation runtime, events.
- Fetch from backend on mount
- Listen to WebSocket: `phase_changed`, `automation_state_updated`, `sensor_offline_alert`, `automation_event_created`
- Provide actions: `nextPhase()`, `toggleAutomation()`, `createCustomPhase()`, `resolveEvent()`

---

### 4.2 New Components

| Component | Purpose |
|-----------|---------|
| **FieldStateCard** | Display phase, days in phase, days since planting, first planting date |
| **AutomationStatusCard** | Real-time: target range, current %, solenoid state, sensor freshness, last check |
| **PhaseConfigPanel** | System/custom phase list, edit thresholds, create/delete custom phases, drag-reorder |
| **PhaseEditorModal** | Edit min/max water level with sliders, edit phase name (custom only) |
| **PhaseTransitionModal** | Confirmation dialog: current→next phase, phase-specific tips, typical duration |
| **EventLogViewer** | Collapsible event timeline (flow, sensor offline, overflow, resume), filter by severity |
| **ToggleAutomationButton** | On/off switch for automation enable/disable |
| **RateLimitConfig** | Slider for min_toggle_interval_ms (with warning) |

---

### 4.3 New Page

**AutomationSettingsPage:** Full-screen settings:
- "Start Season" button (if no season active)
- Phase navigation ("Current: Vegetatif" + "Next Phase" button)
- Phase config panel
- Rate-limit config
- Event log viewer

---

### 4.4 Enhanced Components

**SolenoidControl:** Disable manual ON/OFF buttons if `automation_enabled = true`
- Show warning: "⚠️ Automation active – manual control disabled"

**Dashboard:** Add new cards:
- FieldStateCard
- AutomationStatusCard
- EventLogViewer (collapsible)

**SystemStatusBar:** Add automation status indicator:
- "✓ Automation ON" or "○ Automation OFF"
- "✓ Sensor OK" or "✗ Sensor Offline"

---

## 5. Key Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| **Percentage-based (firmware calibrated)** | No backend calibration drift; farmer calibrates device once/season |
| **Hysteresis (50% deadband)** | Prevents oscillation near threshold; tolerates sensor noise |
| **Rate-limiting (default 2 min)** | Protects pump; configurable for different hardware |
| **Sensor offline = pause all** | Safest default; forces farmer to check field before resuming |
| **Flow alert = warn, don't retry yet** | Prevents wasting water into blockage; farmer diagnoses first |
| **Overflow = log and pause** | Assumes monsoon/external water; continue monitoring |
| **Phase transitions manual only** | Farmer is expert; system only suggests (reminders, durations) |
| **Tanam phase = no automation** | Observation period; farmer assesses field readiness |
| **Pematangan = OFF** | Stop pumping; natural percolation; farmer can manually drain if needed |
| **Audit trail = all events logged** | Replay history; debug issues; farmer accountability |

---

## 6. Implementation Roadmap

See separate **BACKEND_DESIGN.md** and **FRONTEND_DESIGN.md** for detailed specs.

### Phase 0: Preparation (This Document)
- ✓ Understand current state
- ✓ Clarify design decisions
- ✓ Answer farmer's concerns (risk, usability, safety)

### Phase 1: Backend Foundation (2–3 hours)
- Create 6 new database tables
- Seed system phases
- Implement GET `/automation/phases`, POST `/automation/start-season`, POST `/automation/next-phase`

### Phase 2: Backend Automation Loop (2–3 hours)
- Implement 5-sec check (hysteresis, rate-limit, flow check, overflow)
- Implement 30-sec sensor offline check
- Broadcast WebSocket events

### Phase 3: Frontend Context & Hooks (1–2 hours)
- AutomationContext provider
- useAutomation, usePhaseTimer hooks
- WebSocket listeners

### Phase 4: Frontend Components (3–4 hours)
- FieldStateCard, AutomationStatusCard, PhaseConfigPanel, Modals
- AutomationSettingsPage
- Event log viewer

### Phase 5: Integration & Polish (2–3 hours)
- Wire up context to components
- Enhance existing components (SolenoidControl, Dashboard, SystemStatusBar)
- Responsive mobile testing
- Internationalization strings

### Phase 6: Testing & Deployment (2–3 hours)
- Unit tests (hysteresis logic, rate-limiting)
- Integration tests (API routes, WebSocket events)
- Field testing with real sensor data
- Deploy to production

**Total estimate:** 12–18 hours backend+frontend combined

---

## 7. Safety Guarantees

This system provides:

1. **Pump Protection:** Rate-limiting prevents rapid cycling
2. **Field Protection:** Flow alert catches blockages; offline detection pauses auto
3. **Crop Protection:** Manual phase transitions prevent accidentally entering wrong stage
4. **Farmer Protection:** Audit log of all decisions; alerts for offline sensors, flow issues, overflow
5. **Data Protection:** All events logged; can replay season history

---

## 8. Known Limitations

1. **No weather integration:** Rain detection is overflow-based (passive), not forecast-based
2. **No soil moisture:** Only water level; doesn't account for different soil types' water retention
3. **No evapotranspiration model:** Doesn't adjust target based on temperature/humidity
4. **Calibration manual:** Device firmware must be maintained/updated by farmer annually
5. **Phase durations read-only:** System suggests defaults; farmer can't set custom (by design; keeps complexity low)

These are acceptable tradeoffs for a Phase 1 implementation. Future versions can add weather API, soil sensors, etc.

---

## 9. Questions for Farmer/User Acceptance

Before implementation, confirm with farmer:

1. **Pematangan:** Is 0–10% (controlled drawdown) acceptable, or do you need faster drain?
2. **Rate-limiting:** 2 min between toggles OK, or too slow/fast for your field?
3. **Sensor offline:** >30 min threshold acceptable? Or should it be configurable (10 min, 60 min)?
4. **Flow alert:** When solenoid opens but no flow detected, should system auto-retry, or wait for farmer confirmation? (Design: wait for farmer)
5. **Custom phases:** Do you see yourself adding any custom phases (pre-plant, post-harvest)?
6. **Mobile UI:** Touchscreen-friendly enough for field use, or need bigger buttons?

---

## Conclusion

This system is **pragmatic, safe, and farmer-centric**:
- ✓ Automates the tedious daily water management
- ✓ Respects farmer expertise (manual phase control, gentle reminders)
- ✓ Fails safely (sensor offline → all OFF; flow issue → wait for farmer)
- ✓ Provides audit trail (replay any decision, debug issues)
- ✓ Scales: custom phases, configurable thresholds, tunable rate-limiting

Ready to build.

---

## Proposed Architecture

### Database Schema Addition

```sql
-- Automation configurations per field/user
CREATE TABLE IF NOT EXISTS plant_phases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,           -- 'tanam', 'vegetatif', 'primordia', 'pematangan'
  min_water_cm    REAL NOT NULL,           -- 2, 5, 10, 0
  max_water_cm    REAL NOT NULL,           -- 5, 10, 15, 1
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Current field state: which phase are we in?
CREATE TABLE IF NOT EXISTS field_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  current_phase_id INTEGER NOT NULL REFERENCES plant_phases(id),
  phase_started_at INTEGER NOT NULL,       -- unix ms
  automation_enabled BOOLEAN DEFAULT true,
  updated_at      INTEGER NOT NULL
);

-- Audit log: when did we transition phases?
CREATE TABLE IF NOT EXISTS phase_transitions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_phase_id   INTEGER REFERENCES plant_phases(id),
  to_phase_id     INTEGER NOT NULL REFERENCES plant_phases(id),
  transitioned_at INTEGER NOT NULL,
  triggered_by    TEXT NOT NULL            -- 'manual', 'auto_timer', 'user_request'
);

-- Automation loop status: last control decision
CREATE TABLE IF NOT EXISTS automation_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  last_check_at   INTEGER NOT NULL,        -- unix ms
  last_water_level REAL,                   -- % from last sensor read
  last_solenoid_state INTEGER,             -- 0 or 1
  last_action     TEXT,                    -- 'opened_solenoid' / 'closed_solenoid' / 'no_action'
  next_allowed_action_at INTEGER           -- unix ms (rate limiting)
);
```

### Backend: New Routes

**1. GET/POST phase configuration:**
```
POST /automation/phases
  Body: { name, min_water_cm, max_water_cm }
  → Creates a phase template

GET /automation/phases
  → Returns all phase templates + current field state

PUT /automation/phases/:id
  → Update phase config
```

**2. Phase transition endpoint:**
```
POST /automation/next-phase
  Body: { confirm: true }
  → Only if user explicitly confirms
  → Logs transition + sets field_state.current_phase_id
  → Broadcasts WebSocket event so UI updates instantly
```

**3. Toggle automation on/off:**
```
POST /automation/enable
  Body: { enabled: true }
  → Disables backend loop (fallback to manual if sensor fails)
```

### Backend: Automation Loop (Node.js)

A simple recurring check (every 5–10 seconds):

```javascript
// Pseudo-code
setInterval(async () => {
  if (!automationEnabled) return;
  
  // 1. Get latest water level from DB
  const latest = getLatestSensorReading();
  if (!latest || !latest.water_level) return; // no data
  
  // 2. Get current phase config
  const phase = getCurrentPhaseConfig();
  
  // 3. Decide: should solenoid be ON or OFF?
  //    Hysteresis: ON if <min, OFF if >max, else no change
  const targetState = decideState(latest.water_level, phase);
  
  // 4. Check rate limit (don't toggle more than once per 2 minutes)
  const now = Date.now();
  const lastAction = getLastAutomationAction();
  if (now < lastAction.next_allowed_at) return;
  
  // 5. If target != actual, send command
  if (targetState !== latest.solenoid_state) {
    publishControl({ mode: 1, target_node_id: 1, solenoid_state: targetState });
    updateAutomationState(targetState, now + 120000); // lock for 2 min
  }
}, 5000); // check every 5 seconds
```

**Key design choices:**
- **Hysteresis:** ON at <min, OFF at >max, else hold (no oscillation)
- **Rate-limit:** Don't toggle more than once per 2 minutes (protects pump)
- **Passive:** No API-level decision, just compare + toggle. Dumb and reliable.
- **Disable switch:** If sensor fails, operator clicks "automation off" and goes manual

### Frontend: New Components

**1. Phase Configuration Panel** (under Settings or dedicated tab):
```
┌─ Automation Setup ─────────────────┐
│                                    │
│ [Define Phases]                   │
│  - Phase name input               │
│  - Min/max water level (cm) sliders│
│  - [Save Phase] button            │
│                                    │
│ [Current Field State]             │
│  Fase Vegetatif (day 15/45)        │
│  Target: 5–10 cm                   │
│  Current: 7.2 cm ✓                │
│  Solenoid: ON                      │
│                                    │
│ [⚠ Next Phase] button             │
│  (shows confirmation modal)        │
│                                    │
│ [ ] Automation enabled             │
│                                    │
└────────────────────────────────────┘
```

**2. Real-time Automation Status** (dashboard):
```
┌─ Automation Status ────────────────┐
│                                    │
│ Phase: Vegetatif                  │
│ Duration: 15/45 days               │
│ Target Water: 5–10 cm              │
│ Current: 7.2 cm from 2 min ago    │
│ Solenoid: ON (opened 5 min ago)   │
│ Automation: ✓ Enabled              │
│                                    │
│ ⚠ Last check: 3s ago               │
│ ✗ No sensor data >30 min: ALARM   │
│                                    │
└────────────────────────────────────┘
```

**3. Phase Transition Modal** (with confirmation):
```
┌─ Advance to Next Phase? ───────────┐
│                                    │
│ You're about to move from:         │
│   Vegetatif → Primordia            │
│                                    │
│ This phase is CRITICAL for panicle │
│ initiation. Target: 10–15 cm.      │
│                                    │
│ Are you sure the plants are ready? │
│ (Typical: day 45–60 after tanam)  │
│                                    │
│ [Cancel]  [Confirm & Advance] ────│
│                                    │
└────────────────────────────────────┘
```

---

## Implementation Roadmap (High-Level)

### Phase 0: Schema + Foundation (1–2 hours backend work)
1. Add 4 new tables (above)
2. Create initial phase templates (SQL seed: tanam, vegetatif, primordia, pematangan)
3. Initialize `field_state` row (always id=1, like `automation_state`)

### Phase 1: Backend Automation Loop (2–3 hours)
1. Write hysteresis control logic
2. Integrate into main server startup (setInterval loop)
3. Add GET `/automation/state` → returns current phase + solenoid status
4. Add `POST /automation/next-phase` → manual phase transition

### Phase 2: Frontend Config + Status (3–4 hours)
1. Build "Phase Configuration" component (edit min/max per phase)
2. Add "Current Phase" display + "Next Phase" button
3. Add "Automation Status" card to dashboard
4. WebSocket listener for phase transition events

### Phase 3: Polish + Testing (2–3 hours)
1. Add confirmations, warnings for phase transitions
2. Implement alarm logic (no sensor data >30 min)
3. Test hysteresis with real field data (if available)
4. Documentation (how to calibrate sensors, set phase durations)

---

## Critical Questions for You (Answer These Before I Code)

1. **Water-level sensor stats:** What's the noise floor? How often does a *stable* field fluctuate ±0.5cm? ±5cm?

2. **Pematangan drain:** Do you want 0cm (complete drain) or 1cm (controlled drawdown)? Or should it be a param?

3. **Rate-limiting:** 2-minute minimum between toggles—acceptable? Or should it be config?

4. **Phase duration tracking:** Should the system auto-remind ("Day 30 of Vegetative") or just show elapsed time?

5. **Rain/overflow detection:** If field floods unexpectedly, should the system auto-disable automation? Or just log a warning?

6. **Sensor failure alarm:** Threshold before triggering alarm? (E.g., >30 min without update?)

7. **Initial defaults:** The four-phase defaults (tanam 2–5, vegetatif 5–10, primordia 10–15, pematangan 0–1)—are these locked in, or editable per field?

---

## Summary

**Your idea is sound.** The four-phase + manual transitions setup is pragmatic for rice. The main work is:
1. Small database schema (4 tables)
2. 50–80 lines of backend control loop
3. 2–3 new frontend components (phase config, transitions, status)

**The risks aren't architectural—they're operational:**
- Sensor calibration + noise → hysteresis bands required
- Pump speed → rate-limiting required
- Operator error on phase transition → confirmation dialog required

Once you answer those 7 questions, I can write the actual code. Ready?
