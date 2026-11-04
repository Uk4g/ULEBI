'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Pause, Play, Search, SlidersHorizontal } from 'lucide-react'
import { useWard } from '@/components/wardni/WardProvider'
import { Button, inputCls, LevelBadge, Panel, cx, clockTime } from '@/components/wardni/ui'
import { buildTelemetryStream, MODEL_META, replayStateAtSecond } from '@/lib/wardni/analytics'
import type { Level, ModelKey, WardEventDTO } from '@/lib/wardni/types'

type ViewMode = 'month' | 'week'

const pad2 = (n: number) => String(n).padStart(2, '0')
const toDateKey = (msOrIso: number | string) => {
  const d = new Date(msOrIso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const formatSecOfDay = (sec: number) => {
  const s = Math.max(0, Math.min(86399, Math.round(sec)))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
}

export function CalendarView() {
  const { snap, timelineJumpIso, setTimelineJumpIso, pushToast } = useWard()

  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date())
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => toDateKey(Date.now()))
  const [scrubberSec, setScrubberSec] = useState<number>(() => {
    const now = new Date()
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  })
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10>(1)

  const [searchQuery, setSearchQuery] = useState('')
  const [roomFilter, setRoomFilter] = useState('ALL')
  const [modelFilter, setModelFilter] = useState<'ALL' | ModelKey | 'rules'>('ALL')
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | Level>('ALL')
  const [nurseFilter, setNurseFilter] = useState('ALL')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hoveredTick, setHoveredTick] = useState<string | null>(null)

  useEffect(() => {
    if (!timelineJumpIso) return
    const d = new Date(timelineJumpIso)
    if (!Number.isNaN(d.getTime())) {
      setCursorDate(new Date(d.getFullYear(), d.getMonth(), 1))
      setSelectedDayKey(toDateKey(d.getTime()))
      setScrubberSec(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds())
      pushToast({ tone: 'info', title: `Jumped to ${clockTime(timelineJumpIso)}` })
    }
    setTimelineJumpIso(null)
  }, [timelineJumpIso, setTimelineJumpIso, pushToast])

  useEffect(() => {
    if (!playing) return
    const iv = setInterval(() => {
      setScrubberSec((s) => (s + speed >= 86399 ? 0 : s + speed))
    }, 1000)
    return () => clearInterval(iv)
  }, [playing, speed])

  const filteredEvents = useMemo(() => {
    const evs = snap?.events || []
    return evs.filter((e) => {
      if (roomFilter !== 'ALL' && e.room !== roomFilter && e.roomName !== roomFilter) return false
      if (urgencyFilter !== 'ALL' && e.level !== urgencyFilter) return false
      if (modelFilter !== 'ALL') {
        if (modelFilter === 'rules' && e.engine !== 'rules' && e.engine !== 'hardware') return false
        if (modelFilter === 'wonder' && e.engine !== 'wonder') return false
        if (modelFilter === 'sam' && e.source !== 'SAM') return false
        if (modelFilter === 'voice' && e.source !== 'VOICE') return false
        if (modelFilter === 'spark' && e.engine !== 'spark') return false
      }
      if (nurseFilter !== 'ALL') {
        const esc = (snap?.escalations || []).find((x) => x.room === e.room || x.roomName === e.roomName)
        if (!esc || (!esc.assignedNurseName?.includes(nurseFilter) && !esc.acknowledgedBy?.includes(nurseFilter))) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const hay = `${e.roomName || ''} ${e.headline || ''} ${e.reason || ''} ${e.nurseAction || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [snap?.events, snap?.escalations, roomFilter, urgencyFilter, modelFilter, nurseFilter, searchQuery])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WardEventDTO[]>()
    for (const e of filteredEvents) {
      const k = toDateKey(e.createdAt)
      const list = map.get(k) || []
      list.push(e)
      map.set(k, list)
    }
    return map
  }, [filteredEvents])

  const calendarDays = useMemo(() => {
    const year = cursorDate.getFullYear()
    const month = cursorDate.getMonth()
    if (viewMode === 'week') {
      const base = new Date(selectedDayKey + 'T12:00:00')
      const dayOfWeek = base.getDay()
      const start = new Date(base)
      start.setDate(base.getDate() - dayOfWeek)
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        return { date: d, key: toDateKey(d.getTime()), inMonth: d.getMonth() === month }
      })
    }
    const firstDay = new Date(year, month, 1)
    const startOffset = firstDay.getDay()
    const start = new Date(year, month, 1 - startOffset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return { date: d, key: toDateKey(d.getTime()), inMonth: d.getMonth() === month }
    })
  }, [cursorDate, viewMode, selectedDayKey])

  const targetMs = useMemo(() => {
    const [y, m, d] = selectedDayKey.split('-').map(Number)
    const hh = Math.floor(scrubberSec / 3600)
    const mm = Math.floor((scrubberSec % 3600) / 60)
    const ss = scrubberSec % 60
    return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss).getTime()
  }, [selectedDayKey, scrubberSec])

  const replayState = useMemo(() => {
    if (!snap) return null
    return replayStateAtSecond({
      rooms: snap.rooms,
      events: snap.events,
      escalations: snap.escalations,
      nurses: snap.nurses,
      apiLogs: snap.apiLogs,
      targetMs,
    })
  }, [snap, targetMs])

  const dayTelemetry = useMemo(() => {
    if (!snap) return []
    const all = buildTelemetryStream(snap.events, snap.apiLogs)
    return all.filter((item) => toDateKey(item.atMs) === selectedDayKey)
  }, [snap, selectedDayKey])

  if (!snap) return <div className="h-96 animate-pulse rounded-[12px] border border-line bg-panel" />

  const usage = snap.usage
  const dayEvents = eventsByDay.get(selectedDayKey) || []

  const exportLog = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      selectedDay: selectedDayKey,
      scrubberSecond: formatSecOfDay(scrubberSec),
      events: filteredEvents,
      apiLogs: snap.apiLogs,
      auditLogs: snap.auditLogs,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wardni-activity-log-${selectedDayKey}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    pushToast({ tone: 'ok', title: 'Exported Activity Log' })
  }

  return (
    <div className="space-y-5">
      {/* Header matching Reference 6 ("15h 35m / $330 this month" on left; "< May > [filter] [Week | Month]" on right) */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-serif text-3xl font-normal tracking-tight text-white">
            {(usage?.totalCallsMonth ?? snap.events.length).toLocaleString()} AI calls
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {(usage?.totalTokensMonth ?? 0).toLocaleString()} tokens · ${(usage?.totalCostMonthUsd ?? 0).toFixed(2)} this month
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-h-[32px] items-center gap-2 rounded-lg border border-line bg-panel px-2.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1))}
              className="p-1 text-slate-400 hover:text-white"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[60px] text-center text-xs font-medium text-white">
              {cursorDate.toLocaleDateString([], { month: 'short' })}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1))}
              className="p-1 text-slate-400 hover:text-white"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const now = new Date()
              setCursorDate(new Date(now.getFullYear(), now.getMonth(), 1))
              setSelectedDayKey(toDateKey(now.getTime()))
              setScrubberSec(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds())
            }}
          >
            Today
          </Button>

          <Button size="sm" variant="secondary" onClick={() => setFiltersOpen((o) => !o)} aria-label="Toggle calendar filters">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>

          <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
            {(['week', 'month'] as ViewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={cx(
                  'min-h-[28px] rounded-md px-3 py-1 capitalize font-medium transition',
                  viewMode === m ? 'bg-raised text-white' : 'text-slate-400 hover:text-white',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>

      {filtersOpen && (
        <section className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-panel p-3">
          <select
            aria-label="Filter by room"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="min-h-[32px] rounded-lg border border-line-strong bg-well px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="ALL">All Rooms</option>
            {snap.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by model"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value as typeof modelFilter)}
            className="min-h-[32px] rounded-lg border border-line-strong bg-well px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="ALL">All Models</option>
            <option value="voice">Voice Transcribe 1.0</option>
            <option value="sam">SAM 3.1</option>
            <option value="wonder">Wonder 1.0</option>
            <option value="spark">Spark 1.3</option>
            <option value="rules">Rules / Hardware</option>
          </select>
          <select
            aria-label="Filter by urgency"
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value as typeof urgencyFilter)}
            className="min-h-[32px] rounded-lg border border-line-strong bg-well px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="ALL">All Urgencies</option>
            <option value="RED">Critical · Red</option>
            <option value="YELLOW">Caution · Yellow</option>
            <option value="routine">Stable · Routine</option>
          </select>
          <select
            aria-label="Filter by nurse"
            value={nurseFilter}
            onChange={(e) => setNurseFilter(e.target.value)}
            className="min-h-[32px] rounded-lg border border-line-strong bg-well px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="ALL">All Nurses</option>
            {snap.nurses.map((n) => (
              <option key={n.id} value={n.name}>
                {n.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* Calendar Grid matching Reference 6 (diagonal hatched out-of-month cells, subtle dark pill entries) */}
      <section className="overflow-hidden border border-line bg-ink">
        <div className="grid grid-cols-7 border-b border-line bg-panel text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
            <div key={d} className="px-3 py-2.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y divide-line">
          {calendarDays.map((cell) => {
            const cellEvents = eventsByDay.get(cell.key) || []
            const hasRed = cellEvents.some((e) => e.level === 'RED')
            const selected = cell.key === selectedDayKey
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  setSelectedDayKey(cell.key)
                  if (cellEvents[0]) {
                    const d = new Date(cellEvents[0].createdAt)
                    setScrubberSec(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds())
                  }
                }}
                className={cx(
                  'flex min-h-[100px] flex-col justify-between p-2.5 text-left transition',
                  !cell.inMonth ? 'cal-hatched text-slate-600' : 'bg-ink text-slate-200 hover:bg-panel',
                  selected && 'bg-raised',
                )}
              >
                <div className="flex w-full items-start justify-between gap-1">
                  <span className={cx('text-xs font-medium', !cell.inMonth ? 'text-slate-600' : 'text-white')}>
                    {cell.date.getDate()}
                  </span>
                  {hasRed && <span className="h-1.5 w-1.5 rounded-full bg-crit" title="RED alert" />}
                </div>

                <div className="mt-1.5 w-full space-y-1">
                  {cellEvents.slice(0, 1).map((ev) => (
                    <div key={ev.id} className="truncate rounded bg-raised px-2 py-1 text-[10px] text-slate-300">
                      {ev.roomName} · {ev.headline}
                    </div>
                  ))}
                  {cellEvents.length > 1 && (
                    <div className="px-1 text-[10px] font-medium text-slate-400">+{cellEvents.length - 1} more</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Bottom Search Bar matching Reference 6 ("Events ... [ Search events... ] [ Export ]") */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-xs font-medium text-white">Timeline Replay ({selectedDayKey})</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className={cx(inputCls, 'w-56 pl-8 py-1 text-xs')}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={exportLog}>
            <Download className="h-3.5 w-3.5" /> Export log
          </Button>
        </div>
      </div>

      {/* Day View & 1-Second Resolution Scrubber */}
      <Panel
        title={`1-Second Resolution Replay — ${formatSecOfDay(scrubberSec)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={playing ? 'danger' : 'primary'} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </Button>
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value) as 1 | 2 | 5 | 10)}
              className="min-h-[32px] rounded-lg border border-line-strong bg-well px-2 py-1 font-mono text-xs text-slate-300"
            >
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={5}>5x</option>
              <option value={10}>10x</option>
            </select>
          </div>
        }
        bodyClassName="space-y-4"
      >
        <div className="space-y-2 rounded-xl border border-line bg-well p-3.5">
          <input
            type="range"
            aria-label="Second-by-second timeline scrubber"
            min={0}
            max={86399}
            step={1}
            value={scrubberSec}
            onChange={(e) => setScrubberSec(Number(e.target.value))}
            className="w-full cursor-pointer accent-white"
          />
          <div className="flex justify-between font-mono text-[10px] text-slate-500">
            <span>00:00:00</span>
            <span>06:00:00</span>
            <span>12:00:00</span>
            <span>18:00:00</span>
            <span>23:59:59</span>
          </div>

          {dayEvents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              {dayEvents.map((ev) => {
                const d = new Date(ev.createdAt)
                const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setScrubberSec(sec)}
                    className="rounded border border-line-strong bg-panel px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:border-white"
                  >
                    {clockTime(ev.createdAt)} · {ev.roomName}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Swim Lanes per Model */}
        <div className="space-y-2 rounded-xl border border-line bg-well p-3.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Model Swim Lanes</span>
            {hoveredTick && <span className="font-mono text-[11px] text-slate-300">{hoveredTick}</span>}
          </div>
          {MODEL_META.map((m) => {
            const calls = dayTelemetry.filter((t) => t.modelKey === m.key)
            return (
              <div key={m.key} className="flex items-center gap-3">
                <div className="w-36 shrink-0 truncate font-mono text-[11px] text-slate-400">{m.label}</div>
                <div className="relative h-6 flex-1 rounded border border-line bg-panel">
                  <div
                    className="pointer-events-none absolute inset-y-0 w-px bg-white"
                    style={{ left: `${(scrubberSec / 86399) * 100}%` }}
                  />
                  {calls.map((c) => {
                    const d = new Date(c.atMs)
                    const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
                    const leftPct = (sec / 86399) * 100
                    const summary = `${m.label} · ${c.summary} · ${c.latencyMs}ms · $${c.costUsd.toFixed(4)}`
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onMouseEnter={() => setHoveredTick(summary)}
                        onClick={() => setScrubberSec(sec)}
                        style={{ left: `${leftPct}%` }}
                        className="absolute top-1 h-4 w-1.5 -translate-x-1/2 rounded-sm bg-white"
                      />
                    )
                  })}
                </div>
                <span className="w-12 text-right font-mono text-[10px] text-slate-500">{calls.length}</span>
              </div>
            )
          })}
        </div>

        {replayState && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-well p-3.5">
              <div className="mb-2 font-mono text-[10px] uppercase text-slate-500">Room Statuses at {formatSecOfDay(scrubberSec)}</div>
              {replayState.rooms.length === 0 ? (
                <div className="text-xs text-slate-500">No rooms configured.</div>
              ) : (
                <div className="space-y-1.5">
                  {replayState.rooms.map((r) => (
                    <div key={r.room.id} className="flex items-center justify-between rounded border border-line bg-panel px-2.5 py-1.5 text-xs">
                      <span className="text-white">{r.room.name}</span>
                      <LevelBadge level={r.level} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-line bg-well p-3.5">
              <div className="mb-2 font-mono text-[10px] uppercase text-slate-500">Active Calls at {formatSecOfDay(scrubberSec)}</div>
              {replayState.activeCalls.length === 0 ? (
                <div className="text-xs text-slate-500">No active calls at this second.</div>
              ) : (
                replayState.activeCalls.map((c) => (
                  <div key={c.id} className="rounded border border-line bg-panel p-2 text-xs">
                    <div className="font-medium text-white">{c.assignedNurseName}</div>
                    <div className="font-mono text-[10px] text-slate-400">
                      Step {c.stepIndex}/{c.totalSteps} · {c.remainingSec}s left
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-line bg-well p-3.5">
              <div className="mb-2 font-mono text-[10px] uppercase text-slate-500">On-Duty Roster ({replayState.rosterOnDuty.length})</div>
              <div className="text-xs text-slate-400">
                {replayState.rosterOnDuty.map((n) => n.name).join(', ') || 'No nurses on duty.'}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
