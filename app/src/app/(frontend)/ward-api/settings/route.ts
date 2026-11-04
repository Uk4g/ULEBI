import { getPayloadClient } from '@/lib/payload'
import { getRuntimeConfig, persistExtendedSettings, recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff } from '@/lib/wardni/http'
import type { ModelKey } from '@/lib/wardni/types'

export const POST = handle(async (req) => {
  const user = await requireStaff(req)
  const body = await readJson(req, 8 * 1024)
  const payload = await getPayloadClient()
  const cfg = getRuntimeConfig()

  if (body.escalationTimeoutSec !== undefined) {
    if (user.role !== 'admin' && user.role !== 'charge_nurse') {
      return fail(403, 'Only Ward Admins or Charge Nurses can change the escalation step timeout.')
    }
    const sec = Math.round(Number(body.escalationTimeoutSec))
    if (!Number.isFinite(sec) || sec < 15 || sec > 300) return fail(400, 'Escalation step must be between 15 and 300 seconds.')
    await payload.updateGlobal({ slug: 'ward-settings', data: { escalationTimeoutSec: sec }, overrideAccess: true })
    recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'UPDATE_STEP_TIMEOUT',
      target: 'Ward Settings',
      detail: `Set nurse call step timeout to ${sec}s`,
      level: 'INFO',
    })
  }

  if (body.budgetLimitUsd !== undefined || body.budgetAlertThresholdPct !== undefined || body.pricing !== undefined) {
    if (user.role !== 'admin') return fail(403, 'Ward admin role required to edit budget limits and model pricing.')
    if (body.budgetLimitUsd !== undefined) {
      const lim = Number(body.budgetLimitUsd)
      if (!Number.isFinite(lim) || lim < 1 || lim > 100_000) return fail(400, 'Budget limit must be between $1 and $100,000.')
      cfg.budgetLimitUsd = lim
    }
    if (body.budgetAlertThresholdPct !== undefined) {
      const pct = Math.round(Number(body.budgetAlertThresholdPct))
      if (Number.isFinite(pct) && pct >= 10 && pct <= 100) cfg.budgetAlertThresholdPct = pct
    }
    if (body.pricing && typeof body.pricing === 'object') {
      const p = body.pricing as Record<string, unknown>
      for (const k of ['voice', 'sam', 'wonder', 'spark'] as ModelKey[]) {
        const v = Number(p[k])
        if (Number.isFinite(v) && v >= 0 && v <= 10) cfg.pricing[k] = v
      }
    }
    await persistExtendedSettings(payload, {})
    recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'UPDATE_BUDGET_LIMIT',
      target: 'Usage & Costs',
      detail: `Updated budget limit to $${cfg.budgetLimitUsd.toFixed(2)} (alert at ${cfg.budgetAlertThresholdPct}%)`,
      level: 'INFO',
    })
  }

  if (body.idleLockMinutes !== undefined) {
    const mins = Math.round(Number(body.idleLockMinutes))
    if (Number.isFinite(mins) && mins >= 0 && mins <= 480) {
      cfg.idleLockMinutes = mins
      await persistExtendedSettings(payload, {})
    }
  }

  return json({
    ok: true,
    escalationTimeoutSec: body.escalationTimeoutSec,
    budgetLimitUsd: cfg.budgetLimitUsd,
    budgetAlertThresholdPct: cfg.budgetAlertThresholdPct,
    idleLockMinutes: cfg.idleLockMinutes,
    pricing: cfg.pricing,
  })
})
