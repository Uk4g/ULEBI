import { getPayloadClient } from '@/lib/payload'
import { newPadKey, recordAudit, toRoomDTO } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'
import { sanitizeBox, sanitizeClasses } from '@/lib/wardni/sanitize'
import { sanitizeCameraUrl, validateCameraTarget } from '@/lib/wardni/ssrf'

const DEFAULT_BED = { xMin: 0.18, yMin: 0.18, xMax: 0.82, yMax: 0.86 }

export const POST = handle(async (req) => {
  const user = await requireStaff(req)
  const body = await readJson(req, 64 * 1024)
  const name = str(body.name, 80)
  if (!name) return fail(400, 'Room name is required.')
  const finalContext = str(body.clinicalContext, 300) || 'General care · Standard monitoring'
  const cam = sanitizeCameraUrl(str(body.camUrl, 600), str(body.camToken, 600))
  if (cam.error) return fail(400, cam.error)
  if (cam.url) {
    const check = await validateCameraTarget(cam.url)
    if (!check.ok) return fail(400, check.reason)
  }
  const payload = await getPayloadClient()
  const room = await payload.create({
    collection: 'rooms',
    user: user.doc as never,
    overrideAccess: false,
    depth: 0,
    data: {
      name,
      clinicalContext: finalContext,
      camUrl: cam.url,
      hasCamToken: Boolean(cam.token),
      negativeExclusions: str(body.negativeExclusions, 200) || 'medical staff, nurse, doctor, visitor',
      bedZone: sanitizeBox(body.bedZone) || DEFAULT_BED,
      visionClasses: sanitizeClasses(body.visionClasses) || [],
      latestBySource: {},
    },
  })
  // Secrets are server-only fields: set by trusted code, never readable via the API.
  await payload.update({ collection: 'rooms', id: room.id, overrideAccess: true, data: { padKey: newPadKey(), camToken: cam.token || '' } as never })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'ADD_ROOM',
    target: name,
    detail: `Added patient room (${finalContext.slice(0, 120)})`,
    level: 'INFO',
  })
  return json({ ok: true, room: toRoomDTO(room) })
})
