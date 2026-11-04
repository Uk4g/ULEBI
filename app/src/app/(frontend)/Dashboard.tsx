'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  ChevronsRight,
  Clock,
  Copy,
  Edit3,
  Eraser,
  ExternalLink,
  Filter,
  KeyRound,
  Mic,
  MoreHorizontal,
  PhoneCall,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Tablet,
  Trash2,
  UserRound,
  Users,
  Video,
} from 'lucide-react'
import { api } from '@/components/wardni/client'
import { RoomFormModal } from '@/components/wardni/RoomFormModal'
import { useNow, useWard } from '@/components/wardni/WardProvider'
import {
  Button,
  ConfirmModal,
  Empty,
  EngineTag,
  ErrorText,
  Field,
  inputCls,
  LEVEL_STYLES,
  LevelBadge,
  Modal,
  Panel,
  cx,
  timeAgo,
  clockTime,
} from '@/components/wardni/ui'
import {
  LEVEL_RANK,
  roomLevel,
  type EscalationDTO,
  type EventSummary,
  type Level,
  type ModelKey,
  type RoomDTO,
  type Source,
} from '@/lib/wardni/types'
import { classifyModelKey, MODEL_META } from '@/lib/wardni/analytics'

const SOURCES: { key: Source; label: string; icon: typeof Video; href: string }[] = [
  { key: 'SAM', label: 'Vision', icon: Video, href: '/vision' },
  { key: 'VOICE', label: 'Voice', icon: Mic, href: '/voice' },
  { key: 'TASK', label: 'Pad', icon: Tablet, href: '/tasks' },
]

type BoardItem = { rm: RoomDTO; level: Level | 'STANDBY'; top?: EventSummary; esc?: EscalationDTO; lastAt: number }
type FilterLevel = 'ALL' | 'RED' | 'YELLOW' | 'ROUTINE'
type AdvancedFilter = 'ALL' | 'ACTIVE_CALL' | 'FALL_RISK' | 'NPO' | 'CAMERA'
type VerdictTab = 'ALL' | 'SAM' | 'VOICE' | 'TASK'
type SortField = 'time' | 'room' | 'source' | 'level' | 'latency'

export function Dashboard() {
  const { snap, setApiModalOpen, theme, pushToast, refresh, setTimelineJumpIso } = useWard()
  const router = useRouter()
  const now = useNow(1000)

  const [roomModalOpen, setRoomModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<RoomDTO | null>(null)
  const [callPickerOpen, setCallPickerOpen] = useState(false)
  const [selectedPipelineModel, setSelectedPipelineModel] = useState<ModelKey | null>(null)
  const [detailSlot, setDetailSlot] = useState<{ room: RoomDTO; source: Source } | null>(null)
  const [auditModalOpen, setAuditModalOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(true)

  const [filter, setFilter] = useState<FilterLevel>('ALL')
  const [roomSearch, setRoomSearch] = useState('')
  const [advFilter, setAdvFilter] = useState<AdvancedFilter>('ALL')

  const board = useMemo<BoardItem[]>(() => {
    const rooms = snap?.rooms || []
    const escByRoom = new Map((snap?.escalations || []).filter((e) => e.active).map((e) => [e.room, e]))
    return rooms
      .map((rm) => {
        const level = roomLevel(rm)
        const latest = Object.values(rm.latestBySource || {}).filter((e): e is EventSummary => Boolean(e))
        const cleared = rm.clearedAt ? Date.parse(rm.clearedAt) : 0
        const top = latest
          .filter((e) => Date.parse(e.at) > cleared)
          .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || Date.parse(b.at) - Date.parse(a.at))[0]
        const esc = escByRoom.get(rm.id)
        const effective: Level | 'STANDBY' = esc && LEVEL_RANK[esc.level] > (LEVEL_RANK[level] || 0) ? esc.level : level
        const lastAt = Math.max(0, ...latest.map((e) => Date.parse(e.at)))
        return { rm, level: effective, top, esc, lastAt }
      })
      .sort((a, b) => (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0) || b.lastAt - a.lastAt)
  }, [snap])

  if (!snap) return <DashboardSkeleton />

  const counts: Record<string, number> = { RED: 0, YELLOW: 0, routine: 0, STANDBY: 0 }
  board.forEach((b) => {
    counts[b.level] = (counts[b.level] || 0) + 1
  })
  const onDuty = snap.nurses.filter((n) => n.onDuty !== false).length

  const filteredBoard = board.filter((b) => {
    if (filter === 'RED' && b.level !== 'RED') return false
    if (filter === 'YELLOW' && b.level !== 'YELLOW') return false
    if (filter === 'ROUTINE' && b.level !== 'routine' && b.level !== 'STANDBY') return false
    if (advFilter === 'ACTIVE_CALL' && !b.esc) return false
    if (advFilter === 'FALL_RISK' && !/fall|hip|post.?op|frail|dizz/i.test(b.rm.clinicalContext || '')) return false
    if (advFilter === 'NPO' && !/npo|nil by mouth|fasting/i.test(b.rm.clinicalContext || '')) return false
    if (advFilter === 'CAMERA' && !b.rm.camUrl) return false
    if (roomSearch.trim()) {
      const q = roomSearch.toLowerCase().trim()
      const matchName = b.rm.name.toLowerCase().includes(q)
      const matchCtx = (b.rm.clinicalContext || '').toLowerCase().includes(q)
      const matchTop = (b.top?.headline || '').toLowerCase().includes(q)
      if (!matchName && !matchCtx && !matchTop) return false
    }
    return true
  })

  const apiState = snap.api?.state || 'CHECKING'
  const apiProblem = apiState === 'INVALID_API' || apiState === 'UNREACHABLE'
  const firstName = (snap.me.name || 'Nurse Sara').split(',')[0]
  const todayLabel = new Date(snap.serverTime || Date.now()).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* SECTION 3A: Greeting + Quick Actions (Plane Wiki + Snowflake + Daylight Reference 4) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">{todayLabel}</div>
            <h2
              className={cx(
                'mt-1 tracking-tight text-white',
                'font-serif text-3xl sm:text-4xl font-normal',
              )}
            >
              Good evening, {firstName}
            </h2>
          </div>

          {/* Hand-drawn line illustration matching Reference 4 */}
          <div className="flex items-center gap-4">
            <svg
              viewBox="0 0 120 84"
              className={cx('h-16 w-24 shrink-0', theme === 'light' ? 'text-zinc-900' : 'text-zinc-500')}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="62" cy="22" r="10" />
              <path d="M52 18c4-5 14-5 20 0" />
              <path d="M26 78c2-26 18-38 38-38s34 12 36 38" />
              <rect x="54" y="46" width="12" height="14" rx="2" />
              <path d="M66 49h4a3 3 0 0 1 0 6h-4" />
              <path d="M40 62c8-2 14-4 14-10" />
            </svg>
          </div>
        </div>

        {/* How to Use ULEBI — Quick-Start Guide (First section of Dashboard) */}
        {(() => {
          const step1Done = apiState === 'LIVE'
          const step2Done = onDuty > 0
          const step3Done = snap.rooms.length > 0
          const step4Done = snap.events.length > 0
          const completedCount = [step1Done, step2Done, step3Done, step4Done].filter(Boolean).length

          if (!guideOpen) {
            return (
              <div className="flex items-center justify-between rounded-[12px] border border-line bg-panel px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <BookOpen className="h-4 w-4 text-slate-400" />
                  <span>
                    <strong>How to Use ULEBI</strong> · {completedCount}/4 setup steps completed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => router.push('/guide')}>
                    Open Full Guide
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setGuideOpen(true)}>
                    Show Steps
                  </Button>
                </div>
              </div>
            )
          }

          const guideSteps = [
            {
              num: 1,
              done: step1Done,
              title: 'Connect & Verify Meta API Key',
              desc: 'Open the API Key checker, paste your Meta key, and click Save & Verify Live to arm all 4 models.',
              btnLabel: step1Done ? 'API Verified (View)' : '1. Verify API Key →',
              onClick: () => setApiModalOpen(true),
            },
            {
              num: 2,
              done: step2Done,
              title: 'Add On-Duty Nurse to Roster',
              desc: 'Add at least one nurse so ULEBI knows who to page in order when a room triggers a Yellow or Red alert.',
              btnLabel: step2Done ? `${snap.nurses.length} Nurse(s) Ready` : '2. + Quick Add Nurse →',
              onClick: async () => {
                const names = ['Nurse Sara', 'Nurse Karim', 'Nurse Lina', 'Nurse Yacine']
                const nextName = names[snap.nurses.length % names.length]
                try {
                  await api('/ward-api/nurses', {
                    body: { name: nextName, role: snap.nurses.length === 0 ? 'Charge RN' : 'Ward RN', onDuty: true },
                  })
                  await refresh()
                  pushToast({ tone: 'ok', title: `Added ${nextName} to Shift Roster` })
                } catch (e) {
                  pushToast({ tone: 'err', title: 'Could not add nurse', detail: (e as Error).message })
                }
              },
            },
            {
              num: 3,
              done: step3Done,
              title: 'Add a Patient Room (& Optional Test Video)',
              desc: 'Click Add Room, enter a room number (e.g. Room 204), enable Camera Audio Scraping, or attach a local video file (.mp4/.webm).',
              btnLabel: step3Done ? `${snap.rooms.length} Room(s) Added (+ Add More)` : '3. + Add Patient Room →',
              onClick: () => {
                setEditingRoom(null)
                setRoomModalOpen(true)
              },
            },
            {
              num: 4,
              done: step4Done,
              title: 'Test Video Frame & Audio Scraping',
              desc: 'Open Vision Tracking or Bedside Voice to test a video file or scrape camera audio, then view real tokens & Calendar replay.',
              btnLabel: '4. Open Vision & Test →',
              onClick: () => router.push('/vision'),
            },
          ]

          return (
            <section className="overflow-hidden rounded-[12px] border border-line bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line-strong bg-raised text-white">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-white">How to Use ULEBI — Quick-Start Guide</h3>
                      <span className="rounded border border-line-strong bg-well px-2 py-0.5 font-mono text-[10px] text-slate-300">
                        {completedCount}/4 Completed
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Follow these 4 steps in order to set up the ward, test models with a video/audio file, and track live usage.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => router.push('/guide')}>
                    Full Guide
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setGuideOpen(false)}>
                    Hide
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {guideSteps.map((s) => (
                  <div key={s.num} className="flex flex-col justify-between rounded-xl border border-line bg-well p-3.5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          STEP {s.num}
                        </span>
                        <span
                          className={cx(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]',
                            s.done
                              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                              : 'border border-line-strong bg-panel text-slate-400',
                          )}
                        >
                          {s.done ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Done
                            </>
                          ) : (
                            'Pending'
                          )}
                        </span>
                      </div>
                      <div className="mt-2 text-xs font-semibold text-white">{s.title}</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{s.desc}</p>
                    </div>
                    <div className="mt-3 border-t border-line pt-2">
                      <Button
                        size="sm"
                        variant={s.done ? 'secondary' : 'primary'}
                        onClick={s.onClick}
                        className="w-full justify-center"
                      >
                        {s.btnLabel}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })()}

        {/* Quick Actions Row */}
        <div>
          <div className="mb-2.5 text-xs font-medium text-slate-400">Quick actions</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickActionCard
              icon={Plus}
              title="Add Room"
              desc="Register a room, camera audio, or test video"
              onClick={() => {
                setEditingRoom(null)
                setRoomModalOpen(true)
              }}
            />
            <QuickActionCard
              icon={PhoneCall}
              title="Call Nurse"
              desc="Page on-duty nurses in call order"
              onClick={() => setCallPickerOpen(true)}
            />
            <QuickActionCard
              icon={Sparkles}
              title="Synthesize Shift"
              desc="Merge room verdicts with Muse Spark 1.3"
              onClick={async () => {
                if (!snap.rooms.length) {
                  pushToast({ tone: 'info', title: 'Add a room first', detail: 'Add at least one patient room before synthesizing the shift.' })
                  return
                }
                pushToast({ tone: 'info', title: 'Synthesizing shift directive…' })
                try {
                  await api('/ward-api/triage', { body: { source: 'MERGE', reasoningEffort: 'low' } })
                  await refresh()
                  pushToast({ tone: 'ok', title: 'Shift directive updated' })
                } catch (e) {
                  pushToast({ tone: 'err', title: 'Synthesize failed', detail: (e as Error).message })
                }
              }}
            />
            <QuickActionCard
              icon={Calendar}
              title="Open Activity Calendar"
              desc="Inspect monthly log & 1-second replay"
              onClick={() => router.push('/calendar')}
            />
          </div>
        </div>
      </section>

      {/* SECTION 3B: Summary Metrics Strip (Pastel in Daylight mode like Reference 4, restrained bordered in Night-Shift mode) */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary Metrics Strip">
        <MetricCard
          label="CRITICAL · RED"
          value={counts.RED}
          icon={AlertOctagon}
          sub={counts.RED === 0 ? 'No critical rooms' : `${counts.RED} immediate room(s)`}
          tone="red"
          lightMode={theme === 'light'}
          active={filter === 'RED'}
          onClick={() => {
            setFilter(filter === 'RED' ? 'ALL' : 'RED')
            document.getElementById('triage-board')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
        <MetricCard
          label="CAUTION · YELLOW"
          value={counts.YELLOW}
          icon={AlertTriangle}
          sub={counts.YELLOW === 0 ? 'All checks clear' : `${counts.YELLOW} prompt check(s)`}
          tone="amber"
          lightMode={theme === 'light'}
          active={filter === 'YELLOW'}
          onClick={() => {
            setFilter(filter === 'YELLOW' ? 'ALL' : 'YELLOW')
            document.getElementById('triage-board')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
        <MetricCard
          label="STABLE · ROUTINE"
          value={counts.routine + counts.STANDBY}
          icon={CheckCircle2}
          sub={`${snap.rooms.length} room(s) monitored`}
          tone="green"
          lightMode={theme === 'light'}
          active={filter === 'ROUTINE'}
          onClick={() => {
            setFilter(filter === 'ROUTINE' ? 'ALL' : 'ROUTINE')
            document.getElementById('triage-board')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
        <MetricCard
          label="NURSES ON DUTY"
          value={onDuty}
          icon={Users}
          sub={`${snap.nurses.length} on shift roster`}
          tone="neutral"
          lightMode={theme === 'light'}
          active={false}
          onClick={() => {
            document.getElementById('shift-roster')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
      </section>

      {/* SECTION 3C: Meta AI Pipeline Bar */}
      <section className="rounded-[12px] border border-line bg-panel px-4 py-3" aria-label="Meta AI Pipeline Bar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Pipeline</span>
            <PipelineChip
              label="Voice Transcribe 1.0"
              ok={Boolean(snap.api?.voiceReady && apiState === 'LIVE')}
              latencyMs={snap.usage?.models.find((m) => m.key === 'voice')?.avgLatencyMs || null}
              active={selectedPipelineModel === 'voice'}
              onClick={() => setSelectedPipelineModel(selectedPipelineModel === 'voice' ? null : 'voice')}
            />
            <span className="text-slate-600" aria-hidden>
              →
            </span>
            <PipelineChip
              label="SAM 3.1"
              ok={snap.api?.samVerified}
              failed={Boolean(snap.api?.samError)}
              latencyMs={snap.api?.samLatencyMs}
              active={selectedPipelineModel === 'sam'}
              onClick={() => setSelectedPipelineModel(selectedPipelineModel === 'sam' ? null : 'sam')}
            />
            <span className="text-slate-600" aria-hidden>
              →
            </span>
            <PipelineChip
              label="Wonder 1.0"
              ok={snap.api?.wonderMode !== 'off' && apiState === 'LIVE'}
              latencyMs={snap.usage?.models.find((m) => m.key === 'wonder')?.avgLatencyMs || null}
              active={selectedPipelineModel === 'wonder'}
              onClick={() => setSelectedPipelineModel(selectedPipelineModel === 'wonder' ? null : 'wonder')}
            />
            <span className="text-slate-600" aria-hidden>
              →
            </span>
            <PipelineChip
              label="Spark 1.3"
              ok={snap.api?.sparkVerified}
              failed={Boolean(snap.api?.sparkError)}
              latencyMs={snap.api?.sparkLatencyMs}
              active={selectedPipelineModel === 'spark'}
              onClick={() => setSelectedPipelineModel(selectedPipelineModel === 'spark' ? null : 'spark')}
            />
          </div>

          <Button size="sm" variant={apiState === 'LIVE' ? 'secondary' : 'primary'} onClick={() => setApiModalOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            {apiState === 'LIVE' ? 'API Key Settings' : 'Connect Meta API Key'}
          </Button>
        </div>

        {selectedPipelineModel && (
          <ModelHistoryDrawer
            modelKey={selectedPipelineModel}
            onClose={() => setSelectedPipelineModel(null)}
            onOpenKeys={() => setApiModalOpen(true)}
          />
        )}

        {apiProblem && snap.api?.lastError && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-[11px] text-rose-300">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {snap.api.lastError} — Using deterministic RULES safety floor.
              </span>
            </span>
            <button type="button" onClick={() => setApiModalOpen(true)} className="font-sans text-xs font-medium text-white underline">
              Update key →
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          {/* SECTION 3D: Shift Directive Card */}
          <MergePanel />

          {/* SECTION 3E: Priority Triage Board (Plane Cycles Reference 3 tab pattern) */}
          <section id="triage-board" className="rounded-[12px] border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              {/* Plane Cycles style underline tabs */}
              <div className="flex items-center gap-5 text-xs font-medium" role="tablist">
                {(
                  [
                    ['ALL', `All (${board.length})`],
                    ['RED', `Critical (${counts.RED})`],
                    ['YELLOW', `Caution (${counts.YELLOW})`],
                    ['ROUTINE', `Stable (${counts.routine + counts.STANDBY})`],
                  ] as [FilterLevel, string][]
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={filter === k}
                    onClick={() => setFilter(k)}
                    className={cx(
                      'border-b-2 py-2 transition',
                      filter === k ? 'border-white text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200',
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    placeholder="Search rooms…"
                    className={cx(inputCls, 'w-40 pl-8 py-1 text-xs')}
                  />
                </div>
                <select
                  aria-label="Filter rooms"
                  value={advFilter}
                  onChange={(e) => setAdvFilter(e.target.value as AdvancedFilter)}
                  className="min-h-[32px] rounded-lg border border-line-strong bg-well px-2.5 py-1 text-xs text-slate-300"
                >
                  <option value="ALL">Filters</option>
                  <option value="ACTIVE_CALL">Active Call</option>
                  <option value="FALL_RISK">Fall Risk</option>
                  <option value="NPO">Strict NPO</option>
                  <option value="CAMERA">Camera Stream</option>
                </select>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setEditingRoom(null)
                    setRoomModalOpen(true)
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> + Add Room
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {board.length === 0 ? (
                <Empty
                  title="You don't have any patient rooms yet."
                  action={
                    <Button
                      variant="primary"
                      onClick={() => {
                        setEditingRoom(null)
                        setRoomModalOpen(true)
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> + Add Room
                    </Button>
                  }
                >
                  The ward starts clean with zero placeholder rooms. Add a room with its clinical risk profile to monitor Vision, Voice, and Bedside Pads.
                </Empty>
              ) : filteredBoard.length === 0 ? (
                <Empty
                  title="No rooms match this filter."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setFilter('ALL')
                        setAdvFilter('ALL')
                        setRoomSearch('')
                      }}
                    >
                      Reset filters
                    </Button>
                  }
                />
              ) : (
                filteredBoard.map((b) => (
                  <RoomCard
                    key={b.rm.id}
                    item={b}
                    now={now}
                    onEdit={(r) => {
                      setEditingRoom(r)
                      setRoomModalOpen(true)
                    }}
                    onOpenSlot={(room, source) => setDetailSlot({ room, source })}
                    onViewTimeline={(room) => {
                      const latestEv = snap.events.find((e) => e.room === room.id || e.roomName === room.name)
                      if (latestEv) setTimelineJumpIso(latestEv.createdAt)
                      router.push('/calendar')
                    }}
                  />
                ))
              )}
            </div>
          </section>

          {/* SECTION 3H: Recent Verdicts (Snowflake Reference 1 clean table style) */}
          <RecentVerdictsPanel
            now={now}
            onOpenAudit={() => setAuditModalOpen(true)}
            onJumpTimeline={(iso) => {
              setTimelineJumpIso(iso)
              router.push('/calendar')
            }}
          />
        </div>

        {/* Right 4 Columns: F. Active Nurse Calls + G. Shift Roster */}
        <div className="space-y-5 xl:col-span-4">
          <EscalationPanel now={now} />
          <RosterPanel />
        </div>
      </div>

      {/* Modals */}
      <RoomFormModal
        open={roomModalOpen}
        onClose={() => {
          setRoomModalOpen(false)
          setEditingRoom(null)
        }}
        room={editingRoom}
        withCamera={true}
      />

      <CallNursePickerModal open={callPickerOpen} onClose={() => setCallPickerOpen(false)} rooms={snap.rooms} />
      <ModuleSlotDetailModal slot={detailSlot} onClose={() => setDetailSlot(null)} />
      <FullAuditLogModal open={auditModalOpen} onClose={() => setAuditModalOpen(false)} />
    </div>
  )
}

function QuickActionCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof Plus
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col justify-between rounded-[12px] border border-line bg-panel p-4 text-left transition hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
    >
      <Icon className="h-4 w-4 text-slate-400 group-hover:text-white stroke-[1.75]" />
      <div className="mt-3">
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{desc}</div>
      </div>
    </button>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  sub,
  tone,
  lightMode,
  active,
  onClick,
}: {
  label: string
  value: number
  icon: typeof AlertOctagon
  sub: string
  tone: 'red' | 'amber' | 'green' | 'neutral'
  lightMode: boolean
  active: boolean
  onClick: () => void
}) {
  // Reference 4 exact pastel card styles in light mode; restrained monochrome in dark mode
  const pastelCls = {
    red: 'bg-[#F3D1DC] border-[#E4BAC8] text-zinc-900',
    amber: 'bg-[#B6D6F6] border-[#9AC2EB] text-zinc-900',
    green: 'bg-[#F4B79C] border-[#E5A082] text-zinc-900',
    neutral: 'bg-[#F3DE8A] border-[#E2C96B] text-zinc-900',
  }[tone]

  const mcToneCls = {
    red: 'mc-card mc-red',
    amber: 'mc-card mc-blue',
    green: 'mc-card mc-peach',
    neutral: 'mc-card mc-gold',
  }[tone]
  const dotCls = {
    red: 'text-rose-400',
    amber: 'text-sky-400',
    green: 'text-orange-300',
    neutral: 'text-amber-300',
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex min-h-[116px] flex-col justify-between rounded-[14px] border p-4 text-left transition duration-200 hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
        mcToneCls,
        active && 'ring-2 ring-white',
        tone === 'red' && value > 0 && 'animate-alarm',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Icon className={cx('h-4 w-4 stroke-[1.75]', 'text-slate-400')} aria-hidden />
        <span className={cx('font-mono text-[10px] font-semibold uppercase tracking-wider', 'text-slate-400')}>
          {label}
        </span>
      </div>
      <div className="mt-3">
        <div className={cx('font-mono text-3xl font-semibold tabular-nums', 'text-white')}>{value}</div>
        <div className={cx('mt-0.5 text-[11px]', 'text-slate-500')}>{sub}</div>
      </div>
    </button>
  )
}

function PipelineChip({
  label,
  ok,
  failed,
  latencyMs,
  active,
  onClick,
}: {
  label: string
  ok?: boolean
  failed?: boolean
  latencyMs?: number | null
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex min-h-[30px] items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition',
        active ? 'border-white bg-raised text-white' : 'border-line bg-well text-slate-300 hover:border-line-strong hover:text-white',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-400' : failed ? 'bg-rose-500' : 'bg-zinc-500')} />
      <span>{label}</span>
      <span className="text-[10px] text-slate-500">{latencyMs != null && latencyMs > 0 ? `${latencyMs}ms` : '—'}</span>
    </button>
  )
}

function ModelHistoryDrawer({
  modelKey,
  onClose,
  onOpenKeys,
}: {
  modelKey: ModelKey
  onClose: () => void
  onOpenKeys: () => void
}) {
  const { snap, refresh, pushToast } = useWard()
  const [testing, setTesting] = useState(false)
  const meta = MODEL_META.find((m) => m.key === modelKey)!
  const logs = (snap?.apiLogs || []).filter((l) => classifyModelKey(l.model) === modelKey).slice(0, 8)
  const stats = snap?.usage?.models.find((m) => m.key === modelKey)

  const runLiveTest = async () => {
    setTesting(true)
    try {
      const r = await api<{ ok: boolean; status?: { state: string; lastError?: string } }>('/ward-api/ai/verify', { method: 'POST', body: {} })
      await refresh()
      if (r.ok) {
        pushToast({ tone: 'ok', title: `${meta.label} Verified LIVE` })
      } else {
        pushToast({ tone: 'info', title: `${meta.label} Standby`, detail: r.status?.lastError || 'Connect a Meta API key to enable live calls.' })
      }
    } catch (e) {
      pushToast({ tone: 'err', title: 'Model test failed', detail: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-well p-3.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div>
          <span className="font-semibold text-white">{meta.label}</span>{' '}
          <span className="font-mono text-[11px] text-slate-400">({meta.id})</span>
          <span className="ml-3 font-mono text-[11px] text-slate-500">
            Calls: {stats?.requests ?? 0} · Avg Latency: {stats?.avgLatencyMs ? `${stats.avgLatencyMs}ms` : '—'} · Tokens: {(stats?.totalTokens ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" loading={testing} onClick={runLiveTest}>
            <RefreshCw className="h-3 w-3" /> Test {meta.label}
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenKeys}>
            API Keys
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <div className="mt-2.5 rounded-lg border border-line bg-panel p-2.5 font-mono text-[11px] text-slate-300 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Chained Meta Workflow &amp; Real Prompt Contract</div>
        {modelKey === 'voice' && (
          <>
            <div><strong className="text-white">Input:</strong> 16kHz mono 16-bit PCM WAV (Bedside Mic or decoded video/audio track)</div>
            <div><strong className="text-white">Endpoint:</strong> POST https://api.meta.ai/v1/asr/transcribe (mode: PUSH_TO_TALK, languageBias: [English, French, Arabic])</div>
            <div><strong className="text-white">Output → Next Input:</strong> Raw patient transcript string piped directly into <code className="text-sky-300">muse-spark-1.3</code> (&lt;patient_speech&gt;)</div>
          </>
        )}
        {modelKey === 'sam' && (
          <>
            <div><strong className="text-white">Input:</strong> Live camera frame (input_image) or 3.5s MP4 slice (input_video) + class/spatial prompt</div>
            <div><strong className="text-white">Endpoint:</strong> POST https://api.meta.ai/v1/responses (model: sam-3.1, stream: true, mask_encoding: one_bit)</div>
            <div><strong className="text-white">Output → Next Input:</strong> Spatial bounding-box wire (&lt;0f&gt;1&lt;|box;...|&gt;) parsed into MovementFacts JSON &amp; piped into <code className="text-sky-300">muse-wonder-1.0</code> and <code className="text-sky-300">muse-spark-1.3</code></div>
          </>
        )}
        {modelKey === 'wonder' && (
          <>
            <div><strong className="text-white">Input:</strong> <code className="text-sky-300">sam-3.1</code> Telemetry JSON (&lt;telemetry&gt;) + room &lt;risk_note&gt; + video/frame media</div>
            <div><strong className="text-white">Endpoint:</strong> POST https://api.meta.ai/v1/responses (model: muse-wonder-1.0, system: ULEBI Movement Assessor)</div>
            <div><strong className="text-white">Output → Next Input:</strong> Visual posture &amp; agreement JSON piped directly into <code className="text-sky-300">muse-spark-1.3</code></div>
          </>
        )}
        {modelKey === 'spark' && (
          <>
            <div><strong className="text-white">Input:</strong> Outputs from <code className="text-sky-300">muse-voice-transcribe-1.0</code>, <code className="text-sky-300">sam-3.1</code> + <code className="text-sky-300">muse-wonder-1.0</code>, or Bedside Pad + room &lt;risk_note&gt;</div>
            <div><strong className="text-white">Endpoint:</strong> POST https://api.meta.ai/v1/chat/completions (model: muse-spark-1.3, STRICT JSON contract)</div>
            <div><strong className="text-white">Output:</strong> Final clinical triage verdict JSON (level, headline, reason, nurse_action) &amp; Master Shift Directive</div>
          </>
        )}
      </div>
      <div className="mt-2.5 space-y-1 font-mono text-[11px]">
        {logs.length === 0 ? (
          <div className="py-2 text-slate-500">No calls recorded for {meta.label} in this session yet.</div>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded px-2 py-1 hover:bg-white/[0.03]">
              <span className="truncate text-slate-300">
                <span className="text-slate-500">{clockTime(l.time)}</span> · {l.endpoint} {l.note ? `· ${l.note}` : ''}
              </span>
              <span className="text-slate-400">
                HTTP {l.status} · {l.latencyMs}ms
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function MergePanel() {
  const { snap, refresh, pushToast } = useWard()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const sum = snap?.masterSummary

  const run = async (effort = 'low') => {
    setBusy(true)
    setErr('')
    try {
      await api('/ward-api/triage', { body: { source: 'MERGE', reasoningEffort: effort } })
      await refresh()
      pushToast({ tone: 'ok', title: 'Shift Directive Synthesized' })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copyPlan = async () => {
    if (!sum) return
    const text = `[ULEBI Shift Directive · ${sum.overall_level.toUpperCase()}]\n${sum.ward_headline}\n${sum.priority_plan}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    pushToast({ tone: 'ok', title: 'Copied Shift Directive' })
  }

  const bullets = (sum?.priority_plan || '')
    .split(/(?=\d\))|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <Panel
      eyebrow="Shift Directive"
      title="Charge-Nurse Ward Action Plan"
      actions={
        <>
          {sum && (
            <>
              <Button size="sm" variant="secondary" onClick={() => void copyPlan()}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
              <Button size="sm" variant="secondary" loading={busy} onClick={() => void run('medium')}>
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
            </>
          )}
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void run('medium')} disabled={!snap?.rooms.length}>
            <Calendar className="h-3.5 w-3.5" /> Morning Handoff
          </Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void run('low')} disabled={!snap?.rooms.length}>
            <Sparkles className="h-3.5 w-3.5" /> Synthesize Shift
          </Button>
        </>
      }
    >
      {sum ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LevelBadge level={sum.overall_level} size="sm" />
              <h3 className="text-sm font-semibold text-white">{sum.ward_headline}</h3>
              <EngineTag engine={sum.engine || 'spark'} />
            </div>
            <span className="font-mono text-[11px] text-slate-500">{clockTime(sum.updatedAt)}</span>
          </div>
          <ul className="space-y-1.5 rounded-lg border border-line bg-well p-3 text-xs leading-relaxed text-slate-300">
            {bullets.map((b, idx) => (
              <li key={idx}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Add patient rooms and click <strong>Synthesize Shift</strong> to merge Vision, Voice, and Pad verdicts into a prioritized action plan.
        </p>
      )}
      <ErrorText>{err}</ErrorText>
    </Panel>
  )
}

function RoomCard({
  item,
  now,
  onEdit,
  onOpenSlot,
  onViewTimeline,
}: {
  item: BoardItem
  now: number
  onEdit: (room: RoomDTO) => void
  onOpenSlot: (room: RoomDTO, source: Source) => void
  onViewTimeline: (room: RoomDTO) => void
}) {
  const { rm, level, top, esc } = item
  const { refresh, pushToast, effectiveRole } = useWard()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmStable, setConfirmStable] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const act = async (key: string, fn: () => Promise<unknown>, toastMsg?: string) => {
    setBusy(key)
    setErr('')
    try {
      await fn()
      await refresh()
      if (toastMsg) pushToast({ tone: 'ok', title: toastMsg })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const s = LEVEL_STYLES[level]
  const canDelete = effectiveRole === 'admin' || effectiveRole === 'charge_nurse'

  return (
    <>
      <article className={cx('rounded-[12px] border bg-raised p-4 transition', s.ring)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={level} />
              <h3 className="text-sm font-semibold text-white">{rm.name}</h3>
              {esc && (
                <span className="flex items-center gap-1 rounded border border-line-strong bg-well px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  <BellRing className="h-3 w-3" /> {esc.status === 'AUTOMATED_EMERGENCY_ALARM' ? 'ALARM' : esc.assignedNurseName}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">{rm.clinicalContext || 'No clinical risk profile'}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={level === 'RED' ? 'critical' : 'primary'}
              loading={busy === 'call'}
              onClick={() =>
                act(
                  'call',
                  () => api('/ward-api/escalations', { body: { roomId: rm.id, level: level === 'RED' ? 'RED' : 'YELLOW' } }),
                  esc ? `Escalated call for ${rm.name}` : `Paged nurse for ${rm.name}`,
                )
              }
            >
              <UserRound className="h-3.5 w-3.5" /> {esc ? 'Escalate' : 'Call Nurse'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === 'clear' || level === 'STANDBY'}
              onClick={() => setConfirmStable(true)}
            >
              <Eraser className="h-3.5 w-3.5" /> Mark Stable
            </Button>

            <div className="relative">
              <Button size="sm" variant="ghost" aria-label={`Overflow menu for ${rm.name}`} onClick={() => setMenuOpen((o) => !o)}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-line bg-panel p-1 text-xs shadow-2xl"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit(rm)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-200 hover:bg-white/5"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-slate-400" /> Edit room
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onViewTimeline(rm)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-200 hover:bg-white/5"
                  >
                    <Clock className="h-3.5 w-3.5 text-slate-400" /> View timeline
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmDelete(true)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete room
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {top && (
          <div className="mt-3 rounded-lg border border-line bg-well p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cx('truncate text-xs font-semibold', LEVEL_STYLES[top.level].text)}>{top.headline}</span>
                <EngineTag engine={top.engine} failSafe={top.failSafe} />
              </div>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">{timeAgo(top.at, now)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-300">{top.nurseAction}</p>
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SOURCES.map(({ key, label, icon: Icon }) => {
            const ev = rm.latestBySource?.[key]
            const stale = Boolean(ev && rm.clearedAt && Date.parse(ev.at) <= Date.parse(rm.clearedAt))
            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpenSlot(rm, key)}
                className={cx(
                  'group rounded-lg border border-line bg-well/80 px-3 py-2 text-left transition hover:border-line-strong hover:bg-well',
                  stale && 'opacity-50',
                )}
              >
                <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium group-hover:text-white">
                    <Icon className="h-3.5 w-3.5 text-slate-400" /> {label}
                  </span>
                  {ev ? <span className={LEVEL_STYLES[ev.level].text}>{LEVEL_STYLES[ev.level].label}</span> : <span>Standby</span>}
                </div>
                <div className="mt-1 truncate text-xs text-slate-400">{ev ? ev.headline : 'No verdict yet'}</div>
              </button>
            )
          })}
        </div>
        <ErrorText>{err}</ErrorText>
      </article>

      <ConfirmModal
        open={confirmStable}
        onClose={() => setConfirmStable(false)}
        onConfirm={() => {
          setConfirmStable(false)
          void act('clear', () => api(`/ward-api/rooms/${encodeURIComponent(rm.id)}/clear`, { body: {} }), `${rm.name} marked Stable`)
        }}
        loading={busy === 'clear'}
        title={`Mark ${rm.name} Stable?`}
        description={`Reset ${rm.name}'s Vision, Voice, and Pad verdicts to Standby?`}
        confirmLabel="Mark Stable"
        variant="primary"
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          void act('delete', () => api(`/ward-api/rooms/${encodeURIComponent(rm.id)}`, { method: 'DELETE' }), `Deleted ${rm.name}`)
        }}
        loading={busy === 'delete'}
        title={`Delete ${rm.name}?`}
        description={`Permanently delete ${rm.name} and close any active escalation chain?`}
        confirmLabel="Delete Room"
        variant="danger"
      />
    </>
  )
}

function EscalationPanel({ now }: { now: number }) {
  const { snap, refresh, effectiveRole, pushToast } = useWard()
  const [err, setErr] = useState('')
  const active = (snap?.escalations || [])
    .filter((e) => e.active)
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''))
  const recent = (snap?.escalations || []).filter((e) => !e.active).slice(0, 4)

  const canChangeTimeout = effectiveRole === 'admin' || effectiveRole === 'charge_nurse'
  const canSkipNext = effectiveRole === 'admin' || effectiveRole === 'charge_nurse'

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    setErr('')
    try {
      await fn()
      await refresh()
      if (msg) pushToast({ tone: 'ok', title: msg })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <Panel
      eyebrow="Escalation Chain"
      title="Active Nurse Calls"
      actions={
        <select
          aria-label="Step Timeout"
          disabled={!canChangeTimeout}
          className="min-h-[30px] rounded-lg border border-line-strong bg-well px-2 py-1 font-mono text-[11px] text-slate-300 disabled:opacity-50"
          value={snap?.escalationTimeoutSec ?? 45}
          onChange={(e) =>
            run(
              () => api('/ward-api/settings', { body: { escalationTimeoutSec: Number(e.target.value) } }),
              `Step timeout set to ${e.target.value}s`,
            )
          }
        >
          {[15, 30, 45, 60, 90, 120].map((s) => (
            <option key={s} value={s}>
              {s}s timeout
            </option>
          ))}
        </select>
      }
      bodyClassName="space-y-2.5"
    >
      {active.length === 0 && (
        <div className="rounded-lg border border-line bg-well px-3 py-6 text-center text-xs text-slate-500">
          No active nurse calls.
        </div>
      )}
      {active.map((esc) => {
        const alarm = esc.status === 'AUTOMATED_EMERGENCY_ALARM'
        const terminal = alarm || esc.status === 'STATION_ATTENTION_REQUIRED'
        const secs = esc.deadline ? Math.max(0, Math.ceil((Date.parse(esc.deadline) - now) / 1000)) : 0
        const total = esc.timeoutSec || 45
        const qLen = esc.queue?.length || 0
        const stepNum = qLen ? Math.min((esc.queueIndex ?? 0) + 1, qLen) : 1
        return (
          <div key={esc.id} className={cx('rounded-xl border border-line bg-well p-3.5', alarm && 'border-rose-500/60')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LevelBadge level={esc.level} size="sm" />
                <span className="text-xs font-semibold text-white">{esc.roomName}</span>
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums text-slate-300">
                {terminal ? esc.status.replace(/_/g, ' ') : `${secs}s`}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-slate-400">{esc.headline}</div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate font-medium text-white">{esc.assignedNurseName}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">
                {qLen ? `${stepNum}/${qLen}` : 'No roster'}
              </span>
            </div>
            {!terminal && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cx('h-full rounded-full transition-[width] duration-1000 ease-linear', esc.level === 'RED' ? 'bg-crit' : 'bg-warn')}
                  style={{ width: `${Math.min(100, (secs / total) * 100)}%` }}
                />
              </div>
            )}
            <div className="mt-3 flex gap-1.5">
              <Button
                size="sm"
                variant={alarm ? 'critical' : 'primary'}
                className="flex-1"
                onClick={() =>
                  run(
                    () => api(`/ward-api/escalations/${encodeURIComponent(esc.id)}`, { body: { action: 'ack' } }),
                    `Acknowledged call for ${esc.roomName}`,
                  )
                }
              >
                <Check className="h-3.5 w-3.5" /> Acknowledge
              </Button>
              {canSkipNext && !terminal && qLen > 1 && (esc.queueIndex ?? 0) < qLen - 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    run(
                      () => api(`/ward-api/escalations/${encodeURIComponent(esc.id)}`, { body: { action: 'next' } }),
                      `Paged next nurse for ${esc.roomName}`,
                    )
                  }
                >
                  <ChevronsRight className="h-3.5 w-3.5" /> Next
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {recent.length > 0 && (
        <div className="space-y-1 border-t border-line pt-2.5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Recently Acknowledged</div>
          {recent.map((e) => (
            <div key={e.id} className="flex justify-between gap-2 text-[11px] text-slate-400">
              <span className="truncate">{e.roomName}</span>
              <span className="shrink-0 font-mono text-[10px]">
                {e.acknowledgedBy} · {timeAgo(e.acknowledgedAt, now)}
              </span>
            </div>
          ))}
        </div>
      )}
      <ErrorText>{err}</ErrorText>
    </Panel>
  )
}

function RosterPanel() {
  const { snap, refresh, effectiveRole, pushToast } = useWard()
  const [name, setName] = useState('')
  const [role, setRole] = useState('Ward RN')
  const [err, setErr] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const nurses = snap?.nurses || []
  const canManageRoster = effectiveRole === 'admin' || effectiveRole === 'charge_nurse'

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    setErr('')
    try {
      await fn()
      await refresh()
      if (msg) pushToast({ tone: 'ok', title: msg })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const a = nurses[i]
    const b = nurses[i + dir]
    if (!a || !b) return
    void run(async () => {
      const order = nurses.map((n) => n.id)
      ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
      await Promise.all(order.map((id, idx) => api(`/ward-api/nurses/${encodeURIComponent(id)}`, { method: 'PATCH', body: { callOrder: idx + 1 } })))
    }, `Updated call priority for ${a.name}`)
  }

  return (
    <>
      <Panel id="shift-roster" eyebrow="Shift Roster" title="Nurse Call Order" bodyClassName="space-y-2">
        {nurses.length === 0 && (
          <div className="rounded-lg border border-line bg-well px-3 py-6 text-center text-xs text-slate-500">
            No nurses added to the shift roster yet.
          </div>
        )}
        {nurses.map((n, i) => (
          <div
            key={n.id}
            className={cx('flex items-center gap-2 rounded-lg border border-line bg-well px-2.5 py-2 text-xs', n.onDuty === false && 'opacity-50')}
          >
            <span className="w-5 font-mono text-[11px] text-slate-500">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-white">{n.name}</div>
              <div className="truncate text-[10px] text-slate-500">{n.role}</div>
            </div>
            <button
              type="button"
              onClick={() =>
                run(
                  () => api(`/ward-api/nurses/${encodeURIComponent(n.id)}`, { method: 'PATCH', body: { onDuty: n.onDuty === false } }),
                  `${n.name} marked ${n.onDuty === false ? 'On duty' : 'Off'}`,
                )
              }
              className={cx(
                'min-h-[26px] rounded border px-2 py-0.5 font-mono text-[10px] transition',
                n.onDuty === false ? 'border-line text-slate-500' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
              )}
            >
              {n.onDuty === false ? 'Off' : 'On duty'}
            </button>
            {canManageRoster && (
              <>
                <button
                  type="button"
                  aria-label={`Move ${n.name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="p-1 text-slate-500 hover:text-white disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${n.name} down`}
                  disabled={i === nurses.length - 1}
                  onClick={() => move(i, 1)}
                  className="p-1 text-slate-500 hover:text-white disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${n.name}`}
                  onClick={() => setConfirmRemove({ id: n.id, name: n.name })}
                  className="p-1 text-slate-500 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}

        {canManageRoster && (
          <form
            className="flex flex-wrap gap-1.5 pt-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              void run(async () => {
                await api('/ward-api/nurses', { body: { name, role } })
                setName('')
              }, `Added ${name} to Shift Roster`)
            }}
          >
            <input
              className={cx(inputCls, 'min-w-[120px] flex-1 py-1 text-xs')}
              placeholder="+ Add nurse name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={cx(inputCls, 'w-24 py-1 text-xs')}
              placeholder="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <Button type="submit" size="sm" variant="primary">
              Save
            </Button>
          </form>
        )}
        <ErrorText>{err}</ErrorText>
      </Panel>

      <ConfirmModal
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (!confirmRemove) return
          const target = confirmRemove
          setConfirmRemove(null)
          void run(() => api(`/ward-api/nurses/${encodeURIComponent(target.id)}`, { method: 'DELETE' }), `Removed ${target.name}`)
        }}
        title={`Remove ${confirmRemove?.name || 'Nurse'}?`}
        description="This nurse will be removed from the shift call chain."
        confirmLabel="Remove"
        variant="danger"
      />
    </>
  )
}

/** Snowflake Reference 1 style Recent Verdicts table */
function RecentVerdictsPanel({
  now,
  onOpenAudit,
  onJumpTimeline,
}: {
  now: number
  onOpenAudit: () => void
  onJumpTimeline: (iso: string) => void
}) {
  const { snap } = useWard()
  const [tab, setTab] = useState<VerdictTab>('ALL')
  const [sortField, setSortField] = useState<SortField>('time')
  const [sortAsc, setSortAsc] = useState(false)

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortAsc((a) => !a)
    else {
      setSortField(f)
      setSortAsc(false)
    }
  }

  const events = useMemo(() => {
    const raw = (snap?.events || []).filter((e) => (tab === 'ALL' ? true : e.source === tab))
    return [...raw].sort((a, b) => {
      let cmp = 0
      if (sortField === 'time') cmp = Date.parse(a.createdAt) - Date.parse(b.createdAt)
      else if (sortField === 'room') cmp = (a.roomName || '').localeCompare(b.roomName || '')
      else if (sortField === 'source') cmp = a.source.localeCompare(b.source)
      else if (sortField === 'level') cmp = (LEVEL_RANK[a.level] || 0) - (LEVEL_RANK[b.level] || 0)
      else if (sortField === 'latency') cmp = (a.latencyMs || 0) - (b.latencyMs || 0)
      return sortAsc ? cmp : -cmp
    })
  }, [snap?.events, tab, sortField, sortAsc])

  return (
    <section className="rounded-[12px] border border-line bg-panel">
      <div className="border-b border-line px-4 pt-3.5">
        <h3 className="text-sm font-semibold text-white">Recent verdicts</h3>
        {/* Snowflake Reference 1 underline tabs */}
        <div className="mt-2 flex gap-5 text-xs" role="tablist">
          {(
            [
              ['ALL', 'All verdicts'],
              ['SAM', 'Vision'],
              ['VOICE', 'Voice'],
              ['TASK', 'Pad'],
            ] as [VerdictTab, string][]
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(
                'border-b-2 pb-2.5 font-medium transition',
                tab === k ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200',
              )}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {events.length === 0 ? (
          <Empty title="You don't have any verdicts yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[11px] font-medium text-slate-400">
                  <th className="py-2 pr-3">
                    <button type="button" onClick={() => toggleSort('room')} className="inline-flex items-center gap-1 hover:text-white">
                      Room <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort('source')} className="inline-flex items-center gap-1 hover:text-white">
                      Module <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2">Verdict</th>
                  <th className="px-3 py-2">
                    <button type="button" onClick={() => toggleSort('level')} className="inline-flex items-center gap-1 hover:text-white">
                      Urgency <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button type="button" onClick={() => toggleSort('latency')} className="inline-flex items-center gap-1 hover:text-white">
                      Latency <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-2 pl-3 text-right">
                    <button type="button" onClick={() => toggleSort('time')} className="inline-flex items-center gap-1 hover:text-white">
                      Updated <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {events.map((e) => {
                  const Icon = e.source === 'SAM' ? Video : e.source === 'VOICE' ? Mic : Tablet
                  return (
                    <tr
                      key={e.id}
                      onClick={() => onJumpTimeline(e.createdAt)}
                      className="cursor-pointer transition hover:bg-white/[0.03]"
                    >
                      <td className="py-2.5 pr-3 font-medium text-white">
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-slate-500" />
                          {e.roomName || 'Ward'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {e.source === 'SAM' ? 'Vision' : e.source === 'TASK' ? 'Pad' : 'Voice'}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2.5 text-slate-300">{e.headline}</td>
                      <td className="px-3 py-2.5">
                        <LevelBadge level={e.level} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-slate-400">
                        {e.latencyMs ? `${e.latencyMs}ms` : '0ms'}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono text-[11px] text-slate-400">
                        {timeAgo(e.createdAt, now)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
          <button type="button" onClick={onOpenAudit} className="text-slate-400 hover:text-white">
            Station action log ({snap?.auditLogs?.length || 0}) →
          </button>
          <Link href="/admin/collections/ward-events" className="text-slate-400 hover:text-white">
            Full audit log in Payload admin →
          </Link>
        </div>
      </div>
    </section>
  )
}

function CallNursePickerModal({ open, onClose, rooms }: { open: boolean; onClose: () => void; rooms: RoomDTO[] }) {
  const { refresh, pushToast } = useWard()
  const [roomId, setRoomId] = useState('')
  const [level, setLevel] = useState<'RED' | 'YELLOW'>('YELLOW')
  const [headline, setHeadline] = useState('')
  const [busy, setBusy] = useState(false)

  const dispatch = async () => {
    const targetId = roomId || rooms[0]?.id
    if (!targetId) return
    setBusy(true)
    try {
      await api('/ward-api/escalations', {
        body: {
          roomId: targetId,
          level,
          headline: headline.trim() || undefined,
        },
      })
      await refresh()
      pushToast({ tone: 'ok', title: 'Nurse Call Dispatched' })
      onClose()
    } catch (e) {
      pushToast({ tone: 'err', title: 'Dispatch failed', detail: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Call Nurse"
      description="Page the next on-duty nurse in call order."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={level === 'RED' ? 'critical' : 'primary'} loading={busy} onClick={dispatch} disabled={!rooms.length}>
            <PhoneCall className="h-3.5 w-3.5" /> Call Nurse
          </Button>
        </>
      }
    >
      {rooms.length === 0 ? (
        <p className="text-xs text-slate-400">Add a patient room first before dispatching a nurse call.</p>
      ) : (
        <div className="space-y-3">
          <Field label="Room">
            <select className={inputCls} value={roomId || rooms[0]?.id || ''} onChange={(e) => setRoomId(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Urgency">
            <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value as 'RED' | 'YELLOW')}>
              <option value="YELLOW">Caution · Yellow</option>
              <option value="RED">Critical · Red</option>
            </select>
          </Field>
          <Field label="Headline (optional)">
            <input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  )
}

function ModuleSlotDetailModal({ slot, onClose }: { slot: { room: RoomDTO; source: Source } | null; onClose: () => void }) {
  const router = useRouter()
  if (!slot) return null
  const { room, source } = slot
  const ev = room.latestBySource?.[source]
  const label = source === 'SAM' ? 'Vision Tracking' : source === 'VOICE' ? 'Bedside Voice' : 'Bedside Pad'
  const route = source === 'SAM' ? '/vision' : source === 'VOICE' ? '/voice' : '/tasks'
  const storageKey = source === 'SAM' ? 'wardni_vision_room' : source === 'VOICE' ? 'wardni_voice_room' : 'wardni_tasks_room'

  return (
    <Modal
      open={Boolean(slot)}
      onClose={onClose}
      title={`${room.name} · ${label}`}
      description={room.clinicalContext || 'General inpatient care'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              localStorage.setItem(storageKey, room.id)
              onClose()
              router.push(route)
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open {label}
          </Button>
        </>
      }
    >
      {ev ? (
        <div className="space-y-2.5 rounded-xl border border-line bg-well p-4">
          <div className="flex items-center justify-between">
            <LevelBadge level={ev.level} />
            <span className="font-mono text-[11px] text-slate-400">{clockTime(ev.at)}</span>
          </div>
          <div className="font-semibold text-white">{ev.headline}</div>
          {ev.reason && <p className="text-xs text-slate-400">{ev.reason}</p>}
          <div className="pt-1 text-xs font-medium text-white">{ev.nurseAction}</div>
        </div>
      ) : (
        <Empty title="No verdict recorded for this module yet." />
      )}
    </Modal>
  )
}

function FullAuditLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap } = useWard()
  const logs = snap?.auditLogs || []
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Audit Log"
      description="Every action and state change logged with a second-resolution timestamp."
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      {logs.length === 0 ? (
        <Empty title="No actions logged in this session yet." />
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-xl border border-line bg-well">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase text-slate-400">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{clockTime(a.at)}</td>
                  <td className="px-3 py-2 font-medium text-white">{a.actorName}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{a.action}</td>
                  <td className="px-3 py-2 text-white">{a.target}</td>
                  <td className="px-3 py-2 text-slate-400">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-32 animate-pulse rounded-[12px] border border-line bg-panel" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[12px] border border-line bg-panel" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-[12px] border border-line bg-panel" />
    </div>
  )
}
