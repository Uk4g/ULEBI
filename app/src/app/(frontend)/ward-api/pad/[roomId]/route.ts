import { after } from 'next/server'
import { getPayloadClient } from '@/lib/payload'
import { advanceOverdueEscalations, enrichEvent, findRoom, recordEvent, safeEqual, toEscalationDTO } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, str } from '@/lib/wardni/http'
import { taskRules } from '@/lib/wardni/rules'
import { runTriage } from '@/lib/wardni/pipeline'
import { enrichEmergency, triageTask } from '@/lib/wardni/triage'
import { TASKS } from '@/lib/wardni/types'

/**
 * Bedside pad API. Authenticated by the room's secret pad key (capability link), NOT by a staff session,
 * so the Emergency button keeps working across server restarts and session expiry.
 */

const VALID_TASKS = new Set<string>(TASKS.map((t) => t.id))
const g = globalThis as unknown as { __wardniPadRate?: Map<string, number>; __wardniEnrichAt?: Map<string, number> }

async function authorize(req: Request, roomId: string, key: string) {
  const payload = await getPayloadClient()
  const room = await findRoom(payload, roomId)
  if (!room || !room.padKey || !safeEqual(room.padKey, key)) return { payload, room: null }
  return { payload, room }
}

export const GET = handle(async (req, ctx) => {
  const { roomId } = await ctx.params
  const key = new URL(req.url).searchParams.get('k') || ''
  const { payload, room } = await authorize(req, roomId, key)
  if (!room) return fail(403, 'This bedside pad link is invalid or was rotated. Ask the nurse station for a new link.')
  await advanceOverdueEscalations(payload)
  const last = (
    await payload.find({
      collection: 'escalations',
      where: { room: { equals: room.id } },
      sort: '-updatedAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as { active?: boolean; acknowledgedAt?: string } | undefined
  const esc = last?.active ? last : null
  const recentAck = last && !last.active && last.acknowledgedAt && Date.now() - Date.parse(last.acknowledgedAt) < 10 * 60_000 ? last : null
  return json({
    ok: true,
    serverTime: new Date().toISOString(),
    // The pad lives in a patient room: it gets the room name only, never the clinical risk note.
    room: { id: String(room.id), name: room.name },
    latestTask: room.latestBySource?.TASK || null,
    escalation: esc ? toEscalationDTO(esc) : null,
    acknowledged: recentAck ? toEscalationDTO(recentAck) : null,
  })
})

export const POST = handle(async (req, ctx) => {
  const { roomId } = await ctx.params
  const body = await readJson(req, 8 * 1024)
  const { payload, room } = await authorize(req, roomId, String(body.k || ''))
  if (!room) return fail(403, 'This bedside pad link is invalid or was rotated. Ask the nurse station for a new link.')
  const task = String(body.task || '')
  if (!VALID_TASKS.has(task)) return fail(400, 'Unknown bedside button.')
  const note = str(body.note, 300)
  const ctxNote = room.clinicalContext || ''

  // HARDWARE-FIRST EMERGENCY: record RED + start escalation before touching any AI.
  if (task === 'EMERGENCY HELP') {
    const v = taskRules(task, note, ctxNote, room.name)
    const event = await recordEvent(payload, {
      room,
      source: 'TASK',
      level: 'RED',
      engine: 'hardware',
      headline: v.headline,
      reason: v.reason,
      nurseAction: v.nurse_action,
      detail: task,
    })
    // Presses are never dropped, but a patient mashing the button must not trigger one AI call per press.
    const enrichAt = (g.__wardniEnrichAt ||= new Map())
    const lastEnrich = enrichAt.get(String(room.id)) || 0
    const onDutyNurse = (
      await payload.find({ collection: 'nurses', where: { onDuty: { equals: true } }, sort: 'callOrder', limit: 1, depth: 0, overrideAccess: true })
    ).docs[0] as { name?: string } | undefined
    const calledNurse = onDutyNurse?.name || 'All staff alerted'
    if (Date.now() - lastEnrich < 60_000) return json({ ok: true, event, calledNurse, message: `Emergency triggered — nurse notified: ${calledNurse}` })
    enrichAt.set(String(room.id), Date.now())
    after(async () => {
      const extra = await enrichEmergency(task, note, ctxNote, room.name)
      if (extra && extra.nurseAction) {
        await enrichEvent(payload, event.id, room.id, {
          headline: extra.headline || v.headline,
          reason: extra.reason || v.reason,
          nurseAction: extra.nurseAction,
          latencyMs: extra.latencyMs,
          tokens: extra.tokens,
        })
      }
    })
    return json({ ok: true, event, calledNurse, message: `Emergency triggered — nurse notified: ${calledNurse}` })
  }

  // Light anti-spam for non-emergency buttons (emergency is never throttled).
  const rate = (g.__wardniPadRate ||= new Map())
  const rk = `${room.id}:${task}`
  const last = rate.get(rk) || 0
  if (Date.now() - last < 4000) return fail(429, 'Request already sent — a nurse has been notified.')
  rate.set(rk, Date.now())
  if (rate.size > 500) for (const [k, t] of rate) if (Date.now() - t > 60_000) rate.delete(k)

  // Rules decide the floor instantly (fall-risk bathroom, NPO intake request); Muse Spark may only raise it, and for
  // routine buttons its verdict is awaited. The patient never waits on the AI for a request that already needs a nurse.
  const rules = taskRules(task, note, ctxNote, room.name)
  const r = await runTriage({
    source: 'TASK',
    rules,
    detail: note ? `${task} · "${note}"` : task,
    ai: () => triageTask(task, note, ctxNote, room.name, 'low'),
    deps: {
      record: (i) => recordEvent(payload, { room, ...i }),
      enrich: (id, patch) => enrichEvent(payload, id, room.id, patch),
      schedule: (fn) => after(fn),
      log: (m, e) => console.error(m, e),
    },
  })
  const lastEsc = (
    await payload.find({ collection: 'escalations', where: { and: [{ room: { equals: room.id } }, { active: { equals: true } }] }, sort: '-createdAt', limit: 1, depth: 0, overrideAccess: true })
  ).docs[0] as { assignedNurseName?: string } | undefined
  const onDutyRoster = (
    await payload.find({ collection: 'nurses', where: { onDuty: { equals: true } }, sort: 'callOrder', limit: 1, depth: 0, overrideAccess: true })
  ).docs[0] as { name?: string } | undefined
  // Prefer the on-duty roster. An active escalation's assigned name can be the
  // automated alarm placeholder ("Automated ward emergency alarm"), which is not a nurse.
  const escName = lastEsc?.assignedNurseName
  const calledNurse = onDutyRoster?.name || (escName && !/automated/i.test(escName) ? escName : null)
  const message = calledNurse ? `Request sent — nurse notified: ${calledNurse}` : 'Request sent — no nurse on duty'
  return json({ ok: true, event: r.event, calledNurse, message })
})
