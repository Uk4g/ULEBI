import { fail, handle, json, requireStaff } from '@/lib/wardni/http'
import { voiceEnabled } from '@/lib/wardni/meta'
import { inspectWav, MAX_WAV_BYTES, transcribeWav } from '@/lib/wardni/voice'

export const dynamic = 'force-dynamic'

/**
 * Stage 1 of the chain: bedside audio → Muse Voice Transcribe → text.
 * The browser records one utterance (VAD-segmented, 16 kHz mono PCM16 WAV) and posts it here; the API key stays on
 * the server and the audio is never stored by Wardni. The transcript is then ranked by /ward-api/triage (Muse Spark).
 *
 * Query: ?lang=en,fr,ar (hint order = priority; Algerian wards code-switch) &room=<id> (correlation only).
 */
export const POST = handle(async (req) => {
  await requireStaff(req)
  if (!voiceEnabled()) return fail(503, 'Muse Voice Transcribe is not configured on this server.')
  if (Number(req.headers.get('content-length') || 0) > MAX_WAV_BYTES) return fail(413, 'Utterance is too large.')
  const buf = new Uint8Array(await req.arrayBuffer())
  if (buf.length > MAX_WAV_BYTES) return fail(413, 'Utterance is too large.')
  const check = inspectWav(buf)
  if (!check.ok) return fail(400, check.error)

  const url = new URL(req.url)
  const languages = (url.searchParams.get('lang') || 'en,fr,ar').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 3)
  const room = (url.searchParams.get('room') || '').replace(/[^\w-]/g, '').slice(0, 24)

  let r = await transcribeWav(buf, { languages, sessionId: `wardni-${room || 'ward'}-${Date.now().toString(36)}` })
  if (!r.ok && r.retryable) r = await transcribeWav(buf, { languages, sessionId: `wardni-${room || 'ward'}-${Date.now().toString(36)}r` })
  if (!r.ok) return fail(r.status >= 400 && r.status < 600 ? r.status : 502, r.error, { retryable: r.retryable })
  return json({ ok: true, transcript: r.transcript, audioMs: r.audioMs, sessionId: r.sessionId, latencyMs: r.latencyMs })
})
