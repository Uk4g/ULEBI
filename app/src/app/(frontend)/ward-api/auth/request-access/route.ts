import { getPayloadClient } from '@/lib/payload'
import { domainRestrictionMessage, emailDomainAllowed } from '@/lib/wardni/access-domain'
import { addAccessRequest, persistExtendedSettings, recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, sameOrigin, str } from '@/lib/wardni/http'
import type { StaffRole } from '@/lib/wardni/types'

export const POST = handle(async (req) => {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin request blocked.')
  const body = await readJson(req, 8 * 1024)
  const type = body.type === 'reset' ? 'reset' : 'signup'
  const email = str(body.email, 200).toLowerCase()
  const name = str(body.name, 80) || email.split('@')[0] || 'Staff Member'
  const note = str(body.note, 200)
  const requestedRole: StaffRole = body.role === 'charge_nurse' ? 'charge_nurse' : body.role === 'admin' ? 'admin' : 'nurse'

  if (!email) return fail(400, 'Email or Staff ID is required.')
  if (type === 'signup' && !emailDomainAllowed(email)) return fail(403, domainRestrictionMessage())

  const item = addAccessRequest({
    name,
    email,
    requestedRole,
    note,
    type,
  })

  recordAudit({
    actorId: 'anonymous',
    actorName: name,
    actorRole: requestedRole,
    action: type === 'reset' ? 'PASSWORD_RESET_REQUEST' : 'ACCESS_REQUEST_SUBMITTED',
    target: email,
    detail: type === 'reset' ? `Requested password reset for ${email}` : `Requested ${requestedRole.toUpperCase()} workstation access (${email})`,
    level: 'INFO',
  })

  const payload = await getPayloadClient().catch(() => null)
  if (payload) await persistExtendedSettings(payload, {}).catch(() => undefined)

  return json({
    ok: true,
    request: item,
    message:
      type === 'reset'
        ? `Password reset request logged for ${email}. A reset link notification has been queued for the Ward Admin.`
        : `Access request submitted for ${name} (${email}). A Ward Admin can approve it in Staff Accounts.`,
  })
})
