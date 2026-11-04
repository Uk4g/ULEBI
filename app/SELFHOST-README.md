# Wardni v6 — Production Self-Hosted Edition

Wardni is an AI-assisted clinical night-shift monitoring and nurse-call triage system powered by Meta's 4-model pipeline:
`Muse Voice Transcribe 1.0 → SAM 3.1 → Muse Wonder 1.0 → Muse Spark 1.3`, backed by a deterministic clinical safety floor (`RULES` / `HARDWARE`) and local SQLite persistence (`@payloadcms/db-sqlite@4.0.0-beta.4`).

## What's Included in Wardni v6

1. **Dual Theme System (Night-Shift Dark & Daylight Light)**
   - **Night-Shift (Default)**: Near-black backgrounds (`#0B0B0D` to `#111114`), `#16161A` modular 12px cards, `#26262B` 1px borders, monospace timers/latency/tokens, and soft urgency pulse animations (respecting `prefers-reduced-motion`).
   - **Daylight**: Warm off-white background (`#F7F4EE`), pastel KPI cards, and a serif greeting heading (`Good evening, Nurse Sara`) with a clinical line-art illustration.
   - Instant toggle in the top bar and Login screen.

2. **Two-Level Global Navigation & Command Palette (`Cmd/Ctrl+K`)**
   - **Far-Left Icon Rail** + **Collapsible Expanded Sidebar** (drawer on mobile) with grouped sections:
     - *Triage & Clinical*: `Ward Dashboard`, `Vision Tracking`, `Bedside Voice`, `Bedside Pads`
     - *Analytics & Audit*: `Usage & Costs`, `Activity Calendar`, `Staff`
   - **Top Bar**: Global search (`Cmd/Ctrl+K`), page title, live AI status pill, Notifications bell with `Mark all read`, Help & shortcuts modal, Alert Tones toggle, Theme toggle, `Meta API Keys`, `Staff Accounts` (admin), and `Lock Station`.

3. **Home / Ward Dashboard (Sections 3A–3H)**
   - **A. Greeting + Quick Actions**: `Add Room`, `Call Nurse`, `Synthesize Shift`, `Open Activity Calendar`.
   - **B. Summary Metrics Strip**: `Critical · Red`, `Caution · Yellow`, `Stable · Routine`, `Nurses on Duty` with live 2s polling and click-to-filter.
   - **C. Meta AI Pipeline Bar**: Interactive chips for `Voice Transcribe 1.0 → SAM 3.1 → Wonder 1.0 → Spark 1.3` with live latency history & test drawer.
   - **D. Shift Directive Card**: Muse Spark 1.3 ward merge with `Synthesize Shift`, `Copy`, `Print`, and `Regenerate`.
   - **E. Priority Triage Board**: Tabs (`All / Critical / Caution / Stable`), search, clinical filter, `+ Add Room`, clickable `Vision / Voice / Pad` slots, `Call Nurse / Escalate`, `Mark Stable`, and card overflow menu (`Edit room`, `Delete room`, `View timeline`).
   - **F. Active Nurse Calls**: Step indicator (`1/3`), live countdown bar, `Step Timeout` (`15/30/45/60/90/120s`), `Acknowledge`, and `Next`.
   - **G. Shift Roster**: Reorderable list with `On duty / Off` toggle, `Up / Down` arrows, `Remove`, and `+ Add nurse`.
   - **H. Recent Verdicts**: Sortable table with `All / Vision / Voice / Pad` tabs, click-to-jump to that exact second on the timeline, and Payload Admin audit link.

4. **Usage & Costs (`src/app/(frontend)/usage/`)**
   - Area/line chart of spend with `Current / Previous / Average` series, `Customize` modal, and `24h / 7 days / 3 months` range controls.
   - `Average Daily Spend`, `Average Monthly Spend`, and configurable `Budget Limit` with threshold alert.
   - `Model Tokens & Pricing` table (`Voice Transcribe 1.0`, `SAM 3.1`, `Wonder 1.0`, `Spark 1.3`) + Stacked Bar Chart of cost per model + `Export CSV`.

5. **Activity Calendar & Second-by-Second Timeline (`src/app/(frontend)/calendar/`)**
   - Monthly & Weekly calendar with heat indicators, RED alert dots, `+N more` overflow, and monthly totals header.
   - Scrubbable **1-second resolution timeline** (`00:00:00` – `23:59:59`) with `Play / Pause` and `1x / 2x / 5x / 10x` speed controls that replays exact room statuses, active calls, roster, and model swim lanes (`Export log`).

6. **Login Page (`Lock Station`), RBAC (`Admin`, `Charge Nurse`, `Nurse`), and Floating AI Assistant**
   - Full workstation login with Email or Staff ID, Password show/hide, `Remember this station`, `Forgot password`, `Request access / Sign up` (approvable in Staff Accounts), and 5-attempt lockout.
   - Floating AI Assistant grounded in the live ward snapshot with one-click timeline jump buttons.

## Quick Start

```bash
cp .env.example .env
# Set PAYLOAD_SECRET (e.g. openssl rand -hex 32)
pnpm install
pnpm payload migrate   # First run only: initializes tables in wardni.db
pnpm dev
```

## Offline Unit Tests

```bash
pnpm test
```
