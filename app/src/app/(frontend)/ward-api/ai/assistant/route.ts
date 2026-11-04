import { answerWardQuestion } from '@/lib/wardni/analytics'
import { buildSnapshot } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'
import { sparkChat, sparkLive } from '@/lib/wardni/meta'

export const POST = handle(async (req) => {
  const user = await requireStaff(req)
  const body = await readJson(req, 16 * 1024)
  const message = str(body.message, 800)
  if (!message) return fail(400, 'Enter a question for the ULEBI AI Assistant.')

  const snap = await buildSnapshot(user)
  const deterministic = answerWardQuestion(message, snap)

  if (!sparkLive()) {
    return json({
      ok: true,
      reply: deterministic.reply,
      timelineTimestamp: deterministic.timelineTimestamp,
      referencedRoomIds: deterministic.referencedRoomIds,
      engine: 'rules',
    })
  }

  const contextPayload = {
    serverTime: snap.serverTime,
    rooms: snap.rooms.map((r) => ({ id: r.id, name: r.name, clinicalContext: r.clinicalContext, latestBySource: r.latestBySource })),
    activeEscalations: snap.escalations.filter((e) => e.active).map((e) => ({ room: e.roomName, level: e.level, assigned: e.assignedNurseName, status: e.status, headline: e.headline })),
    recentEvents: snap.events.slice(0, 12).map((e) => ({ room: e.roomName, level: e.level, source: e.source, headline: e.headline, at: e.createdAt })),
    nursesOnDuty: snap.nurses.filter((n) => n.onDuty !== false).map((n) => ({ name: n.name, role: n.role, order: n.callOrder })),
    usageSummary: snap.usage
      ? {
          totalCostMonthUsd: snap.usage.totalCostMonthUsd,
          totalCallsMonth: snap.usage.totalCallsMonth,
          totalTokensMonth: snap.usage.totalTokensMonth,
          budgetLimitUsd: snap.usage.budgetLimitUsd,
        }
      : null,
    deterministicBaseline: deterministic.reply,
  }

  const r = await sparkChat(
    [
      {
        role: 'developer',
        content: [
          'You are the ULEBI Night-Shift AI Clinical Workflow Assistant (Muse Spark 1.3).',
          'Answer the nurse or admin question concisely and accurately using ONLY the live ward data provided.',
          'Never diagnose medical conditions or prescribe medication. If an event timestamp is relevant, mention the room and time.',
          'Return STRICT JSON ONLY: {"reply":string,"timelineTimestamp":string|null}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Live Ward Context:\n${JSON.stringify(contextPayload)}\n\nQuestion: ${message}`,
      },
    ],
    { effort: 'low', label: 'AI_ASSISTANT', timeoutMs: 15_000 },
  )

  if (!r.ok || !r.json?.reply) {
    return json({
      ok: true,
      reply: deterministic.reply,
      timelineTimestamp: deterministic.timelineTimestamp,
      referencedRoomIds: deterministic.referencedRoomIds,
      engine: 'rules',
    })
  }

  return json({
    ok: true,
    reply: String(r.json.reply),
    timelineTimestamp: typeof r.json.timelineTimestamp === 'string' && r.json.timelineTimestamp ? r.json.timelineTimestamp : deterministic.timelineTimestamp,
    referencedRoomIds: deterministic.referencedRoomIds,
    engine: 'spark',
  })
})
