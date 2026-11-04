import { getPayloadClient } from '@/lib/payload'
import { findRoom } from '@/lib/wardni/engine'
import { fail, handle, requireStaff } from '@/lib/wardni/http'
import { validateCameraTarget } from '@/lib/wardni/ssrf'

export const dynamic = 'force-dynamic'

/**
 * Authenticated camera relay. Supports MJPEG/MP4 passthrough and HLS: playlists are rewritten so
 * every variant/segment/key URI is fetched back through this relay (same camera origin only).
 */
export const GET = handle(async (req, ctx) => {
  await requireStaff(req)
  const { roomId } = await ctx.params
  const payload = await getPayloadClient()
  const room = await findRoom(payload, roomId)
  if (!room?.camUrl) return fail(404, 'No camera registered for this room.')

  const base = new URL(room.camUrl)
  const sub = new URL(req.url).searchParams.get('u')
  let target: URL
  try {
    target = sub ? new URL(sub) : base
  } catch {
    return fail(400, 'Invalid stream path.')
  }
  if (target.origin !== base.origin) return fail(403, 'Stream path must stay on the registered camera host.')
  const check = await validateCameraTarget(target.toString())
  if (!check.ok) return fail(403, check.reason)

  const headers: Record<string, string> = {}
  const tok = room.camToken || ''
  if (tok) headers.Authorization = /^(Basic|Bearer) /.test(tok) ? tok : `Bearer ${tok}`

  // Aborts the upstream stream (e.g. endless MJPEG) as soon as the viewer disconnects.
  const upstream = await fetch(target, { headers, redirect: 'error', signal: req.signal })
  const ct = upstream.headers.get('content-type') || 'application/octet-stream'
  const isPlaylist = /mpegurl/i.test(ct) || /\.m3u8$/i.test(target.pathname)
  const proxify = (raw: string) => {
    try {
      const abs = new URL(raw, target)
      return `/ward-api/cam/${encodeURIComponent(roomId)}?u=${encodeURIComponent(abs.toString())}`
    } catch {
      return raw
    }
  }
  if (isPlaylist && upstream.ok) {
    const text = await upstream.text()
    const rewritten = text
      .split(/\r?\n/)
      .map((line) => {
        const t = line.trim()
        if (!t) return line
        if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxify(u)}"`)
        return proxify(t)
      })
      .join('\n')
    return new Response(rewritten, { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' } })
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': ct, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
})
