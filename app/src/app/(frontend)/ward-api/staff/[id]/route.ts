import { getPayloadClient } from '@/lib/payload'
import { persistExtendedSettings, recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'
import type { StaffRole } from '@/lib/wardni/types'

const parseRole = (r: unknown): StaffRole => (r === 'admin' ? 'admin' : r === 'charge_nurse' ? 'charge_nurse' : 'nurse')

export const PATCH = handle(async (req, ctx) => {
  const user = await requireStaff(req, { admin: true })
  const { id } = await ctx.params
  const body = await readJson(req, 8 * 1024)
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const n = str(body.name, 80)
    if (!n) return fail(400, 'Name cannot be empty.')
    data.name = n
  }
  if (body.role !== undefined) {
    data.role = parseRole(body.role)
  }
  if (body.password !== undefined && String(body.password).length > 0) {
    if (String(body.password).length < 8) return fail(400, 'Password must be at least 8 characters.')
    data.password = String(body.password)
  }
  if (!Object.keys(data).length) return fail(400, 'Nothing to update.')
  const payload = await getPayloadClient()
  const updated = await payload.update({ collection: 'users', id, data, overrideAccess: true })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'UPDATE_STAFF_ACCOUNT',
    target: String((updated as { name?: string }).name || id),
    detail: `Updated workstation account (${Object.keys(data).join(', ')})`,
    level: 'INFO',
  })
  await persistExtendedSettings(payload, {})
  return json({ ok: true })
})

export const DELETE = handle(async (req, ctx) => {
  const user = await requireStaff(req, { admin: true })
  const { id } = await ctx.params
  if (id === user.id) return fail(400, 'You cannot remove your own account.')
  const payload = await getPayloadClient()
  const target = await payload.findByID({ collection: 'users', id, overrideAccess: true }).catch(() => null)
  await payload.delete({ collection: 'users', id, overrideAccess: true })
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'REMOVE_STAFF_ACCOUNT',
    target: String((target as { name?: string } | null)?.name || id),
    detail: 'Removed workstation account',
    level: 'INFO',
  })
  await persistExtendedSettings(payload, {})
  return json({ ok: true })
})
