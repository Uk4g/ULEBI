import { getPayloadClient } from '@/lib/payload'
import { findRoom, recordAudit, toRoomDTO } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'
import { sanitizeBox, sanitizeClasses } from '@/lib/wardni/sanitize'
import { sanitizeCameraUrl, validateCameraTarget } from '@/lib/wardni/ssrf'

export const PATCH = handle(async (req, ctx) => {
  const user = await requireStaff(req)
  const { id } = await ctx.params
  const payload = await getPayloadClient()
  const room = await findRoom(payload, id)
  if (!room) return fail(404, 'Room not found.')
  const body = await readJson(req, 64 * 1024)
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = str(body.name, 80)
    if (!name) return fail(400, 'Room name cannot be empty.')
    data.name = name
  }
  if (body.clinicalContext !== undefined) data.clinicalContext = str(body.clinicalContext, 300)
  if (body.negativeExclusions !== undefined) data.negativeExclusions = str(body.negativeExclusions, 200)
  if (body.bedZone !== undefined) {
    const bz = sanitizeBox(body.bedZone)
    if (!bz) return fail(400, 'Bed zone is too small or invalid.')
    data.bedZone = bz
  }
  if (body.visionClasses !== undefined) data.visionClasses = sanitizeClasses(body.visionClasses) || []

  let camToken: string | undefined
  if (body.camUrl !== undefined || body.camToken) {
    const cam = sanitizeCameraUrl(body.camUrl !== undefined ? str(body.camUrl, 600) : room.camUrl || '', str(body.camToken, 600))
    if (cam.error) return fail(400, cam.error)
    if (cam.url && cam.url !== room.camUrl) {
      const check = await validateCameraTarget(cam.url)
      if (!check.ok) return fail(400, check.reason)
    }
    data.camUrl = cam.url
    if (cam.token) camToken = cam.token
    if (!cam.url || body.clearCamToken) camToken = ''
  }
  const updated = await payload.update({ collection: 'rooms', id: room.id, data, user: user.doc as never, overrideAccess: false, depth: 0 })
  if (camToken !== undefined) {
    await payload.update({ collection: 'rooms', id: room.id, overrideAccess: true, data: { camToken, hasCamToken: Boolean(camToken) } as never })
  }
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'EDIT_ROOM',
    target: String(data.name || room.name),
    detail: `Updated room configuration (${Object.keys(data).join(', ')})`,
    level: 'INFO',
  })
  return json({ ok: true, room: toRoomDTO({ ...updated, hasCamToken: camToken !== undefined ? Boolean(camToken) : updated.hasCamToken }) })
})

export const DELETE = handle(async (req, ctx) => {
  const user = await requireStaff(req)
  const { id } = await ctx.params
  const payload = await getPayloadClient()
  const room = await findRoom(payload, id)
  if (!room) return fail(404, 'Room not found.')
  // Close any open chain so a deleted room can never keep the ward alarm running.
  await payload.update({
    collection: 'escalations',
    where: { and: [{ room: { equals: room.id } }, { active: { equals: true } }] },
    data: { active: false, status: 'ACKNOWLEDGED', acknowledgedBy: `${user.name} (room removed)`, acknowledgedAt: new Date().toISOString() } as never,
    overrideAccess: true,
  })
  await payload.delete({ collection: 'rooms', id: room.id, user: user.doc as never, overrideAccess: false })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'DELETE_ROOM',
    target: room.name,
    detail: `Deleted room ${room.name} and closed active escalations`,
    level: 'YELLOW',
  })
  return json({ ok: true })
})
