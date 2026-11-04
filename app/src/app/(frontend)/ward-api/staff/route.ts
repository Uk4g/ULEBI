import { getPayloadClient } from '@/lib/payload'
import { computeUsageSummary } from '@/lib/wardni/analytics'
import { getAccessRequests, getRuntimeConfig, persistExtendedSettings, recordAudit, removeAccessRequest, toEventDTO } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'
import { apiLogs } from '@/lib/wardni/meta'
import type { StaffRole } from '@/lib/wardni/types'

const parseRole = (r: unknown): StaffRole => (r === 'admin' ? 'admin' : r === 'charge_nurse' ? 'charge_nurse' : 'nurse')

export const GET = handle(async (req) => {
  await requireStaff(req, { admin: true })
  const payload = await getPayloadClient()
  const [res, events] = await Promise.all([
    payload.find({ collection: 'users', limit: 100, depth: 0, sort: 'name', overrideAccess: true }),
    payload.find({ collection: 'ward-events', limit: 150, depth: 0, sort: '-createdAt', overrideAccess: true }),
  ])
  const cfg = getRuntimeConfig()
  const usage = computeUsageSummary({
    events: events.docs.map(toEventDTO),
    apiLogs: apiLogs(120),
    budgetLimitUsd: cfg.budgetLimitUsd,
    pricing: cfg.pricing,
  })

  return json({
    ok: true,
    staff: res.docs.map((u) => {
      const name = String((u as { name?: string }).name || u.email)
      const actorStats = usage.byActor[name] || { requests: 0, tokens: 0, costUsd: 0 }
      return {
        id: String(u.id),
        name,
        email: u.email,
        role: parseRole((u as { role?: string }).role),
        tokens: actorStats.tokens,
        spendUsd: actorStats.costUsd,
        requests: actorStats.requests,
      }
    }),
    accessRequests: getAccessRequests(),
  })
})

export const POST = handle(async (req) => {
  const user = await requireStaff(req, { admin: true })
  const body = await readJson(req, 8 * 1024)
  const payload = await getPayloadClient()

  if (body.dismissRequestId) {
    removeAccessRequest(String(body.dismissRequestId))
    await persistExtendedSettings(payload, {})
    return json({ ok: true })
  }

  const name = str(body.name, 80)
  const email = str(body.email, 200).toLowerCase()
  const password = String(body.password || '')
  const role = parseRole(body.role)
  if (!name || !email) return fail(400, 'Name and email are required.')
  if (password.length < 8) return fail(400, 'Password must be at least 8 characters.')
  await payload.create({ collection: 'users', data: { name, email, password, role }, overrideAccess: true })
  if (body.approveRequestId) {
    removeAccessRequest(String(body.approveRequestId))
  }
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'CREATE_STAFF_ACCOUNT',
    target: `${name} (${email})`,
    detail: `Created workstation account with role ${role.toUpperCase()}`,
    level: 'INFO',
  })
  await persistExtendedSettings(payload, {})
  return json({ ok: true })
})
