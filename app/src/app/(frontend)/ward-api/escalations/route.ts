import { getPayloadClient } from '@/lib/payload'
import { findRoom, raiseEscalation, recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'

/** "Invite nurse to patient": starts a chain, or adds to / upgrades an existing one (never downgrades). */
export const POST = handle(async (req) => {
  const user = await requireStaff(req)
  const body = await readJson(req, 8 * 1024)
  const roomId = str(body.roomId, 80)
  if (!roomId) return fail(400, 'roomId is required.')
  const payload = await getPayloadClient()
  const room = await findRoom(payload, roomId)
  if (!room) return fail(404, 'Room not found.')
  const level = body.level === 'RED' ? 'RED' : 'YELLOW'
  const headline = str(body.headline, 160) || `Nurse requested at ${room.name}`
  const nurseAction = str(body.nurseAction, 300) || `Attend ${room.name} bedside.`
  await raiseEscalation(payload, {
    room,
    level,
    source: `DISPATCH · ${user.name}`,
    headline,
    nurseAction,
  })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'CALL_NURSE_ESCALATE',
    target: room.name,
    detail: `Dispatched ${level} nurse call: "${headline}"`,
    level,
  })
  return json({ ok: true })
})
