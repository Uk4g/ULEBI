import { fail, handle, json, readJson, requireStaff } from '@/lib/wardni/http'
import { sparkLive } from '@/lib/wardni/meta'
import { locatePatient } from '@/lib/wardni/triage'

export const POST = handle(async (req) => {
  await requireStaff(req)
  if (!sparkLive()) return fail(503, 'Muse Spark is not LIVE. Patient photo lock needs a verified Meta API key.')
  const body = await readJson<Record<string, unknown>>(req, 16 * 1024 * 1024)
  const ref = String(body.referencePhotoDataUrl || '')
  const frame = String(body.frameZeroDataUrl || '')
  if (!ref.startsWith('data:image/') || !frame.startsWith('data:image/')) return fail(400, 'Reference photo and Frame-0 snapshot are both required.')
  const r = await locatePatient(ref, frame, body.bedZone)
  if (!r.ok) return fail(502, r.error)
  return json(r)
})
