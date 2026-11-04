import { appAuth, type AppUser } from '@/lib/app-auth'

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status)

/**
 * Same-origin check for state-changing requests. Compares the Origin host with the forwarded/actual
 * host only (not the scheme), so it works behind TLS-terminating proxies.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || req.headers.get('referer')
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  const candidates = [req.headers.get('x-forwarded-host'), req.headers.get('host')]
    .flatMap((h) => (h ? h.split(',') : []))
    .map((h) => h.trim().toLowerCase())
  const pub = process.env.NEXT_PUBLIC_SITE_URL
  if (pub) {
    try {
      candidates.push(new URL(pub).host.toLowerCase())
    } catch {
      /* ignore */
    }
  }
  return candidates.includes(originHost)
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 2 * 1024 * 1024): Promise<T> {
  const len = Number(req.headers.get('content-length') || 0)
  if (len > maxBytes) throw new HttpError(413, 'Request body too large.')
  const text = await req.text()
  if (text.length > maxBytes) throw new HttpError(413, 'Request body too large.')
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON body.')
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Resolves the signed-in workstation user or throws 401; enforces same-origin on writes. */
export async function requireStaff(req: Request, opts: { admin?: boolean; chargeOrAdmin?: boolean } = {}): Promise<AppUser> {
  if (req.method !== 'GET' && !sameOrigin(req)) throw new HttpError(403, 'Cross-origin request blocked.')
  const user = await appAuth.getCurrentUser()
  if (!user) throw new HttpError(401, 'Signed out. Sign in to the workstation again.')
  if (opts.admin && user.role !== 'admin') throw new HttpError(403, 'Ward admin role required.')
  if (opts.chargeOrAdmin && user.role !== 'admin' && user.role !== 'charge_nurse') {
    throw new HttpError(403, 'Charge nurse or ward admin role required.')
  }
  return user
}

export function handle(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx)
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message)
      const e = err as { status?: number; message?: string; data?: { errors?: { message?: string }[] } }
      if (e?.status && e.status >= 400 && e.status < 500) {
        return fail(e.status, e.data?.errors?.[0]?.message || e.message || 'Request rejected.')
      }
      console.error('[wardni]', err)
      return fail(500, 'Server error. The event was not processed — check the server log.')
    }
  }
}

export const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
