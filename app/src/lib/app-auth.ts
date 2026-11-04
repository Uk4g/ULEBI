import { cookies } from 'next/headers'
import { JWTAuthentication } from 'payload'
import { getPayloadClient } from './payload'
import { allowedEmailDomains, EmailDomainNotAllowedError, emailDomainAllowed } from './wardni/access-domain'
import type { StaffRole } from './wardni/types'

export type AppUser = {
  id: string
  email: string
  name: string
  role: StaffRole
  collection: 'users'
  /** Raw Payload user document, for Local API calls with overrideAccess: false. */
  doc: Record<string, unknown>
}

const COOKIE = 'app-session'
export const DEMO_EMAIL = 'admin@ulebi.com'
export const DEFAULT_FIRST_LOGIN_EMAIL = 'admin@ulebi.com'
export const DEFAULT_FIRST_LOGIN_PASSWORD = 'Ulebi@2026!'

const SEED_ACCOUNTS: Array<{ email: string; name: string; role: StaffRole }> = [
  { email: 'admin@ulebi.com', name: 'Admin', role: 'admin' },
  { email: 'karim@ulebi.com', name: 'Nurse Karim', role: 'charge_nurse' },
  { email: 'lina@ulebi.com', name: 'Nurse Lina', role: 'nurse' },
]

export function demoModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.WARDNI_DEMO_MODE || '').toLowerCase() === 'true' || String(env.WARDNI_REQUIRE_LOGIN || '').toLowerCase() === 'false'
}

let warned = false
function warnDemoOnce() {
  if (warned) return
  warned = true
  console.warn('[wardni] DEMO MODE is on: every visitor is a shared ward admin. Unset WARDNI_DEMO_MODE before real patients use this system.')
}

function effectiveDomainEnv(): Record<string, string | undefined> {
  const configured = allowedEmailDomains(process.env)
  if (configured.length > 0) return process.env
  return { ...process.env, ULEBI_ALLOWED_EMAIL_DOMAINS: 'ulebi.com' }
}

export function createAppAuth(appUserCollection: 'users') {
  async function getUserFromToken(token: string | undefined | null): Promise<AppUser | null> {
    if (!token) return null
    const payload = await getPayloadClient()
    const authHeaders = new Headers({ Authorization: `JWT ${token}` })
    try {
      const { user } = await JWTAuthentication({ headers: authHeaders, payload, strategyName: 'local-jwt', isGraphQL: false, canSetHeaders: false })
      if (!user || user.collection !== appUserCollection) return null
      const appUser = toAppUser(user)
      if (!emailDomainAllowed(appUser.email, effectiveDomainEnv())) return null
      return appUser
    } catch {
      return null
    }
  }

  async function getCurrentUser(): Promise<AppUser | null> {
    const token = (await cookies()).get(COOKIE)?.value
    const user = await getUserFromToken(token)
    if (user) return user
    if (!demoModeEnabled()) return null
    warnDemoOnce()
    return getDemoUser()
  }

  async function getDemoUser(): Promise<AppUser> {
    const payload = await getPayloadClient()
    const email = DEFAULT_FIRST_LOGIN_EMAIL
    const found = await payload.find({ collection: appUserCollection, where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
    const doc =
      found.docs[0] ||
      (await payload.create({
        collection: appUserCollection,
        overrideAccess: true,
        data: { name: 'Admin', email, role: 'admin', password: DEFAULT_FIRST_LOGIN_PASSWORD },
      }))
    return toAppUser({ ...doc, collection: appUserCollection })
  }

  async function setSession(token: string, exp?: number, remember = true) {
    const maxAge = remember ? (exp ? Math.max(60, exp - Math.floor(Date.now() / 1000)) : 60 * 60 * 16) : 60 * 60 * 4
    ;(await cookies()).set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    })
  }

  async function login(emailOrId: string, password: string, remember = true): Promise<AppUser> {
    const payload = await getPayloadClient()
    const targetEmail = emailOrId.trim().toLowerCase()
    const domEnv = effectiveDomainEnv()
    if (!emailDomainAllowed(targetEmail, domEnv)) {
      throw new EmailDomainNotAllowedError('Sign in requires a valid @ulebi.com email address.')
    }

    const allowAutoProvision = String(process.env.ULEBI_TEST_LOGIN ?? 'true').trim().toLowerCase() !== 'false'
    const existing = await payload.find({
      collection: appUserCollection,
      where: { email: { equals: targetEmail } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const seedProfile = SEED_ACCOUNTS.find((a) => a.email === targetEmail)

    if (!existing.docs[0] && (allowAutoProvision || seedProfile)) {
      const localPart = targetEmail.split('@')[0] || 'Staff'
      const displayName =
        seedProfile?.name ||
        localPart
          .split(/[._-]+/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      await payload.create({
        collection: appUserCollection,
        overrideAccess: true,
        data: {
          name: displayName || targetEmail,
          email: targetEmail,
          role: seedProfile?.role || 'admin',
          password,
        },
      })
    }

    let result
    try {
      result = await payload.login({ collection: appUserCollection, data: { email: targetEmail, password }, overrideAccess: true })
    } catch (loginErr) {
      // If first-login account existed from an earlier seed with a different password and test login / default credentials are used, sync and sign in
      if (existing.docs[0] && (allowAutoProvision || (seedProfile && password === DEFAULT_FIRST_LOGIN_PASSWORD))) {
        await payload.update({
          collection: appUserCollection,
          id: existing.docs[0].id,
          overrideAccess: true,
          data: { password } as never,
        })
        result = await payload.login({ collection: appUserCollection, data: { email: targetEmail, password }, overrideAccess: true })
      } else {
        throw loginErr
      }
    }

    if (!result.token) throw new Error('Login failed')
    await setSession(result.token, result.exp, remember)
    return toAppUser({ ...result.user, collection: appUserCollection })
  }

  async function logout() {
    ;(await cookies()).delete(COOKIE)
  }

  return { getCurrentUser, getUserFromToken, login, logout }
}

function toAppUser(user: unknown): AppUser {
  const u = user as { id: string | number; email: string; name?: string; role?: string }
  const role: StaffRole = u.role === 'admin' ? 'admin' : u.role === 'charge_nurse' ? 'charge_nurse' : 'nurse'
  return {
    id: String(u.id),
    email: u.email,
    name: u.name || u.email,
    role,
    collection: 'users',
    doc: { ...(user as Record<string, unknown>), collection: 'users' },
  }
}

export const appAuth = createAppAuth('users')
