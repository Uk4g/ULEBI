import { getPayloadClient } from '@/lib/payload'
import { recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'

export const POST = handle(async (req) => {
  const user = await requireStaff(req, { chargeOrAdmin: true })
  const body = await readJson(req, 8 * 1024)
  const name = str(body.name, 80)
  if (!name) return fail(400, 'Nurse name is required.')
  const role = str(body.role, 60) || 'Ward RN'
  const payload = await getPayloadClient()
  const last = await payload.find({ collection: 'nurses', sort: '-callOrder', limit: 1, depth: 0, user: user.doc as never, overrideAccess: false })
  const callOrder = (Number((last.docs[0] as { callOrder?: number } | undefined)?.callOrder) || 0) + 1
  await payload.create({
    collection: 'nurses',
    data: { name, role, onDuty: true, callOrder },
    user: user.doc as never,
    overrideAccess: false,
  })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'ADD_ROSTER_NURSE',
    target: name,
    detail: `Added ${name} (${role}) to shift roster at #${callOrder}`,
    level: 'INFO',
  })
  return json({ ok: true })
})
