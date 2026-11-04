import { appAuth } from '@/lib/app-auth'
import { recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, sameOrigin } from '@/lib/wardni/http'
import { setRuntimeKeys } from '@/lib/wardni/meta'

export const POST = handle(async (req) => {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin request blocked.')
  const user = await appAuth.getCurrentUser().catch(() => null)
  const body = await readJson(req, 4 * 1024).catch(() => ({} as Record<string, unknown>))
  if (body.clearSessionKeys !== false) {
    setRuntimeKeys({ model: '', sam: '', spark: '', voice: '', wonder: '' }, { replace: true })
  }
  if (user) {
    recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'LOCK_STATION',
      target: 'Ward Workstation',
      detail: 'Station locked and signed out (session keys cleared).',
      level: 'INFO',
    })
  }
  await appAuth.logout()
  return json({ ok: true })
})
