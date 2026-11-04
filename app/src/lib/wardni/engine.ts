import crypto from 'node:crypto'
import type { Payload } from 'payload'
import { getPayloadClient } from '@/lib/payload'
import type { AppUser } from '@/lib/app-auth'
import { computeUsageSummary, DEFAULT_PRICING_PER_1K } from './analytics'
import { apiLogs, getApiStatus } from './meta'
import type {
  AccessRequestDTO,
  AuditEntry,
  EscalationDTO,
  EscalationStatus,
  EventSummary,
  Engine,
  Level,
  MasterSummary,
  ModelKey,
  NurseDTO,
  RoomDTO,
  Source,
  StaffRole,
  WardEventDTO,
  WardSnapshot,
} from './types'
import { LEVEL_RANK } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Id = string | number
type RoomDoc = RoomDTO & { id: Id; padKey?: string | null; camToken?: string | null }

// ---------- small utilities ----------

const g = globalThis as unknown as {
  __wardniLocks?: Map<string, Promise<unknown>>
  __wardniAdvanceAt?: number
  __wardniAudit?: AuditEntry[]
  __wardniAccessReqs?: AccessRequestDTO[]
  __wardniConfig?: {
    budgetLimitUsd: number
    budgetAlertThresholdPct: number
    idleLockMinutes: number
    pricing: Record<ModelKey, number>
  }
}

/** Serializes work per key inside this process (escalation chains are per-room). */
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (g.__wardniLocks ||= new Map())
  const prev = locks.get(key) || Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  locks.set(key, next)
  next.finally(() => {
    if (locks.get(key) === next) locks.delete(key)
  })
  return next
}

export const newPadKey = () => crypto.randomBytes(24).toString('base64url')

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a || '')
  const y = Buffer.from(b || '')
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

const ACTIVE_TIMED: EscalationStatus[] = ['INVITED', 'ESCALATED_NEXT_NURSE', 'UNASSIGNED_ALERT']

function pushHistory(history: unknown, entry: Record<string, unknown>) {
  const list = Array.isArray(history) ? history : []
  return [...list, { at: new Date().toISOString(), ...entry }].slice(-40)
}

export function getRuntimeConfig() {
  if (!g.__wardniConfig) {
    g.__wardniConfig = {
      budgetLimitUsd: 250,
      budgetAlertThresholdPct: 80,
      idleLockMinutes: 30,
      pricing: { ...DEFAULT_PRICING_PER_1K },
    }
  }
  return g.__wardniConfig
}

export function getAuditLogs(limit = 100): AuditEntry[] {
  return (g.__wardniAudit ||= []).slice(0, limit)
}

export function recordAudit(entry: Omit<AuditEntry, 'id' | 'at'> & { at?: string }): AuditEntry {
  const list = (g.__wardniAudit ||= [])
  const item: AuditEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: entry.at || new Date().toISOString(),
    ...entry,
  }
  list.unshift(item)
  if (list.length > 300) list.length = 300
  return item
}

export function getAccessRequests(): AccessRequestDTO[] {
  return (g.__wardniAccessReqs ||= [])
}

export function addAccessRequest(req: Omit<AccessRequestDTO, 'id' | 'requestedAt'>): AccessRequestDTO {
  const list = (g.__wardniAccessReqs ||= [])
  const existingIdx = list.findIndex((r) => r.email.toLowerCase() === req.email.toLowerCase() && r.type === req.type)
  const item: AccessRequestDTO = {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    requestedAt: new Date().toISOString(),
    ...req,
  }
  if (existingIdx >= 0) list[existingIdx] = item
  else list.unshift(item)
  return item
}

export function removeAccessRequest(id: string) {
  const list = (g.__wardniAccessReqs ||= [])
  const idx = list.findIndex((r) => r.id === id)
  if (idx >= 0) list.splice(idx, 1)
}

export async function getSettings(payload: Payload) {
  const s = (await payload.findGlobal({ slug: 'ward-settings', overrideAccess: true, depth: 0 })) as any
  const rawMaster = s?.masterSummary as Record<string, any> | null
  const cfg = getRuntimeConfig()
  if (rawMaster?.__config) {
    if (Number.isFinite(rawMaster.__config.budgetLimitUsd)) cfg.budgetLimitUsd = Number(rawMaster.__config.budgetLimitUsd)
    if (Number.isFinite(rawMaster.__config.budgetAlertThresholdPct)) cfg.budgetAlertThresholdPct = Number(rawMaster.__config.budgetAlertThresholdPct)
    if (Number.isFinite(rawMaster.__config.idleLockMinutes)) cfg.idleLockMinutes = Number(rawMaster.__config.idleLockMinutes)
    if (rawMaster.__config.pricing) cfg.pricing = { ...DEFAULT_PRICING_PER_1K, ...rawMaster.__config.pricing }
  }
  if (Array.isArray(rawMaster?.__audit) && (!g.__wardniAudit || g.__wardniAudit.length === 0)) {
    g.__wardniAudit = rawMaster.__audit
  }
  if (Array.isArray(rawMaster?.__accessRequests) && (!g.__wardniAccessReqs || g.__wardniAccessReqs.length === 0)) {
    g.__wardniAccessReqs = rawMaster.__accessRequests
  }
  const cleanSummary: MasterSummary | null =
    rawMaster && rawMaster.ward_headline
      ? {
          overall_level: rawMaster.overall_level || 'routine',
          ward_headline: rawMaster.ward_headline,
          priority_plan: rawMaster.priority_plan || '',
          updatedAt: rawMaster.updatedAt || new Date().toISOString(),
          engine: rawMaster.engine || 'spark',
        }
      : null

  return {
    escalationTimeoutSec: Math.max(15, Math.min(300, Number(s?.escalationTimeoutSec) || 45)),
    masterSummary: cleanSummary,
    rawMaster: rawMaster || {},
  }
}

export async function persistExtendedSettings(payload: Payload, patch: { masterSummary?: MasterSummary | null }) {
  const cur = await getSettings(payload)
  const cfg = getRuntimeConfig()
  const nextMaster: Record<string, unknown> = {
    ...(cur.rawMaster || {}),
    ...(patch.masterSummary !== undefined ? (patch.masterSummary || {}) : cur.masterSummary || {}),
    __config: cfg,
    __audit: getAuditLogs(80),
    __accessRequests: getAccessRequests(),
  }
  await payload.updateGlobal({
    slug: 'ward-settings',
    data: { masterSummary: nextMaster as any },
    overrideAccess: true,
  })
}

export async function findRoom(payload: Payload, id: string): Promise<RoomDoc | null> {
  try {
    return (await payload.findByID({ collection: 'rooms', id, overrideAccess: true, depth: 0 })) as unknown as RoomDoc
  } catch {
    return null
  }
}

// ---------- escalation chain ----------

type RaiseInput = { room: RoomDoc; level: 'RED' | 'YELLOW'; source: string; headline: string; nurseAction: string }

export async function raiseEscalation(payload: Payload, input: RaiseInput) {
  const roomId = String(input.room.id)
  return withLock(`esc:${roomId}`, async () => {
    const existing = (
      await payload.find({
        collection: 'escalations',
        where: { and: [{ room: { equals: input.room.id } }, { active: { equals: true } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        sort: '-createdAt',
      })
    ).docs[0] as any

    if (existing) {
      const upgrade = LEVEL_RANK[input.level] > LEVEL_RANK[existing.level]
      const data: Record<string, unknown> = {
        repeatCount: (Number(existing.repeatCount) || 0) + 1,
        history: pushHistory(existing.history, { type: upgrade ? 'upgraded' : 'repeat', level: input.level, source: input.source, headline: input.headline }),
      }
      if (upgrade) {
        Object.assign(data, { level: input.level, headline: input.headline, nurseAction: input.nurseAction, source: input.source })
        if (input.level === 'RED' && (existing.status === 'STATION_ATTENTION_REQUIRED' || existing.status === 'UNASSIGNED_ALERT')) {
          Object.assign(data, { status: 'AUTOMATED_EMERGENCY_ALARM', assignedNurseName: 'Automated ward emergency alarm' })
        }
      }
      return payload.update({ collection: 'escalations', id: existing.id, data, overrideAccess: true, depth: 0 })
    }

    const { escalationTimeoutSec } = await getSettings(payload)
    const roster = (
      await payload.find({ collection: 'nurses', where: { onDuty: { equals: true } }, sort: 'callOrder', limit: 50, depth: 0, overrideAccess: true })
    ).docs as any[]
    const queue = roster.map((n) => ({ id: String(n.id), name: String(n.name) }))
    const now = Date.now()
    let status: EscalationStatus
    let assigned: string
    if (queue.length) {
      status = 'INVITED'
      assigned = queue[0].name
    } else if (input.level === 'RED') {
      status = 'AUTOMATED_EMERGENCY_ALARM'
      assigned = 'Automated ward emergency alarm'
    } else {
      status = 'UNASSIGNED_ALERT'
      assigned = 'Unassigned — station alert'
    }
    return payload.create({
      collection: 'escalations',
      overrideAccess: true,
      depth: 0,
      data: {
        room: input.room.id as any,
        roomName: input.room.name,
        active: true,
        level: input.level,
        status,
        source: input.source,
        headline: input.headline.slice(0, 160),
        nurseAction: input.nurseAction.slice(0, 300),
        queue,
        queueIndex: queue.length ? 0 : -1,
        assignedNurseName: assigned,
        attempt: 1,
        timeoutSec: escalationTimeoutSec,
        deadline: new Date(now + escalationTimeoutSec * 1000).toISOString(),
        repeatCount: 0,
        history: pushHistory([], { type: 'created', status, assigned, level: input.level, source: input.source }),
      } as any,
    })
  })
}

export async function advanceOverdueEscalations(payload: Payload, force = false) {
  const now = Date.now()
  if (!force && g.__wardniAdvanceAt && now - g.__wardniAdvanceAt < 1000) return
  g.__wardniAdvanceAt = now
  const due = (
    await payload.find({
      collection: 'escalations',
      where: { and: [{ active: { equals: true } }, { status: { in: ACTIVE_TIMED } }, { deadline: { less_than_equal: new Date(now).toISOString() } }] },
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as any[]

  for (const esc of due) {
    await withLock(`esc:${String(esc.room)}`, async () => {
      const queue: { id: string; name: string }[] = Array.isArray(esc.queue) ? esc.queue : []
      const timeoutMs = (Number(esc.timeoutSec) || 45) * 1000
      let idx = Number.isFinite(esc.queueIndex) ? Number(esc.queueIndex) : -1
      let deadline = Date.parse(esc.deadline)
      let attempt = Number(esc.attempt) || 1
      let status: EscalationStatus = esc.status
      let assigned: string = esc.assignedNurseName
      let history = esc.history
      while (deadline <= now && ACTIVE_TIMED.includes(status)) {
        idx += 1
        if (status !== 'UNASSIGNED_ALERT' && idx < queue.length) {
          status = 'ESCALATED_NEXT_NURSE'
          assigned = queue[idx].name
          attempt += 1
          deadline += timeoutMs
          history = pushHistory(history, { type: 'timeout_next_nurse', assigned })
        } else {
          status = esc.level === 'RED' ? 'AUTOMATED_EMERGENCY_ALARM' : 'STATION_ATTENTION_REQUIRED'
          assigned = esc.level === 'RED' ? 'Automated ward emergency alarm' : 'Charge nurse — station attention'
          attempt += 1
          history = pushHistory(history, { type: 'roster_exhausted', status })
        }
      }
      await payload.update({
        collection: 'escalations',
        where: { and: [{ id: { equals: esc.id } }, { attempt: { equals: esc.attempt } }, { active: { equals: true } }] },
        data: { status, assignedNurseName: assigned, attempt, queueIndex: idx, deadline: new Date(deadline).toISOString(), history } as any,
        overrideAccess: true,
        depth: 0,
      })
    })
  }
}

export async function acknowledgeEscalation(payload: Payload, id: string, by: string, actor?: { id: string; role: StaffRole }) {
  const esc = (await payload.findByID({ collection: 'escalations', id, overrideAccess: true, depth: 0 })) as any
  if (!esc?.active) return esc
  const updated = await withLock(`esc:${String(esc.room)}`, () =>
    payload.update({
      collection: 'escalations',
      id: esc.id,
      overrideAccess: true,
      depth: 0,
      data: {
        active: false,
        status: 'ACKNOWLEDGED',
        acknowledgedBy: by,
        acknowledgedAt: new Date().toISOString(),
        history: pushHistory(esc.history, { type: 'acknowledged', by }),
      } as any,
    }),
  )
  recordAudit({
    actorId: actor?.id || 'staff',
    actorName: by,
    actorRole: actor?.role || 'nurse',
    action: 'ACKNOWLEDGE_CALL',
    target: esc.roomName || String(esc.room),
    detail: `Acknowledged ${esc.level} escalation (${esc.headline || 'nurse call'})`,
    level: esc.level,
  })
  return updated
}

export async function skipToNextNurse(payload: Payload, id: string, by: string, actor?: { id: string; role: StaffRole }) {
  const esc = (await payload.findByID({ collection: 'escalations', id, overrideAccess: true, depth: 0 })) as any
  if (!esc?.active || !ACTIVE_TIMED.includes(esc.status)) return esc
  await payload.update({
    collection: 'escalations',
    id: esc.id,
    overrideAccess: true,
    data: { deadline: new Date(Date.now() - 1).toISOString(), history: pushHistory(esc.history, { type: 'skipped', by }) } as any,
  })
  await advanceOverdueEscalations(payload, true)
  recordAudit({
    actorId: actor?.id || 'staff',
    actorName: by,
    actorRole: actor?.role || 'charge_nurse',
    action: 'NEXT_NURSE_SKIP',
    target: esc.roomName || String(esc.room),
    detail: `Advanced escalation queue to next on-duty nurse`,
    level: esc.level,
  })
}

// ---------- ward events ----------

export type EventInput = {
  room: RoomDoc
  source: Source
  level: Level
  engine: Engine
  failSafe?: boolean
  headline: string
  reason: string
  nurseAction: string
  detail?: string
  latencyMs?: number
  tokens?: string
}

function summarize(ev: any): EventSummary {
  return {
    id: String(ev.id),
    level: ev.level,
    headline: ev.headline || '',
    nurseAction: ev.nurseAction || '',
    reason: ev.reason || '',
    engine: ev.engine,
    failSafe: Boolean(ev.failSafe),
    at: ev.createdAt || new Date().toISOString(),
  }
}

async function setLatest(payload: Payload, roomId: Id, source: Source, ev: any) {
  await withLock(`room:${String(roomId)}`, async () => {
    const fresh = await findRoom(payload, String(roomId))
    if (!fresh) return
    await payload.update({
      collection: 'rooms',
      id: fresh.id,
      overrideAccess: true,
      depth: 0,
      data: { latestBySource: { ...(fresh.latestBySource || {}), [source]: summarize(ev) } } as any,
    })
  })
}

export async function recordEvent(payload: Payload, input: EventInput, opts: { escalate?: boolean } = {}) {
  const ev = (await payload.create({
    collection: 'ward-events',
    overrideAccess: true,
    depth: 0,
    data: {
      room: input.room.id as any,
      roomName: input.room.name,
      source: input.source,
      level: input.level,
      engine: input.engine,
      failSafe: Boolean(input.failSafe),
      headline: input.headline.slice(0, 200),
      reason: input.reason.slice(0, 1200),
      nurseAction: input.nurseAction.slice(0, 600),
      detail: (input.detail || '').slice(0, 300),
      latencyMs: input.latencyMs ?? 0,
      tokens: input.tokens ?? '',
    } as any,
  })) as any
  await setLatest(payload, input.room.id, input.source, ev)
  if (opts.escalate !== false && (input.level === 'RED' || input.level === 'YELLOW')) {
    const escLevel: 'RED' | 'YELLOW' = input.level === 'RED' ? 'RED' : 'YELLOW'
    await raiseEscalation(payload, { room: input.room, level: escLevel, source: input.source, headline: input.headline, nurseAction: input.nurseAction })
  }
  return toEventDTO(ev)
}

export async function enrichEvent(payload: Payload, eventId: Id, roomId: Id, patch: Partial<Pick<EventInput, 'headline' | 'reason' | 'nurseAction' | 'latencyMs' | 'tokens' | 'engine'>>) {
  const ev = await payload.update({
    collection: 'ward-events',
    id: eventId,
    overrideAccess: true,
    depth: 0,
    data: { ...patch, engine: patch.engine || 'spark' } as any,
  })
  await setLatest(payload, roomId, (ev as any).source, ev)
  return ev
}

// ---------- DTOs & snapshot (starts clean — zero placeholder rooms or fake data) ----------

const relId = (v: unknown) => (v && typeof v === 'object' ? String((v as { id: Id }).id) : v == null ? null : String(v))

export function toRoomDTO(r: any): RoomDTO {
  return {
    id: String(r.id),
    name: r.name,
    clinicalContext: r.clinicalContext ?? '',
    camUrl: r.camUrl ?? '',
    hasCamToken: Boolean(r.hasCamToken),
    negativeExclusions: r.negativeExclusions ?? '',
    bedZone: r.bedZone ?? null,
    visionClasses: r.visionClasses ?? null,
    latestBySource: r.latestBySource ?? {},
    clearedAt: r.clearedAt ?? null,
    createdAt: r.createdAt,
  }
}

export function toEventDTO(e: any): WardEventDTO {
  return {
    id: String(e.id),
    room: relId(e.room),
    roomName: e.roomName,
    source: e.source,
    level: e.level,
    engine: e.engine,
    failSafe: e.failSafe,
    headline: e.headline,
    reason: e.reason,
    nurseAction: e.nurseAction,
    detail: e.detail,
    latencyMs: e.latencyMs,
    tokens: e.tokens,
    createdAt: e.createdAt,
  }
}

export function toEscalationDTO(e: any): EscalationDTO {
  return {
    id: String(e.id),
    room: relId(e.room) || '',
    roomName: e.roomName,
    active: Boolean(e.active),
    level: e.level,
    status: e.status,
    source: e.source,
    headline: e.headline,
    nurseAction: e.nurseAction,
    queue: e.queue,
    queueIndex: e.queueIndex,
    assignedNurseName: e.assignedNurseName,
    attempt: e.attempt,
    timeoutSec: e.timeoutSec,
    deadline: e.deadline,
    repeatCount: e.repeatCount,
    acknowledgedBy: e.acknowledgedBy,
    acknowledgedAt: e.acknowledgedAt,
    history: Array.isArray(e.history) ? e.history : [],
    updatedAt: e.updatedAt,
    createdAt: e.createdAt,
  }
}

export async function buildSnapshot(user: AppUser): Promise<WardSnapshot> {
  const payload = await getPayloadClient()
  await advanceOverdueEscalations(payload)
  const recentAck = new Date(Date.now() - 60 * 60_000).toISOString()
  const [rooms, nurses, escalations, events, settings] = await Promise.all([
    payload.find({ collection: 'rooms', limit: 200, depth: 0, sort: 'createdAt', overrideAccess: true }),
    payload.find({ collection: 'nurses', limit: 100, depth: 0, sort: 'callOrder', overrideAccess: true }),
    payload.find({
      collection: 'escalations',
      where: { or: [{ active: { equals: true } }, { acknowledgedAt: { greater_than: recentAck } }] },
      limit: 100,
      depth: 0,
      sort: '-updatedAt',
      overrideAccess: true,
    }),
    payload.find({ collection: 'ward-events', limit: 150, depth: 0, sort: '-createdAt', overrideAccess: true }),
    getSettings(payload),
  ])
  const eventDTOs = events.docs.map(toEventDTO)
  const recentLogs = apiLogs(80)
  const cfg = getRuntimeConfig()
  const usage = computeUsageSummary({
    events: eventDTOs,
    apiLogs: recentLogs,
    budgetLimitUsd: cfg.budgetLimitUsd,
    budgetAlertThresholdPct: cfg.budgetAlertThresholdPct,
    pricing: cfg.pricing,
  })

  return {
    serverTime: new Date().toISOString(),
    rooms: rooms.docs.map(toRoomDTO),
    nurses: nurses.docs.map((n: any): NurseDTO => ({ id: String(n.id), name: n.name, role: n.role, onDuty: n.onDuty, callOrder: n.callOrder })),
    escalations: escalations.docs.map(toEscalationDTO),
    events: eventDTOs,
    escalationTimeoutSec: settings.escalationTimeoutSec,
    masterSummary: settings.masterSummary,
    api: getApiStatus(),
    apiLogs: recentLogs,
    auditLogs: getAuditLogs(80),
    usage,
    budgetLimitUsd: cfg.budgetLimitUsd,
    idleLockMinutes: cfg.idleLockMinutes,
    accessRequests: user.role === 'admin' ? getAccessRequests() : [],
    me: { id: user.id, name: user.name, email: user.email, role: user.role },
  }
}
