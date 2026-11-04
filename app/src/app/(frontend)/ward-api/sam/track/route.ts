import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'
import { samLive, samTrack } from '@/lib/wardni/meta'
import { exemplarPhrase } from '@/lib/wardni/triage'

export const POST = handle(async (req) => {
  await requireStaff(req)
  if (!samLive()) return fail(503, 'SAM 3.1 is not LIVE. Vision analysis needs a verified Meta API key.')
  const body = await readJson<Record<string, unknown>>(req, 14 * 1024 * 1024)
  const maskEncoding = body.maskEncoding === 'lossless' ? 'lossless' : 'one_bit'
  let mediaPart: Record<string, unknown> | null = null
  const vp = body.videoPart as { file_id?: unknown } | undefined
  if (vp && typeof vp.file_id === 'string' && /^[\w.-]{1,200}$/.test(vp.file_id)) {
    mediaPart = { type: 'input_video', file_id: vp.file_id }
  } else if (typeof body.imageDataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.imageDataUrl)) {
    mediaPart = { type: 'input_image', image_url: body.imageDataUrl }
  }
  if (!mediaPart) return fail(400, 'Missing video file id or image snapshot.')

  let prompt = str(body.promptText, 2000) || 'patient in bed'
  const crop = typeof body.exemplarCropDataUrl === 'string' && body.exemplarCropDataUrl.startsWith('data:image/') ? body.exemplarCropDataUrl : null
  if (crop && !prompt.startsWith('<0f>')) {
    const phrase = await exemplarPhrase(crop, prompt)
    if (phrase) prompt = phrase
  }
  const r = await samTrack(prompt, mediaPart, maskEncoding)
  if (!r.ok) return fail(r.status >= 400 && r.status < 600 ? r.status : 502, r.error)
  return json({ ok: true, wire: r.wire, resolvedPrompt: prompt, ttftMs: r.ttftMs, totalMs: r.totalMs })
})
