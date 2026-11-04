'use client'

import { useEffect, useState } from 'react'
import { BellRing, CheckCircle2, ChevronsRight, Copy, ExternalLink, PhoneCall, RotateCw, ShieldCheck } from 'lucide-react'
import { BedsidePad } from '@/components/wardni/BedsidePad'
import { api } from '@/components/wardni/client'
import { RoomFormModal } from '@/components/wardni/RoomFormModal'
import { RoomTabs, useActiveRoom } from '@/components/wardni/RoomTabs'
import { useNow, useWard } from '@/components/wardni/WardProvider'
import { Button, ConfirmModal, Empty, EngineTag, ErrorText, LevelBadge, Panel, timeAgo } from '@/components/wardni/ui'

export function TasksView() {
  const { snap, effectiveRole, pushToast, refresh } = useWard()
  const { room, select } = useActiveRoom(snap?.rooms, 'wardni_tasks_room')
  const [addOpen, setAddOpen] = useState(false)
  const [pad, setPad] = useState<{ padKey: string; path: string } | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [busyRotate, setBusyRotate] = useState(false)
  const [busyEsc, setBusyEsc] = useState(false)
  const now = useNow(1000)

  useEffect(() => {
    setPad(null)
    setErr('')
    if (!room) return
    api<{ padKey: string; path: string }>(`/ward-api/rooms/${encodeURIComponent(room.id)}/pad`)
      .then(setPad)
      .catch((e) => setErr(e.message))
  }, [room?.id])

  if (!snap) return <div className="h-96 animate-pulse rounded-2xl border border-line bg-panel" />
  const url = pad && typeof window !== 'undefined' ? `${window.location.origin}${pad.path}` : ''
  const events = snap.events.filter((e) => e.source === 'TASK' && e.room === room?.id).slice(0, 8)
  const activeEsc = snap.escalations.find((e) => e.room === room?.id && e.active)
  const lastAck = snap.escalations.find((e) => e.room === room?.id && !e.active && e.acknowledgedBy)

  const rotate = async () => {
    if (!room) return
    setBusyRotate(true)
    try {
      setPad(await api(`/ward-api/rooms/${encodeURIComponent(room.id)}/pad`, { body: {} }))
      setConfirmRotate(false)
      pushToast({ tone: 'ok', title: 'Rotated bedside pad link', detail: `Generated new secret key for ${room.name}.` })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyRotate(false)
    }
  }

  const handleEscAction = async (action: 'acknowledge' | 'advance') => {
    if (!activeEsc) return
    setBusyEsc(true)
    try {
      await api(`/ward-api/escalations/${encodeURIComponent(activeEsc.id)}`, {
        method: 'POST',
        body: { action: action === 'acknowledge' ? 'ack' : 'next' },
      })
      await refresh()
      pushToast({
        tone: 'ok',
        title: action === 'acknowledge' ? 'Nurse call acknowledged' : 'Escalated to next nurse',
        detail:
          action === 'acknowledge'
            ? `Patient screen in ${room?.name} updated: Nurse on the way.`
            : `Paged next on-duty nurse for ${room?.name}.`,
      })
    } catch (e) {
      pushToast({ tone: 'err', title: 'Action failed', detail: (e as Error).message })
    } finally {
      setBusyEsc(false)
    }
  }

  return (
    <div className="space-y-4">
      <RoomTabs rooms={snap.rooms} activeId={room?.id} onSelect={select} onAdd={() => setAddOpen(true)} source="TASK" />
      {!room ? (
        <Empty
          title="Patient Bedside Screen ↔ Nurse & Admin Auto-Dispatch"
          action={
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Add a room
            </Button>
          }
        >
          Each room gets a dedicated bedside screen with 6 default clinical task buttons (Emergency Help, Bathroom Assist, Pain / Comfort, Water, Drink, Eat). Pressing any button automatically logs the request on the dashboard and pages the on-duty nurse with what the patient needs.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <Panel
              eyebrow="Patient Bedside Screen · Two-Way Nurse & Admin Link"
              title={`${room.name} — Patient Tablet (Press any button to auto-page nurse)`}
              bodyClassName="p-5"
            >
              {pad ? <BedsidePad key={pad.padKey} roomId={room.id} padKey={pad.padKey} /> : <div className="h-80 animate-pulse rounded-2xl bg-raised" />}
            </Panel>
          </div>
          <div className="space-y-5 xl:col-span-4">
            <Panel eyebrow="Live Nurse & Admin Dispatch Status" title="Active Nurse Pager Link">
              {activeEsc ? (
                <div className="space-y-3 rounded-xl border border-rose-500/50 bg-rose-500/10 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-rose-300">
                      <BellRing className="h-4 w-4 animate-bounce text-rose-400" /> PAGING NURSE NOW
                    </span>
                    <LevelBadge level={activeEsc.level} size="sm" />
                  </div>
                  <div className="text-xs font-semibold text-white">{activeEsc.headline}</div>
                  <div className="rounded-lg border border-line bg-well p-2.5 font-mono text-[11px] text-slate-300">
                    <div>
                      Assigned Nurse: <strong className="text-white">{activeEsc.assignedNurseName || 'All On-Duty Nurses'}</strong>
                    </div>
                    <div className="mt-0.5 text-slate-400">
                      Step {(activeEsc.queueIndex ?? 0) + 1}/{Math.max(1, activeEsc.queue?.length || 1)} · Auto-advances on timeout
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" loading={busyEsc} onClick={() => void handleEscAction('acknowledge')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge &amp; Notify Patient
                    </Button>
                    <Button size="sm" variant="secondary" loading={busyEsc} onClick={() => void handleEscAction('advance')}>
                      <ChevronsRight className="h-3.5 w-3.5" /> Page Next Nurse
                    </Button>
                  </div>
                </div>
              ) : lastAck ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Acknowledged by {lastAck.acknowledgedBy}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-300">
                    Patient tablet currently displays that {lastAck.acknowledgedBy} is on the way.
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-well p-3.5 text-xs text-slate-400">
                  <div className="flex items-center gap-2 font-semibold text-slate-200">
                    <PhoneCall className="h-3.5 w-3.5 text-emerald-400" /> Ready — Auto-Dispatch Armed
                  </div>
                  <p className="mt-1 leading-relaxed">
                    When the patient presses any button on the left screen, ULEBI immediately creates a nurse call for <strong className="text-white">{room.name}</strong> and pages the first on-duty nurse with their exact request.
                  </p>
                </div>
              )}
            </Panel>

            <Panel eyebrow="Bedside tablet link" title="Open on the room's tablet">
              <p className="text-xs leading-relaxed text-slate-400">
                This private link opens the patient pad without a staff login, so it keeps working through server restarts and shift changes. Treat it like a room key.
              </p>
              <div className="mt-3 truncate rounded-lg border border-line bg-well px-3 py-2 font-mono text-[11px] text-slate-300">{url || 'Loading…'}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!url}
                  onClick={async () => {
                    await navigator.clipboard.writeText(url).catch(() => undefined)
                    setCopied(true)
                    pushToast({ tone: 'ok', title: 'Copied bedside pad URL' })
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}
                </Button>
                <a
                  href={pad?.path || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-xs text-slate-200 hover:border-accent/40"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open kiosk
                </a>
                {effectiveRole === 'admin' && (
                  <Button size="sm" variant="danger" onClick={() => setConfirmRotate(true)}>
                    <RotateCw className="h-3.5 w-3.5" /> Rotate link
                  </Button>
                )}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-raised p-2.5 text-[11px] text-slate-400">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> The link can only send this room&apos;s bedside requests — it cannot read the ward board.
              </div>
              <ErrorText>{err}</ErrorText>
            </Panel>

            <Panel eyebrow="Pad → Nurse Dispatch History" title="Recent Patient Button Presses" bodyClassName="space-y-2">
              {events.length === 0 && <div className="font-mono text-[11px] text-slate-500">No requests from this room yet.</div>}
              {events.map((e) => (
                <div key={e.id} className="rounded-lg border border-line bg-well px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <LevelBadge level={e.level} size="sm" />
                      <EngineTag engine={e.engine} failSafe={e.failSafe} />
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">{timeAgo(e.createdAt, now)}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-white">{e.headline}</div>
                  <div className="text-[11px] text-slate-400">{e.nurseAction}</div>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      )}
      <RoomFormModal open={addOpen} onClose={() => setAddOpen(false)} withCamera={false} onSaved={(r) => select(r.id)} />
      <ConfirmModal
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        onConfirm={() => void rotate()}
        loading={busyRotate}
        title="Rotate Bedside Pad Link?"
        description="Rotating the link invalidates the existing capability key. The bedside tablet in this room will need to open the new link."
        confirmLabel="Rotate Link"
        variant="danger"
      />
    </div>
  )
}
