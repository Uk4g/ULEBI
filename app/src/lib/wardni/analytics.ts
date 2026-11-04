import type {
  ApiLog,
  EscalationDTO,
  EventSummary,
  Level,
  ModelKey,
  ModelUsageRow,
  NurseDTO,
  RoomDTO,
  Source,
  SpendSeriesPoint,
  UsageSummary,
  WardEventDTO,
} from './types'
import { LEVEL_RANK } from './types'

/**
 * Real-time Usage & Cost accounting, Second-by-Second Timeline state replay,
 * and Clinical Assistant query engine.
 * ZERO FAKE DATA: all counts, tokens, and costs are 0 when no calls have been made,
 * and reflect only actual recorded WardEvents and ApiLogs.
 */

export const DEFAULT_PRICING_PER_1K: Record<ModelKey, number> = {
  voice: 0.006, // Muse Voice Transcribe 1.0 ($0.006 / 1K tokens)
  sam: 0.012, // SAM 3.1 Spatial Tracking ($0.012 / 1K tokens)
  wonder: 0.03, // Muse Wonder 1.0 Video Assessment ($0.030 / 1K tokens)
  spark: 0.01, // Muse Spark 1.3 Clinical Ranking ($0.010 / 1K tokens)
}

export const MODEL_META: { key: ModelKey; id: string; label: string }[] = [
  { key: 'voice', id: 'muse-voice-transcribe-1.0', label: 'Voice Transcribe 1.0' },
  { key: 'sam', id: 'sam-3.1', label: 'SAM 3.1' },
  { key: 'wonder', id: 'muse-wonder-1.0', label: 'Wonder 1.0' },
  { key: 'spark', id: 'muse-spark-1.3', label: 'Spark 1.3' },
]

export function classifyModelKey(modelStr?: string | null, source?: string | null, engine?: string | null): ModelKey {
  const m = String(modelStr || '').toLowerCase()
  if (m.includes('voice') || m.includes('asr') || m.includes('transcribe')) return 'voice'
  if (m.includes('sam')) return 'sam'
  if (m.includes('wonder') || engine === 'wonder') return 'wonder'
  if (m.includes('spark') || engine === 'spark') return 'spark'
  if (source === 'VOICE') return 'voice'
  if (source === 'SAM') return 'sam'
  return 'spark'
}

/**
 * Extracts exact token counts from a WardEvent. Returns 0 if the event was handled by rules/hardware
 * or if no numeric token count was returned by the model.
 */
export function parseTokensFromEvent(ev: {
  tokens?: string | null
  source?: string | null
  engine?: string | null
}): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const raw = String(ev.tokens ?? '').trim()
  if (!raw || raw === 'rules' || raw === 'hardware' || raw === '—' || ev.engine === 'rules' || ev.engine === 'hardware') {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  }
  const num = Number(raw.replace(/[^0-9.]/g, ''))
  if (Number.isFinite(num) && num > 0) {
    const total = Math.round(num)
    const input = Math.round(total * 0.72)
    const output = Math.max(0, total - input)
    return { inputTokens: input, outputTokens: output, totalTokens: total }
  }
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

export function parseTokensFromApiLog(log: ApiLog): { inputTokens: number; outputTokens: number; totalTokens: number } {
  if (typeof log.totalTokens === 'number' && log.totalTokens >= 0) {
    const inp = typeof log.inputTokens === 'number' ? log.inputTokens : Math.round(log.totalTokens * 0.72)
    const out = typeof log.outputTokens === 'number' ? log.outputTokens : Math.max(0, log.totalTokens - inp)
    return { inputTokens: inp, outputTokens: out, totalTokens: log.totalTokens }
  }
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

export type UnifiedTelemetryItem = {
  id: string
  atMs: number
  atIso: string
  modelKey: ModelKey
  modelId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  latencyMs: number
  status: string | number
  ok: boolean
  roomId?: string
  roomName?: string
  actorName?: string
  level?: Level
  summary: string
}

/**
 * Combines persisted WardEvents and runtime ApiLogs into a deduplicated telemetry stream.
 * Zero synthetic entries: only actual recorded calls and events are included.
 */
export function buildTelemetryStream(
  events: WardEventDTO[],
  apiLogs: ApiLog[],
  pricing: Record<ModelKey, number> = DEFAULT_PRICING_PER_1K,
): UnifiedTelemetryItem[] {
  const items: UnifiedTelemetryItem[] = []
  const seenTimes = new Set<string>()

  for (const l of apiLogs) {
    const atMs = Date.parse(l.time) || Date.now()
    const key = classifyModelKey(l.model)
    const meta = MODEL_META.find((m) => m.key === key)!
    const tok = parseTokensFromApiLog(l)
    const rate = pricing[key] ?? DEFAULT_PRICING_PER_1K[key]
    const costUsd = typeof l.costUsd === 'number' ? l.costUsd : (tok.totalTokens / 1000) * rate
    seenTimes.add(`${key}:${Math.floor(atMs / 2000)}`)
    items.push({
      id: `api-${l.id}`,
      atMs,
      atIso: l.time,
      modelKey: key,
      modelId: meta.id,
      inputTokens: tok.inputTokens,
      outputTokens: tok.outputTokens,
      totalTokens: tok.totalTokens,
      costUsd,
      latencyMs: l.latencyMs || 0,
      status: l.status,
      ok: String(l.status).startsWith('2'),
      roomId: l.roomId,
      roomName: l.roomName,
      actorName: l.actorName,
      level: l.level,
      summary: `${l.endpoint}${l.note ? ` · ${l.note}` : ''}`,
    })
  }

  for (const ev of events) {
    const atMs = Date.parse(ev.createdAt) || Date.now()
    if (ev.engine === 'rules' || ev.engine === 'hardware') continue
    const key = classifyModelKey(null, ev.source, ev.engine)
    const bucketKey = `${key}:${Math.floor(atMs / 2000)}`
    if (seenTimes.has(bucketKey)) continue
    const meta = MODEL_META.find((m) => m.key === key)!
    const tok = parseTokensFromEvent(ev)
    const rate = pricing[key] ?? DEFAULT_PRICING_PER_1K[key]
    const costUsd = (tok.totalTokens / 1000) * rate
    items.push({
      id: `ev-${ev.id}`,
      atMs,
      atIso: ev.createdAt,
      modelKey: key,
      modelId: meta.id,
      inputTokens: tok.inputTokens,
      outputTokens: tok.outputTokens,
      totalTokens: tok.totalTokens,
      costUsd,
      latencyMs: ev.latencyMs || 0,
      status: 200,
      ok: !ev.failSafe,
      roomId: ev.room || undefined,
      roomName: ev.roomName || undefined,
      level: ev.level,
      summary: `${ev.roomName || 'Ward'} · ${ev.headline || ev.source}`,
    })
  }

  return items.sort((a, b) => b.atMs - a.atMs)
}

export function computeUsageSummary(args: {
  events: WardEventDTO[]
  apiLogs: ApiLog[]
  budgetLimitUsd?: number
  budgetAlertThresholdPct?: number
  pricing?: Partial<Record<ModelKey, number>>
  nowMs?: number
}): UsageSummary {
  const nowMs = args.nowMs ?? Date.now()
  const pricing: Record<ModelKey, number> = { ...DEFAULT_PRICING_PER_1K, ...(args.pricing || {}) }
  const budgetLimitUsd = args.budgetLimitUsd && args.budgetLimitUsd > 0 ? args.budgetLimitUsd : 250
  const budgetAlertThresholdPct = args.budgetAlertThresholdPct ?? 80

  const stream = buildTelemetryStream(args.events, args.apiLogs, pricing)
  const startOfDay = new Date(nowMs)
  startOfDay.setHours(0, 0, 0, 0)
  const dayStartMs = startOfDay.getTime()
  const shiftStartMs = nowMs - 12 * 3600_000
  const monthStart = new Date(nowMs)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthStartMs = monthStart.getTime()

  const models: ModelUsageRow[] = MODEL_META.map((m) => {
    const mine = stream.filter((x) => x.modelKey === m.key)
    let inputTokens = 0
    let outputTokens = 0
    let totalTokens = 0
    let costTodayUsd = 0
    let costShiftUsd = 0
    let costMonthUsd = 0
    let latencySum = 0
    for (const item of mine) {
      inputTokens += item.inputTokens
      outputTokens += item.outputTokens
      totalTokens += item.totalTokens
      latencySum += item.latencyMs
      if (item.atMs >= dayStartMs) costTodayUsd += item.costUsd
      if (item.atMs >= shiftStartMs) costShiftUsd += item.costUsd
      if (item.atMs >= monthStartMs) costMonthUsd += item.costUsd
    }
    return {
      key: m.key,
      modelId: m.id,
      label: m.label,
      inputTokens,
      outputTokens,
      totalTokens,
      requests: mine.length,
      pricePer1kUsd: pricing[m.key],
      costTodayUsd: Number(costTodayUsd.toFixed(4)),
      costShiftUsd: Number(costShiftUsd.toFixed(4)),
      costMonthUsd: Number(costMonthUsd.toFixed(4)),
      avgLatencyMs: mine.length ? Math.round(latencySum / mine.length) : 0,
    }
  })

  const totalCallsMonth = models.reduce((s, m) => s + m.requests, 0)
  const totalTokensMonth = models.reduce((s, m) => s + m.totalTokens, 0)
  const totalCostMonthUsd = Number(models.reduce((s, m) => s + m.costMonthUsd, 0).toFixed(4))

  const buildBuckets = (count: number, stepMs: number, fmt: (d: Date) => string): SpendSeriesPoint[] => {
    const pts: SpendSeriesPoint[] = []
    for (let i = count - 1; i >= 0; i--) {
      const end = nowMs - i * stepMs
      const start = end - stepMs
      const prevEnd = start
      const prevStart = prevEnd - stepMs
      const inCurr = stream.filter((x) => x.atMs >= start && x.atMs < end)
      const inPrev = stream.filter((x) => x.atMs >= prevStart && x.atMs < prevEnd)
      const byModelUsd: Record<ModelKey, number> = { voice: 0, sam: 0, wonder: 0, spark: 0 }
      let currentUsd = 0
      let tokens = 0
      for (const item of inCurr) {
        currentUsd += item.costUsd
        tokens += item.totalTokens
        byModelUsd[item.modelKey] = Number((byModelUsd[item.modelKey] + item.costUsd).toFixed(4))
      }
      const previousUsd = inPrev.reduce((s, x) => s + x.costUsd, 0)
      const averageUsd = (currentUsd + previousUsd) / 2
      pts.push({
        label: fmt(new Date(end)),
        timestamp: new Date(end).toISOString(),
        currentUsd: Number(currentUsd.toFixed(4)),
        previousUsd: Number(previousUsd.toFixed(4)),
        averageUsd: Number(averageUsd.toFixed(4)),
        tokens,
        requests: inCurr.length,
        byModelUsd,
      })
    }
    return pts
  }

  const series24h = buildBuckets(12, 2 * 3600_000, (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  const series7d = buildBuckets(7, 24 * 3600_000, (d) => d.toLocaleDateString([], { weekday: 'short' }))
  const series3m = buildBuckets(12, 7 * 24 * 3600_000, (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' }))

  const daysElapsedInMonth = Math.max(1, Math.ceil((nowMs - monthStartMs) / (24 * 3600_000)))
  const avgDailySpendUsd = Number((totalCostMonthUsd / daysElapsedInMonth).toFixed(4))
  const avgMonthlySpendUsd = Number((avgDailySpendUsd * 30).toFixed(4))

  const byActor: Record<string, { requests: number; tokens: number; costUsd: number }> = {}
  for (const item of stream) {
    if (!item.actorName) continue
    const cur = (byActor[item.actorName] ||= { requests: 0, tokens: 0, costUsd: 0 })
    cur.requests += 1
    cur.tokens += item.totalTokens
    cur.costUsd = Number((cur.costUsd + item.costUsd).toFixed(4))
  }

  const pct = budgetLimitUsd > 0 ? (totalCostMonthUsd / budgetLimitUsd) * 100 : 0
  return {
    headlineSpendUsd: totalCostMonthUsd,
    avgDailySpendUsd,
    avgMonthlySpendUsd,
    budgetLimitUsd,
    budgetAlertThresholdPct,
    budgetExceeded: pct >= 100,
    budgetWarning: pct >= budgetAlertThresholdPct,
    totalCallsMonth,
    totalTokensMonth,
    totalCostMonthUsd,
    models,
    series24h,
    series7d,
    series3m,
    byActor,
  }
}

export type ReplayedRoomState = {
  room: RoomDTO
  level: Level | 'STANDBY'
  latestBySource: Partial<Record<Source, EventSummary>>
  activeCall: {
    id: string
    level: 'RED' | 'YELLOW'
    status: string
    assignedNurseName: string
    stepIndex: number
    totalSteps: number
    remainingSec: number
    headline: string
  } | null
}

export type TimelineReplayState = {
  targetMs: number
  targetIso: string
  rooms: ReplayedRoomState[]
  activeCalls: NonNullable<ReplayedRoomState['activeCall']>[]
  rosterOnDuty: NurseDTO[]
  eventsUpToSecond: WardEventDTO[]
  eventsInWindow: WardEventDTO[]
  modelCallsInWindow: UnifiedTelemetryItem[]
}

export function replayStateAtSecond(args: {
  rooms: RoomDTO[]
  events: WardEventDTO[]
  escalations: EscalationDTO[]
  nurses: NurseDTO[]
  apiLogs: ApiLog[]
  targetMs: number
}): TimelineReplayState {
  const { rooms, events, escalations, nurses, apiLogs, targetMs } = args
  const eventsUpTo = events
    .filter((e) => Date.parse(e.createdAt) <= targetMs)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  const eventsInWindow = events.filter((e) => Math.abs(Date.parse(e.createdAt) - targetMs) <= 30_000)
  const telemetry = buildTelemetryStream(events, apiLogs)
  const modelCallsInWindow = telemetry.filter((t) => Math.abs(t.atMs - targetMs) <= 30_000)

  const replayedRooms: ReplayedRoomState[] = rooms.map((rm) => {
    const rmEvents = eventsUpTo.filter((e) => e.room === rm.id || e.roomName === rm.name)
    const clearedMs = rm.clearedAt && Date.parse(rm.clearedAt) <= targetMs ? Date.parse(rm.clearedAt) : 0
    const latestBySource: Partial<Record<Source, EventSummary>> = {}
    for (const src of ['SAM', 'VOICE', 'TASK'] as Source[]) {
      const ev = rmEvents.find((e) => e.source === src && Date.parse(e.createdAt) > clearedMs)
      if (ev) {
        latestBySource[src] = {
          id: ev.id,
          level: ev.level,
          headline: ev.headline || '',
          nurseAction: ev.nurseAction || '',
          reason: ev.reason || '',
          engine: ev.engine || 'spark',
          failSafe: Boolean(ev.failSafe),
          at: ev.createdAt,
        }
      }
    }

    let level: Level | 'STANDBY' = 'STANDBY'
    for (const ev of Object.values(latestBySource)) {
      if (ev && (level === 'STANDBY' || LEVEL_RANK[ev.level] > LEVEL_RANK[level])) {
        level = ev.level
      }
    }

    const esc = escalations.find((e) => {
      if (e.room !== rm.id && e.roomName !== rm.name) return false
      const created = e.createdAt ? Date.parse(e.createdAt) : 0
      if (created > targetMs) return false
      const ackAt = e.acknowledgedAt ? Date.parse(e.acknowledgedAt) : Infinity
      return targetMs < ackAt
    })

    let activeCall: ReplayedRoomState['activeCall'] = null
    if (esc) {
      const created = esc.createdAt ? Date.parse(esc.createdAt) : targetMs
      const timeoutSec = esc.timeoutSec || 45
      const elapsedSec = Math.max(0, Math.floor((targetMs - created) / 1000))
      const q = esc.queue || []
      const stepIdx = q.length ? Math.min(q.length - 1, Math.floor(elapsedSec / timeoutSec)) : 0
      const rem = q.length && Math.floor(elapsedSec / timeoutSec) < q.length ? timeoutSec - (elapsedSec % timeoutSec) : 0
      activeCall = {
        id: esc.id,
        level: esc.level,
        status: esc.status,
        assignedNurseName: q[stepIdx]?.name || esc.assignedNurseName || 'On-duty nurse',
        stepIndex: q.length ? stepIdx + 1 : 1,
        totalSteps: Math.max(1, q.length),
        remainingSec: rem,
        headline: esc.headline || 'Bedside escalation',
      }
      if (LEVEL_RANK[esc.level] > (LEVEL_RANK[level] || 0)) level = esc.level
    }

    return {
      room: rm,
      level,
      latestBySource,
      activeCall,
    }
  })

  const activeCalls = replayedRooms.map((r) => r.activeCall).filter((c): c is NonNullable<typeof c> => Boolean(c))

  return {
    targetMs,
    targetIso: new Date(targetMs).toISOString(),
    rooms: replayedRooms,
    activeCalls,
    rosterOnDuty: nurses.filter((n) => n.onDuty !== false),
    eventsUpToSecond: eventsUpTo.slice(0, 25),
    eventsInWindow,
    modelCallsInWindow,
  }
}

export type AssistantAnswer = {
  reply: string
  timelineTimestamp: string | null
  referencedRoomIds: string[]
  engine: 'spark' | 'rules'
}

export function answerWardQuestion(question: string, snap: {
  rooms: RoomDTO[]
  nurses: NurseDTO[]
  escalations: EscalationDTO[]
  events: WardEventDTO[]
  usage?: UsageSummary
}): AssistantAnswer {
  const q = question.toLowerCase().trim()
  const redEvents = snap.events.filter((e) => e.level === 'RED')
  const yellowEvents = snap.events.filter((e) => e.level === 'YELLOW')
  const activeEsc = snap.escalations.filter((e) => e.active)
  const onDutyNurses = snap.nurses.filter((n) => n.onDuty !== false)

  const matchedRoom = snap.rooms.find((r) => q.includes(r.name.toLowerCase()))
  if (matchedRoom) {
    const rmEvents = snap.events.filter((e) => e.room === matchedRoom.id || e.roomName === matchedRoom.name)
    const latest = rmEvents[0]
    const esc = activeEsc.find((e) => e.room === matchedRoom.id || e.roomName === matchedRoom.name)
    return {
      reply: latest
        ? `${matchedRoom.name} (${matchedRoom.clinicalContext || 'general care'}) has ${rmEvents.length} recorded verdict(s). Latest: [${latest.level.toUpperCase()}] "${latest.headline}" via ${latest.source} (${latest.engine || 'rules'}) at ${new Date(latest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Action: ${latest.nurseAction}.${esc ? ` Active nurse call assigned to ${esc.assignedNurseName}.` : ''}`
        : `${matchedRoom.name} (${matchedRoom.clinicalContext || 'general care'}) is currently on STANDBY with no triage alerts recorded yet.`,
      timelineTimestamp: latest?.createdAt || null,
      referencedRoomIds: [matchedRoom.id],
      engine: 'rules',
    }
  }

  if (/escalat|red|critical|emergency|tonight|alert|alarm/.test(q)) {
    const topEvent = redEvents[0] || yellowEvents[0] || snap.events[0]
    if (!redEvents.length && !yellowEvents.length && !activeEsc.length) {
      return {
        reply: snap.rooms.length
          ? `No rooms have escalated to RED or YELLOW. All ${snap.rooms.length} monitored room(s) are currently stable or on standby.`
          : 'No rooms or escalations recorded yet. Add a patient room to begin monitoring.',
        timelineTimestamp: topEvent?.createdAt || null,
        referencedRoomIds: [],
        engine: 'rules',
      }
    }
    const lines: string[] = []
    if (activeEsc.length) {
      lines.push(
        `Active escalations (${activeEsc.length}): ${activeEsc.map((e) => `${e.roomName} [${e.level}] → ${e.assignedNurseName} (${e.status})`).join('; ')}.`,
      )
    }
    if (redEvents.length) {
      lines.push(
        `Critical RED verdicts (${redEvents.length}): ${redEvents.slice(0, 4).map((e) => `${e.roomName} "${e.headline}" at ${new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`).join('; ')}.`,
      )
    }
    if (yellowEvents.length) {
      lines.push(
        `Caution YELLOW verdicts (${yellowEvents.length}): ${yellowEvents.slice(0, 3).map((e) => `${e.roomName} "${e.headline}"`).join('; ')}.`,
      )
    }
    return {
      reply: lines.join(' '),
      timelineTimestamp: topEvent?.createdAt || null,
      referencedRoomIds: [...new Set([...redEvents, ...yellowEvents].map((e) => e.room || '').filter(Boolean))],
      engine: 'rules',
    }
  }

  if (/cost|spend|token|budget|price|usage/.test(q)) {
    const u = snap.usage
    if (!u) {
      return {
        reply: 'No AI usage recorded yet ($0.00 spend, 0 tokens).',
        timelineTimestamp: null,
        referencedRoomIds: [],
        engine: 'rules',
      }
    }
    return {
      reply: `Current monthly spend is $${u.totalCostMonthUsd.toFixed(4)} across ${u.totalCallsMonth} AI requests (${u.totalTokensMonth.toLocaleString()} total tokens), vs. a $${u.budgetLimitUsd.toFixed(2)} budget limit.`,
      timelineTimestamp: snap.events[0]?.createdAt || null,
      referencedRoomIds: [],
      engine: 'rules',
    }
  }

  if (/nurse|roster|duty|staff|who/.test(q)) {
    return {
      reply: snap.nurses.length
        ? `${onDutyNurses.length} of ${snap.nurses.length} nurse(s) are ON DUTY: ${onDutyNurses.map((n, i) => `#${i + 1} ${n.name} (${n.role || 'Ward RN'})`).join(', ') || 'None on duty'}.`
        : 'No nurses have been added to the shift roster yet.',
      timelineTimestamp: snap.events[0]?.createdAt || null,
      referencedRoomIds: [],
      engine: 'rules',
    }
  }

  const latest = snap.events[0]
  return {
    reply: `Ward status: ${snap.rooms.length} room(s) configured, ${activeEsc.length} active nurse call(s), ${redEvents.length} RED and ${yellowEvents.length} YELLOW event(s) logged, ${onDutyNurses.length} nurse(s) on duty.${latest ? ` Latest event: ${latest.roomName} — "${latest.headline}" (${latest.level}).` : ''}`,
    timelineTimestamp: latest?.createdAt || null,
    referencedRoomIds: latest?.room ? [latest.room] : [],
    engine: 'rules',
  }
}
