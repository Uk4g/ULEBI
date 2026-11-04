import { appAuth, DEMO_EMAIL } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { domainRestrictionMessage, emailDomainAllowed, testLoginEnabled } from '@/lib/wardni/access-domain'
import { fail, handle, json, readJson, sameOrigin, str } from '@/lib/wardni/http'

/** Counts real accounts. The shared demo account (created by earlier versions on first visit) never counts, otherwise a
 *  ward that ever ran in demo mode could never create a real admin from the setup screen. */
async function userCount() {
  const payload = await getPayloadClient()
  const { totalDocs } = await payload.count({ collection: 'users', where: { email: { not_equals: DEMO_EMAIL } }, overrideAccess: true })
  return totalDocs
}

/** Whether the ward has no accounts yet (first-run setup). */
export const GET = handle(async () => json({ needsBootstrap: !testLoginEnabled() && (await userCount()) === 0 }))

/** First-run only: creates the initial Ward Admin account, then signs it in. */
export const POST = handle(async (req) => {
  if (!sameOrigin(req)) return fail(403, 'Cross-origin request blocked.')
  if ((await userCount()) > 0) return fail(409, 'The ward is already set up. Ask a ward admin for an account.')
  const body = await readJson(req, 8 * 1024)
  const name = str(body.name, 80)
  const email = str(body.email, 200).toLowerCase()
  const password = String(body.password || '')
  if (!name || !email) return fail(400, 'Name and email are required.')
  if (!emailDomainAllowed(email)) return fail(403, domainRestrictionMessage())
  if (password.length < 8) return fail(400, 'Password must be at least 8 characters.')
  const payload = await getPayloadClient()
  // First-run setup happens before any app user exists, so it is a trusted system operation.
  await payload.create({ collection: 'users', overrideAccess: true, data: { name, email, password, role: 'admin' } })
  // Retire the passwordless demo admin now that a real admin exists.
  await payload.delete({ collection: 'users', where: { email: { equals: DEMO_EMAIL } }, overrideAccess: true }).catch(() => undefined)
  await appAuth.login(email, password)
  return json({ ok: true })
})
