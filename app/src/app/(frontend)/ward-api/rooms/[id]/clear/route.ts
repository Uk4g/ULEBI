import { getPayloadClient } from '@/lib/payload'
import { findRoom, recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, requireStaff } from '@/lib/wardni/http'

/** "Mark stable": the room returns to STANDBY until a new module verdict arrives. */
export const POST = handle(async (req, ctx) => {
  const user = await requireStaff(req)
  const { id } = await ctx.params
  const payload = await getPayloadClient()
  const room = await findRoom(payload, id)
  if (!room) return fail(404, 'Room not found.')
  await payload.update({ collection: 'rooms', id: room.id, data: { clearedAt: new Date().toISOString() }, user: user.doc as never, overrideAccess: false })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'MARK_ROOM_STABLE',
    target: room.name,
    detail: `Reset ${room.name} module verdicts to STANDBY`,
    level: 'routine',
  })
  return json({ ok: true })
})
