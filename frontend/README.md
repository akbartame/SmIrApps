# SmIr Frontend

Vite + React + TypeScript + Tailwind + Recharts dashboard for the SmIr backend.

**Status: syntax-checked only, not runtime-tested or built.** No network in
this sandbox → `npm install` never ran, so this has never actually rendered
in a browser. I ran a best-effort type check against a copy of TypeScript
that happened to be preinstalled globally (not this project's own
dependency versions, and without `@types/react`/`vite` type packages
available), which surfaces real logic/syntax errors but can't catch
dependency-version-specific issues or actually confirm it builds. Treat this
as a first pass to `npm install && npm run dev` and shake out locally.

## Setup

```bash
npm install
npm run dev       # starts on :5173, proxies /api and /ws to localhost:3000
```

Requires the backend running on `:3000` (see `../backend`). No `.env` is
needed for local dev — `vite.config.ts` proxies `/api` → REST and `/ws` →
the WebSocket hub.

## Structure

```
src/
  types/            Shared TS types, field names kept identical to the wire format
  lib/
    config.ts       API/WS base paths
    api.ts          REST client
    format.ts        Sentinel-value + unit formatting (see below)
  hooks/
    useWebSocket.ts   Auto-reconnecting WS connection
    useNodeHistory.ts REST bootstrap + WS live-append for chart data, rolling time window
  context/
    NodesContext.tsx  App-wide state: latest readings, online map, master status, command lifecycle
  components/
    layout/           Header / system status bar
    nodes/            Relay + sensor node cards, online badge, solenoid control
    charts/           Time range picker, generic history chart, dual-axis voltage/current chart
```

## How the required behaviors are implemented

**Real-time via WebSocket, not polling.** `useWebSocket` opens one
connection to `/ws` and auto-reconnects on drop. All live data —
`nodesensor`, `heartbeat`, `command_update` — flows through
`NodesContext`'s reducer. Nothing in this app polls a REST endpoint on an
interval; REST is only used for the initial page-load bootstrap and as a
one-off fallback.

**Command control never shows an optimistic ON/OFF.** `SolenoidControl`
only lights up the ON or OFF button based on `actualSolenoidState` (the
latest real `solenoid_state` from a relay's own status packet). While a
command is in flight (`pending` or `not_confirmed`), both buttons are
disabled and neither is highlighted — a "Menunggu konfirmasi…" label shows
instead. The button only reflects a new state once the backend's
`command_update` broadcast reports `confirmed` (which itself only happens
after a follow-up relay status packet matches what was requested — see the
backend's reconciliation logic). `not_confirmed` is deliberately treated the
same as "still waiting", not as a failure, matching the docs.

**Online/offline strictly from the heartbeat.** `OnlineBadge` takes a
`NodeOnlineInfo` (`{ online, seen_ms_ago }`) sourced only from
`masterStatus.nodes` / the `heartbeat` WS event — never from whether
`nodesensor_latest` has a recent timestamp. If the master itself stops
heartbeating, every badge will (correctly) go stale rather than quietly
keep showing "online" based on old data.

**Sentinel values.** `distance_mm === 0` and `temperature_c_x100 === -12700`
both render as "Sensor tidak terbaca" via `lib/format.ts`, never as a valid
0mm/0°C reading, and are excluded (as `null`, so the line has a gap) from
their respective charts. See the comment in `format.ts` for the caveat the
docs themselves raise: `distance_mm: 0` is documented as ambiguous (could be
a genuine 0mm reading), and this UI cannot tell the difference — it always
renders it as unreadable, per your instruction. That's a limitation of the
payload, not something the UI can fix.

## Design choices worth knowing about

- **Mode is global, not per-node** (per `BACKEND_INTEGRATION_GUIDE.md` §3).
  There's a single system-mode indicator in the header plus a "Matikan
  Semua" (mode 0) kill switch there. Each relay card's ON/OFF button still
  sends `mode: 1` targeted at that node — per the protocol, there's no way
  to toggle a solenoid without implicitly setting the system to Manual, so
  the auto-mode panel in each card carries a one-line note about that
  side-effect rather than hiding it.
- **Flow rate is shown as raw pulses/sec, not L/min.** The docs don't
  specify a pulses-per-liter constant for the flow sensor, so converting to
  a volumetric rate would mean inventing a calibration number. I left it as
  the raw derived rate with a note in the UI, rather than a plausible-looking
  fabricated conversion.
- **Voltage/current share a chart with dual Y-axes** rather than two
  separate charts, since they're different units/scales and are the same
  physical measurement pair from the docs.

## Known gaps

- **Never actually run.** See the status note at the top.
- No loading skeletons beyond a plain "Memuat…" text — functional, not
  polished, given the above.
- No error boundary around chart rendering; a malformed payload from a
  future firmware change could throw inside a chart rather than degrading
  gracefully. Worth hardening before this sees real hardware.
