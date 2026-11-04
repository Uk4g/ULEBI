import { fail, handle, json, requireStaff } from '@/lib/wardni/http'
import { samLive, samUploadFile } from '@/lib/wardni/meta'

const MAX_BYTES = 40 * 1024 * 1024

export const POST = handle(async (req) => {
  await requireStaff(req)
  if (!samLive()) return fail(503, 'SAM 3.1 is not LIVE. Vision analysis needs a verified Meta API key.')
  const filename = String(req.headers.get('x-file-name') || 'clip.mp4').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const mime = String(req.headers.get('x-file-type') || 'video/mp4')
  if (/webm/i.test(mime) || /\.webm$/i.test(filename) || (!/mp4|quicktime/i.test(mime) && !/\.(mp4|mov)$/i.test(filename))) {
    return fail(400, 'SAM 3.1 accepts .mp4 or .mov only (.webm is rejected by the API).')
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return fail(413, 'Clip exceeds 40 MB. Use a 3.5 s slice.')
  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.length > MAX_BYTES) return fail(413, 'Clip exceeds 40 MB. Use a 3.5 s slice.')
  const up = await samUploadFile(buf, filename, mime)
  // No base64 video fallback: the client falls back to a single-frame snapshot instead.
  if (!up.ok) return fail(502, up.error)
  return json({ ok: true, videoPart: { type: 'input_video', file_id: up.fileId }, uploadMs: up.ms })
})
