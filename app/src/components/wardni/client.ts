'use client'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const SIGNED_OUT_EVENT = 'wardni:signed-out'

/** JSON fetch helper for /ward-api routes. Surfaces server error messages; flags session expiry. */
export async function api<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers || {}) }
  let body: BodyInit | undefined = opts.raw
  if (opts.body !== undefined && !opts.raw) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body, cache: 'no-store', signal: opts.signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Network error — the server is unreachable.')
  }
  let data: Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
  if (!res.ok) throw new ApiError(res.status, String(data.error || `Request failed (HTTP ${res.status})`))
  return data as T
}
