# SmIrApps Frontend: Phase-Based Automatic Watering System Design

## Overview

The frontend enables farmers to configure rice growth phases, monitor automation state, and safely transition between phases. All interactions are responsive (mobile-first) and real-time via WebSocket.

---

## 1. New Components & Pages

### 1.1 Page Structure

```
Dashboard (existing + enhanced)
├─ SystemStatusBar (existing, enhanced with automation alerts)
├─ FieldStateCard (NEW)
├─ AutomationStatusCard (NEW)
├─ WaterLevelChart (existing)
└─ SolenoidControl (existing, disabled if automation ON)

Settings / Automation Tab (NEW page)
├─ PhaseConfigPanel (NEW)
│  ├─ SystemPhasesList (NEW)
│  └─ CustomPhasesList (NEW, with reorder & delete)
├─ PhaseEditorModal (NEW)
├─ AutomationToggle (NEW)
├─ RateLimitConfig (NEW)
└─ EventLogPanel (NEW)

PhaseTransitionModal (NEW, dialog)
└─ Confirmation + warnings

EventLogViewer (NEW)
├─ Expandable event list
├─ Filters (type, severity)
└─ Resolve action
```

---

## 2. New Context & Hooks

### 2.1 AutomationContext

Manages automation state, phases, and events.

```typescript
interface AutomationContextType {
  // Phases
  phases: PlantPhase[];
  currentPhase: PlantPhase | null;
  
  // Field state
  fieldState: FieldState | null;
  daysInPhase: number;
  daysSincePlanting: number;
  
  // Automation runtime
  automationState: AutomationState | null;
  sensorHealth: SensorHealth | null;
  
  // Events
  events: AutomationEvent[];
  unreadEventCount: number;
  
  // Actions
  loadPhases: () => Promise<void>;
  loadFieldState: () => Promise<void>;
  createCustomPhase: (phase: PhaseInput) => Promise<PlantPhase>;
  updatePhase: (id: number, updates: PhaseInput) => Promise<PlantPhase>;
  deleteCustomPhase: (id: number) => Promise<void>;
  
  startSeason: () => Promise<void>;
  nextPhase: () => Promise<void>;
  
  toggleAutomation: (enabled: boolean) => Promise<void>;
  updateRateLimit: (ms: number) => Promise<void>;
  
  loadEvents: (filters?: EventFilters) => Promise<void>;
  resolveEvent: (id: number) => Promise<void>;
}
```

**Implementation:**
- Fetch from backend on component mount
- Listen to WebSocket events: `phase_changed`, `automation_state_updated`, `sensor_offline_alert`, `automation_event_created`
- Real-time updates (no polling needed)

---

### 2.2 useAutomation Hook

Convenience hook for accessing automation context.

```typescript
const useAutomation = () => {
  const context = useContext(AutomationContext);
  if (!context) throw new Error('useAutomation must be inside AutomationProvider');
  return context;
};
```

---

### 2.3 usePhaseTimer Hook

Calculates elapsed time in current phase; updates every second.

```typescript
const usePhaseTimer = () => {
  const { fieldState, currentPhase } = useAutomation();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!fieldState?.phase_started_at) return;
    
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - fieldState.phase_started_at;
      setElapsed(Math.floor(elapsedMs / (1000 * 60 * 60 * 24))); // days
    }, 1000);
    
    return () => clearInterval(timer);
  }, [fieldState?.phase_started_at]);
  
  return {
    daysInPhase: elapsed,
    typicalDurationDays: PHASE_DURATIONS[currentPhase?.name] || null,
  };
};
```

---

## 3. New Components (Detailed)

### 3.1 FieldStateCard

Displays current season info: phase, days elapsed, first planted date.

```typescript
export function FieldStateCard() {
  const { fieldState, currentPhase } = useAutomation();
  const { daysInPhase, typicalDurationDays } = usePhaseTimer();

  if (!fieldState || !currentPhase) {
    return <Card><p>No active season</p></Card>;
  }

  const firstPlantedDate = fieldState.first_planting_date
    ? new Date(fieldState.first_planting_date).toLocaleDateString('id-ID')
    : '–';

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-bold">Status Ladang</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-ink-soft">Fase Saat Ini</p>
          <p className="text-xl font-bold capitalize">{currentPhase.name}</p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Hari di Fase</p>
          <p className="text-xl font-bold">
            {daysInPhase} / {typicalDurationDays || '–'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-ink-soft">Hari Sejak Tanam</p>
          <p className="text-lg font-medium">
            {fieldState.first_planting_date
              ? Math.floor((Date.now() - fieldState.first_planting_date) / (1000 * 60 * 60 * 24))
              : '–'}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Tanggal Tanam</p>
          <p className="text-sm">{firstPlantedDate}</p>
        </div>
      </div>
    </Card>
  );
}
```

**Mobile responsive:**
- 2-column grid on desktop, stacks on mobile
- Large readable numbers for farmer visibility

---

### 3.2 AutomationStatusCard

Real-time automation state + alerts.

```typescript
export function AutomationStatusCard() {
  const { currentPhase, automationState, sensorHealth } = useAutomation();

  if (!automationState) return null;

  const sensorStale = sensorHealth && sensorHealth.last_update_ms_ago > 30000;
  const solenoidLabel = automationState.last_solenoid_state === 1 ? 'ON' : 'OFF';
  const targetRange = `${currentPhase?.min_water_level_pct}–${currentPhase?.max_water_level_pct}%`;

  return (
    <Card className="space-y-3 border-l-4 border-l-ok">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Otomasi Air</h3>
        <ToggleAutomationButton />
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-ink-soft">Target</p>
          <p className="font-medium">{targetRange}</p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Saat Ini</p>
          <p className="text-lg font-bold text-ok">{automationState.last_water_level}%</p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Solenoid</p>
          <p className={`font-bold ${solenoidLabel === 'ON' ? 'text-ok' : 'text-ink'}`}>
            {solenoidLabel}
          </p>
        </div>
      </div>

      {sensorStale && (
        <div className="p-2 bg-warn-light rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} className="text-warn" />
          <p className="text-xs text-warn">Data sensor {sensorHealth.last_update_ms_ago / 1000}s lalu</p>
        </div>
      )}

      <div className="text-xs text-ink-soft pt-2 border-t border-line">
        Pengecekan terakhir: {formatRelativeTime(automationState.last_check_at)}
      </div>
    </Card>
  );
}
```

**Alerts embedded:**
- Sensor freshness warning if >30s stale
- Real-time water level percentage
- Solenoid status visual

---

### 3.3 PhaseConfigPanel

Admin interface for creating and managing phases.

```typescript
export function PhaseConfigPanel() {
  const { phases, createCustomPhase, updatePhase, deleteCustomPhase } = useAutomation();
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const systemPhases = phases.filter(p => p.is_system_phase);
  const customPhases = phases.filter(p => !p.is_system_phase);

  return (
    <Card className="space-y-6">
      <h2 className="text-lg font-bold">Konfigurasi Fase</h2>

      {/* System Phases (locked) */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-ink-soft">Fase Standar (Tidak Dapat Dihapus)</h3>
        <div className="space-y-2">
          {systemPhases.map(phase => (
            <PhaseEditRow
              key={phase.id}
              phase={phase}
              locked={true}
              onEdit={() => setEditingPhaseId(phase.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom Phases (drag-reorder, delete) */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-ink-soft">Fase Kustom (Dapat Diurutkan & Dihapus)</h3>
        <div className="space-y-2">
          {customPhases.length > 0 ? (
            <DraggablePhaseList
              phases={customPhases}
              onEdit={setEditingPhaseId}
              onDelete={deleteCustomPhase}
              onReorder={handleReorder}
            />
          ) : (
            <p className="text-xs text-ink-soft italic">Belum ada fase kustom</p>
          )}
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="mt-4 w-full py-2 bg-canvas border border-line rounded-lg text-sm font-medium hover:border-ok transition"
        >
          + Tambah Fase Kustom
        </button>
      </div>

      {/* Modals */}
      {editingPhaseId && (
        <PhaseEditorModal
          phaseId={editingPhaseId}
          onClose={() => setEditingPhaseId(null)}
          onSave={updatePhase}
        />
      )}

      {showCreateModal && (
        <PhaseEditorModal
          isCreating={true}
          onClose={() => setShowCreateModal(false)}
          onSave={createCustomPhase}
        />
      )}
    </Card>
  );
}
```

**Key features:**
- System phases shown as read-only (with lock icon)
- Custom phases with drag handles (reorder)
- Delete button on custom phases only
- Add button to create new phase
- Modal for edit/create

---

### 3.4 PhaseEditorModal

Modal for editing or creating a phase.

```typescript
export function PhaseEditorModal({
  phaseId,
  isCreating = false,
  onClose,
  onSave,
}: {
  phaseId?: number;
  isCreating?: boolean;
  onClose: () => void;
  onSave: (id: number, data: PhaseInput) => Promise<void>;
}) {
  const { phases } = useAutomation();
  const phase = phaseId ? phases.find(p => p.id === phaseId) : null;

  const [form, setForm] = useState({
    name: phase?.name || '',
    min_water_level_pct: phase?.min_water_level_pct || 0,
    max_water_level_pct: phase?.max_water_level_pct || 50,
  });

  const handleSave = async () => {
    if (isCreating) {
      await onSave(0, form);
    } else if (phaseId) {
      await onSave(phaseId, form);
    }
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={onClose}>
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-bold">
          {isCreating ? 'Fase Baru' : `Edit: ${phase?.name}`}
        </h3>

        {isCreating && (
          <div>
            <label className="block text-sm font-medium mb-1">Nama Fase</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full p-2 border border-line rounded"
              placeholder="e.g., preplant, post-harvest"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            Air Minimum: {form.min_water_level_pct}%
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={form.min_water_level_pct}
            onChange={(e) => setForm({ ...form, min_water_level_pct: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Air Maksimum: {form.max_water_level_pct}%
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={form.max_water_level_pct}
            onChange={(e) => setForm({ ...form, max_water_level_pct: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-canvas border border-line rounded-lg hover:border-ink"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 px-4 bg-ok text-white rounded-lg hover:bg-ok-dark"
          >
            Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

**UX:**
- Range sliders for water levels (0–200%)
- Name input only for custom phases
- Validation (min < max)

---

### 3.5 PhaseTransitionModal

Confirmation dialog when farmer clicks "Next Phase".

```typescript
export function PhaseTransitionModal({
  currentPhase,
  nextPhase,
  isOpen,
  onConfirm,
  onCancel,
}: {
  currentPhase: PlantPhase;
  nextPhase: PlantPhase;
  isOpen: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const PHASE_TIPS = {
    vegetatif: 'Fase vegetatif membutuhkan air 5–10 cm secara konsisten. Biasanya berlangsung 35 hari.',
    primordia: '⚠️ Primordia adalah fase kritis untuk inisiasi pani. Jangan biarkan air terlalu rendah!',
    pengisian: 'Pengisian bulir membutuhkan air 15–20 cm penuh. Jangan dihentikan di fase ini.',
    pematangan: 'Drainase alami akan terjadi. Solenoid akan OFF. Periksa apakah tanaman siap dipanen.',
  };

  const tip = PHASE_TIPS[nextPhase.name as keyof typeof PHASE_TIPS];
  const typicalDuration = PHASE_DURATIONS[nextPhase.name as keyof typeof PHASE_DURATIONS];

  return (
    <Modal isOpen={isOpen} onClose={onCancel}>
      <div className="space-y-6 p-6">
        <h3 className="text-lg font-bold">Lanjut ke Fase Berikutnya?</h3>

        <div className="bg-canvas-light p-4 rounded-lg space-y-2">
          <p className="text-sm">
            Anda akan pindah dari <span className="font-bold capitalize">{currentPhase.name}</span> ke{' '}
            <span className="font-bold capitalize text-ok">{nextPhase.name}</span>
          </p>
          <p className="text-xs text-ink-soft">
            Target air: {nextPhase.min_water_level_pct}–{nextPhase.max_water_level_pct}%
          </p>
        </div>

        {tip && (
          <div className={`p-4 rounded-lg ${tip.includes('⚠️') ? 'bg-warn-light' : 'bg-info-light'}`}>
            <p className="text-sm font-medium">{tip}</p>
          </div>
        )}

        {typicalDuration && (
          <div className="p-3 bg-canvas border border-line rounded">
            <p className="text-xs text-ink-soft">Durasi tipikal</p>
            <p className="text-lg font-bold">{typicalDuration} hari</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-canvas border border-line rounded-lg font-medium hover:border-ink"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-ok text-white rounded-lg font-medium hover:bg-ok-dark"
          >
            Lanjutkan
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

**UX:**
- Shows current → next phase clearly
- Tips specific to each phase (Primordia highlighted with warning)
- Typical duration shown
- Confirmation required

---

### 3.6 EventLogViewer

Collapsible timeline of automation events.

```typescript
export function EventLogViewer() {
  const { events, loadEvents, resolveEvent } = useAutomation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [filters, setFilters] = useState({ severity: 'all' });

  const filtered = events.filter(
    e => filters.severity === 'all' || e.severity === filters.severity
  );

  const unresolvedCount = events.filter(e => !e.resolved_at).length;

  return (
    <Card className="mt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-canvas-light"
      >
        <div className="flex items-center gap-3">
          <History size={20} />
          <span className="font-semibold">Catatan Otomasi</span>
          {unresolvedCount > 0 && (
            <span className="ml-2 px-2 py-1 bg-warn text-white text-xs rounded-full">
              {unresolvedCount}
            </span>
          )}
        </div>
        <ChevronDown size={20} className={isExpanded ? 'rotate-180' : ''} />
      </button>

      {isExpanded && (
        <div className="border-t border-line p-4 space-y-3">
          {/* Filter buttons */}
          <div className="flex gap-2 mb-4">
            {['all', 'error', 'warn', 'info'].map(severity => (
              <button
                key={severity}
                onClick={() => setFilters({ ...filters, severity })}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  filters.severity === severity
                    ? 'bg-ok text-white'
                    : 'bg-canvas border border-line'
                }`}
              >
                {severity.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Events */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map(event => (
                <EventLogItem
                  key={event.id}
                  event={event}
                  onResolve={() => resolveEvent(event.id)}
                />
              ))
            ) : (
              <p className="text-xs text-ink-soft italic">Tidak ada acara</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function EventLogItem({ event, onResolve }: { event: AutomationEvent; onResolve: () => void }) {
  const icon = event.severity === 'error' ? AlertCircle : AlertTriangle;
  const bgColor = event.severity === 'error' ? 'bg-danger-light' : event.severity === 'warn' ? 'bg-warn-light' : 'bg-info-light';

  return (
    <div className={`p-3 rounded-lg ${bgColor} flex items-start gap-3`}>
      {icon({ size: 16 })}
      <div className="flex-1">
        <p className="text-sm font-medium">{event.message}</p>
        <p className="text-xs text-ink-soft mt-1">{formatRelativeTime(event.triggered_at)}</p>
      </div>
      {!event.resolved_at && (
        <button
          onClick={onResolve}
          className="text-xs font-medium text-ok hover:underline"
        >
          Atur
        </button>
      )}
    </div>
  );
}
```

**UX:**
- Collapsible by default (clean dashboard)
- Badge showing unresolved event count
- Filter by severity (all/error/warn/info)
- "Resolve" action for farmer acknowledgment
- Scrollable if many events

---

### 3.7 ToggleAutomationButton

Simple on/off for automation.

```typescript
export function ToggleAutomationButton() {
  const { automationState, toggleAutomation } = useAutomation();
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      await toggleAutomation(!automationState?.enabled);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
        automationState?.enabled ? 'bg-ok' : 'bg-ink-soft'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
          automationState?.enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
```

---

## 4. Enhanced Existing Components

### 4.1 SolenoidControl (Modified)

Disable manual buttons if automation is active.

```typescript
export function SolenoidControl({
  nodeId,
  actualSolenoidState,
}: {
  nodeId: 1 | 2;
  actualSolenoidState: 0 | 1;
}) {
  const { automationState } = useAutomation();
  const automationActive = automationState?.enabled;
  
  // ... existing code ...

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isWaiting || automationActive}
          // ... rest of button
        >
          ON
        </button>
        <button
          type="button"
          disabled={isWaiting || automationActive}
          // ... rest of button
        >
          OFF
        </button>
      </div>

      {automationActive && (
        <div className="mt-2 text-xs text-warn">
          ⚠️ Otomasi aktif – kontrol manual tidak tersedia
        </div>
      )}

      {/* ... rest of existing code ... */}
    </div>
  );
}
```

**Rationale:** If automation is on, manual solenoid buttons should be disabled to prevent conflict.

---

### 4.2 Dashboard (Modified)

Add new cards to main dashboard.

```typescript
export function Dashboard() {
  return (
    <div className="space-y-4">
      <SystemStatusBar />
      
      {/* NEW */}
      <FieldStateCard />
      <AutomationStatusCard />
      
      {/* Existing */}
      <WaterLevelChart />
      <RelayNodeCard nodeId={1} />
      <SensorNodeCard nodeId={3} />
      
      {/* NEW */}
      <EventLogViewer />
    </div>
  );
}
```

---

### 4.3 SystemStatusBar (Enhanced)

Add automation status indicator.

```typescript
export function SystemStatusBar() {
  const { automationState, sensorHealth } = useAutomation();

  const automationStatus = automationState?.enabled ? '✓ Otomasi ON' : '○ Otomasi OFF';
  const sensorStatus = sensorHealth?.online ? '✓ Sensor OK' : '✗ Sensor Offline';

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-canvas rounded-lg text-xs">
      <div>{automationStatus}</div>
      <div>{sensorStatus}</div>
      <div>Mode: Manual</div>
    </div>
  );
}
```

---

## 5. Navigation & Routing

### 5.1 Main Routes

```typescript
const routes = [
  { path: '/', component: Dashboard },
  { path: '/control', component: ControlPage },
  { path: '/sensors', component: SensorPage },
  { path: '/automation', component: AutomationSettingsPage }, // NEW
  { path: '/diagnostics', component: DiagnosticsPage },
];
```

---

### 5.2 AutomationSettingsPage (New)

Full-page settings for phase configuration.

```typescript
export function AutomationSettingsPage() {
  const { startSeason, fieldState, nextPhase } = useAutomation();
  const [showPhaseTransition, setShowPhaseTransition] = useState(false);

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-bold">Pengaturan Otomasi</h1>

        {/* Season start (if no season active) */}
        {!fieldState?.first_planting_date && (
          <div className="p-4 bg-info-light rounded-lg">
            <h3 className="font-semibold mb-2">Mulai Musim Baru</h3>
            <p className="text-sm mb-4">Klik untuk memulai di fase Tanam. Otomasi akan OFF.</p>
            <button
              onClick={startSeason}
              className="px-4 py-2 bg-ok text-white rounded-lg font-medium"
            >
              Mulai Tanam
            </button>
          </div>
        )}

        {/* Phase navigation */}
        {fieldState?.first_planting_date && (
          <div className="p-4 bg-canvas-light rounded-lg">
            <p className="text-sm text-ink-soft mb-2">Fase saat ini</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl font-bold capitalize">
                {fieldState.current_phase.name}
              </span>
              <button
                onClick={() => setShowPhaseTransition(true)}
                className="ml-auto px-3 py-2 bg-ok text-white text-sm rounded-lg font-medium"
              >
                ⏭️ Fase Berikutnya
              </button>
            </div>
          </div>
        )}

        {/* Phase config */}
        <PhaseConfigPanel />

        {/* Rate limiting */}
        <RateLimitConfig />

        {/* Event log */}
        <EventLogViewer />
      </div>

      {showPhaseTransition && (
        <PhaseTransitionModal
          currentPhase={fieldState.current_phase}
          nextPhase={/* next in sequence */}
          isOpen={true}
          onConfirm={() => { nextPhase(); setShowPhaseTransition(false); }}
          onCancel={() => setShowPhaseTransition(false)}
        />
      )}
    </Layout>
  );
}
```

---

## 6. Type Definitions (TypeScript)

```typescript
// From backend
export interface PlantPhase {
  id: number;
  name: string;
  min_water_level_pct: number;
  max_water_level_pct: number;
  is_system_phase: boolean;
  order_index: number;
}

export interface FieldState {
  first_planting_date: number | null;
  current_phase_id: number;
  phase_started_at: number;
  automation_enabled: boolean;
  updated_at: number;
}

export interface AutomationState {
  enabled: boolean;
  last_check_at: number;
  last_water_level: number;
  last_solenoid_state: 0 | 1;
  last_action: 'opened_solenoid' | 'closed_solenoid' | 'no_action' | 'rate_limited' | null;
  min_toggle_interval_ms: number;
}

export interface SensorHealth {
  online: boolean;
  last_update_ms_ago: number;
  last_update_at: number;
}

export interface AutomationEvent {
  id: number;
  event_type: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  triggered_at: number;
  resolved_at: number | null;
}

export interface PhaseInput {
  name?: string;
  min_water_level_pct: number;
  max_water_level_pct: number;
}
```

---

## 7. WebSocket Event Listeners

```typescript
const useWebSocketListener = (event: string, handler: (data: any) => void) => {
  useEffect(() => {
    const unsubscribe = subscribeToWebSocketEvent(event, handler);
    return () => unsubscribe();
  }, [event, handler]);
};

// In AutomationProvider:
useWebSocketListener('phase_changed', (data) => {
  loadFieldState(); // Refresh
});

useWebSocketListener('automation_state_updated', (data) => {
  setAutomationState(data);
});

useWebSocketListener('sensor_offline_alert', (data) => {
  addEvent({
    event_type: 'sensor_offline',
    severity: 'error',
    message: data.message,
    triggered_at: Date.now(),
  });
});

useWebSocketListener('automation_event_created', (data) => {
  addEvent(data);
});

useWebSocketListener('sensor_online_prompt', (data) => {
  // Show modal asking farmer to resume automation
  setShowSensorResumePrompt(true);
});
```

---

## 8. Responsive Design Breakdown

### Desktop (>768px)
- 2-column layouts where applicable
- Sidebar navigation (if added)
- Full-width charts
- Range sliders for phase config

### Tablet (576px–768px)
- 1–2 column grids
- Collapsible sections for space
- Touch-friendly buttons (min 44px)

### Mobile (<576px)
- Single-column stack
- Large tap targets (48px+)
- Collapsible modals
- Hamburger navigation (if sidebar exists)
- Horizontal scroll for charts (if needed)

---

## 9. Internationalization (i18n)

All UI strings should be localized. Common keys:

```
automation.phase_tanam
automation.phase_vegetatif
automation.phase_primordia
automation.phase_pengisian
automation.phase_pematangan
automation.status_online
automation.status_offline
automation.event_flow_alert
automation.event_sensor_offline
automation.event_sensor_resume
automation.event_overflow
automation.button_next_phase
automation.button_start_season
automation.button_resume_automation
```

---

## 10. Summary of Frontend Structure

| Layer | Components |
|-------|-----------|
| **Context & Hooks** | AutomationContext, useAutomation, usePhaseTimer |
| **Cards & Panels** | FieldStateCard, AutomationStatusCard, PhaseConfigPanel, EventLogViewer |
| **Modals & Dialogs** | PhaseEditorModal, PhaseTransitionModal, SensorResumePrompt |
| **Controls** | ToggleAutomationButton, RateLimitConfig |
| **Pages** | Dashboard (enhanced), AutomationSettingsPage (new) |
| **Enhanced Components** | SolenoidControl (disabled if automation ON), SystemStatusBar (shows automation status) |

---

## 11. Error Handling & UX

### API Errors
- Show toast notification: "Gagal menyimpan konfigurasi. Coba lagi."
- Keep user input in form (don't clear on error)

### Network Errors
- Detect if WebSocket disconnected
- Show banner: "Koneksi terputus. Refresh halaman untuk menyambung kembali."

### Validation Errors
- Inline validation on range sliders
- Prevent saving if min > max
- Show error tooltip below field

### Loading States
- Disable buttons during save
- Show spinner in modals
- Real-time updates via WebSocket (minimal polling needed)

