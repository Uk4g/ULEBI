import { appAuth } from '@/lib/app-auth'
import { EmailDomainNotAllowedError } from '@/lib/wardni/access-domain'
import { recordAudit } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, sameOrigin, str } from '@/lib/wardni/http'

const g = globalThis as unknown as { __wardniLoginAttempts?: Map<string, { fails: number; lockUntil: number }> }

export const POST = handle(async (req) => {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin login rejected.')
  const body = await readJson(req, 8 * 1024)
  const email = str(body.email, 200).toLowerCase()
  const password = String(body.password || '')
  const remember = body.remember !== false
  if (!email || !password) return fail(400, 'Email / Staff ID and password are required.')
  if (password.length < 8) return fail(400, 'Password must be at least 8 characters.')

  const attempts = (g.__wardniLoginAttempts ||= new Map())
  const rec = attempts.get(email) || { fails: 0, lockUntil: 0 }
  if (rec.lockUntil > Date.now()) {
    const waitSec = Math.ceil((rec.lockUntil - Date.now()) / 1000)
    return fail(429, `Account locked after 5 failed attempts. Try again in ${waitSec}s.`, { locked: true, retryAfterSec: waitSec, attemptsLeft: 0 })
  }

  try {
    const user = await appAuth.login(email, password, remember)
    attempts.delete(email)
    recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'SIGN_IN',
      target: 'Ward Workstation',
      detail: `Signed in as ${user.role.toUpperCase()} (${remember ? 'Remember station' : 'Session only'})`,
      level: 'INFO',
    })
    return json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    // Wrong email domain is a policy block, not a bad password: no lockout counter, no hint whether the account exists.
    if (err instanceof EmailDomainNotAllowedError) return fail(403, err.message)
    const msg = String((err as Error)?.message || '')
    rec.fails += 1
    if (rec.fails >= 5 || /locked/i.test(msg)) {
      rec.lockUntil = Date.now() + 60_000
      attempts.set(email, rec)
      recordAudit({
        actorId: 'anonymous',
        actorName: email,
        actorRole: 'nurse',
        action: 'ACCOUNT_LOCKED',
        target: email,
        detail: 'Workstation account locked for 60s after 5 failed sign-in attempts.',
        level: 'YELLOW',
      })
      return fail(429, 'Too many failed attempts (5/5). This account is locked for 60 seconds.', { locked: true, retryAfterSec: 60, attemptsLeft: 0 })
    }
    attempts.set(email, rec)
    const left = Math.max(0, 5 - rec.fails)
    return fail(401, `Incorrect email/Staff ID or password (${left} attempt${left === 1 ? '' : 's'} remaining before lockout).`, { attemptsLeft: left })
  }
})
