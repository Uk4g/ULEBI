import { getPayloadClient } from '@/lib/payload'
import { recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff } from '@/lib/wardni/http'

export const PATCH = handle(async (req, ctx) => {
  const user = await requireStaff(req)
  const { id } = await ctx.params
  const body = await readJson(req, 8 * 1024)
  const data: Record<string, unknown> = {}
  if (typeof body.onDuty === 'boolean') data.onDuty = body.onDuty
  if (Number.isFinite(body.callOrder)) {
    if (user.role !== 'admin' && user.role !== 'charge_nurse') {
      return fail(403, 'Only Charge Nurses or Ward Admins can reorder the shift roster.')
    }
    data.callOrder = Number(body.callOrder)
  }
  if (!Object.keys(data).length) return fail(400, 'Nothing to update.')
  const payload = await getPayloadClient()
  const updated = await payload.update({ collection: 'nurses', id, data, user: user.doc as never, overrideAccess: false })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'UPDATE_ROSTER_NURSE',
    target: String((updated as { name?: string }).name || id),
    detail:
      typeof body.onDuty === 'boolean'
        ? `Set duty status to ${body.onDuty ? 'ON DUTY' : 'OFF DUTY'}`
        : `Updated roster call priority order to #${body.callOrder}`,
    level: 'INFO',
  })
  return json({ ok: true })
})

export const DELETE = handle(async (req, ctx) => {
  const user = await requireStaff(req, { chargeOrAdmin: true })
  const { id } = await ctx.params
  const payload = await getPayloadClient()
  const target = await payload.findByID({ collection: 'nurses', id, overrideAccess: true }).catch(() => null)
  await payload.delete({ collection: 'nurses', id, user: user.doc as never, overrideAccess: false })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'REMOVE_ROSTER_NURSE',
    target: String((target as { name?: string } | null)?.name || id),
    detail: 'Removed nurse from shift roster',
    level: 'INFO',
  })
  return json({ ok: true })
})
