/**
 * Optional email-domain allowlist for workstation accounts.
 *
 *   ULEBI_ALLOWED_EMAIL_DOMAINS=ulebi.com            -> only @ulebi.com accounts can sign in / request access
 *   ULEBI_ALLOWED_EMAIL_DOMAINS=ulebi.com,ulebi.org  -> several domains
 *   (unset or empty)                                 -> open: any account may sign in (testing mode)
 *
 * Staff-ID logins (no "@") are checked after they resolve to the account's email.
 */
export function allowedEmailDomains(env: Record<string, string | undefined> = process.env): string[] {
  return String(env.ULEBI_ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

export function emailDomainAllowed(email: string, env: Record<string, string | undefined> = process.env): boolean {
  const domains = allowedEmailDomains(env)
  if (domains.length === 0) return true
  const at = String(email || '').trim().toLowerCase().lastIndexOf('@')
  if (at < 1) return false
  return domains.includes(String(email).trim().toLowerCase().slice(at + 1))
}

export function domainRestrictionMessage(env: Record<string, string | undefined> = process.env): string {
  const list = allowedEmailDomains(env).map((d) => `@${d}`)
  return `Access is limited to ${list.join(' or ')} accounts.`
}

export class EmailDomainNotAllowedError extends Error {
  constructor(message = domainRestrictionMessage()) {
    super(message)
    this.name = 'EmailDomainNotAllowedError'
  }
}

/**
 * Testing convenience: ULEBI_TEST_LOGIN=true lets any "email + password (8+ chars)" sign in. A first-time email gets an
 * admin account created on the spot, so no setup form or approval is needed. Never enable this with real patients.
 */
export function testLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.ULEBI_TEST_LOGIN || '').trim().toLowerCase() === 'true'
}
