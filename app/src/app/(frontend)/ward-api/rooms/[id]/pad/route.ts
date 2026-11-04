import { getPayloadClient } from '@/lib/payload'
import { findRoom, newPadKey } from '@/lib/wardni/engine'
import { fail, handle, json, requireStaff } from '@/lib/wardni/http'

/** Staff-only: returns the bedside pad link key for a room. */
export const GET = handle(async (req, ctx) => {
  await requireStaff(req)
  const { id } = await ctx.params
  const payload = await getPayloadClient()
  const room = await findRoom(payload, id)
  if (!room) return fail(404, 'Room not found.')
  let key = room.padKey
  if (!key) {
    key = newPadKey()
    await payload.update({ collection: 'rooms', id: room.id, overrideAccess: true, data: { padKey: key } as never })
  }
  return json({ ok: true, padKey: key, path: `/pad/${encodeURIComponent(String(room.id))}?k=${encodeURIComponent(key)}` })
})

/** Ward admin: rotate the pad key (invalidates old bedside links). */
export const POST = handle(async (req, ctx) => {
  await requireStaff(req, { admin: true })
  const { id } = await ctx.params
  const payload = await getPayloadClient()
  const room = await findRoom(payload, id)
  if (!room) return fail(404, 'Room not found.')
  const key = newPadKey()
  await payload.update({ collection: 'rooms', id: room.id, overrideAccess: true, data: { padKey: key } as never })
  return json({ ok: true, padKey: key, path: `/pad/${encodeURIComponent(String(room.id))}?k=${encodeURIComponent(key)}` })
})
