import { BASE, VOICE_MODEL, describeError, logApiCall, timedFetch, voiceEnabled, voiceKey } from './meta'

/**
 * Muse Voice Transcribe 1.0 — batch file endpoint.
 * Contract (https://dev.meta.ai/docs/api-reference/voice/transcribe, https://dev.meta.ai/docs/speech-to-text):
 *   POST {BASE}/asr/transcribe?sessionId=…   multipart/form-data
 *     part "request": JSON {model, audioEncoding:"WAV", mode:"PUSH_TO_TALK", languageBias?, keywords?}   (application/json)
 *     part "audio"  : mono, 16-bit integer PCM WAV at 16 kHz or 24 kHz, <= 10 min, <= 32 MB
 *   200 -> {sessionId, transcript, audioDurationMs, turns[]}
 * The browser never sees the API key: the client records short utterances and posts the WAV to /ward-api/voice/transcribe.
 */

export const MAX_WAV_BYTES = 2 * 1024 * 1024
export const MAX_UTTERANCE_MS = 60_000

/** The 25 languages the model lists; ULEBI only offers the three the ward speaks. */
export const LANGUAGES: Record<string, string> = { en: 'English', fr: 'French', ar: 'Arabic' }

/** Distress and nursing vocabulary the recognizer should not mishear (keyword biasing). */
export const DEFAULT_KEYWORDS = ['nurse', 'help', 'bathroom', 'pain', 'dizzy', 'au secours', 'infirmière', 'ممرضة', 'النجدة']

export type WavInfo = { sampleRate: number; durationMs: number; dataBytes: number }

/** Validates the exact WAV flavor the API accepts, so we fail fast with a clear message instead of a 400 from Meta. */
export function inspectWav(buf: Uint8Array): { ok: true; info: WavInfo } | { ok: false; error: string } {
  if (buf.length < 44) return { ok: false, error: 'Audio is too short to be a WAV file.' }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { ok: false, error: 'Audio must be a RIFF/WAVE file.' }
  let off = 12
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null
  let dataBytes = -1
  while (off + 8 <= buf.length) {
    const id = tag(off)
    const size = dv.getUint32(off + 4, true)
    if (id === 'fmt ' && off + 8 + 16 <= buf.length) {
      fmt = { format: dv.getUint16(off + 8, true), channels: dv.getUint16(off + 10, true), rate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) }
    } else if (id === 'data') {
      // Streaming encoders may write 0 or 0xFFFFFFFF as the size; trust the bytes actually present.
      dataBytes = size === 0 || size === 0xffffffff || off + 8 + size > buf.length ? buf.length - (off + 8) : size
      break
    }
    off += 8 + size + (size % 2)
  }
  if (!fmt) return { ok: false, error: 'WAV file has no fmt chunk.' }
  if (fmt.format !== 1 || fmt.bits !== 16) return { ok: false, error: 'WAV must be 16-bit integer PCM.' }
  if (fmt.channels !== 1) return { ok: false, error: 'WAV must be mono.' }
  if (fmt.rate !== 16000 && fmt.rate !== 24000) return { ok: false, error: 'WAV sample rate must be 16 kHz or 24 kHz.' }
  if (dataBytes <= 0) return { ok: false, error: 'WAV contains no audio.' }
  const durationMs = Math.round((dataBytes / 2 / fmt.rate) * 1000)
  if (durationMs > MAX_UTTERANCE_MS) return { ok: false, error: `Utterance is longer than ${MAX_UTTERANCE_MS / 1000} s.` }

  // Check for silent WAV: calculate RMS energy across 16-bit integer PCM samples
  const sampleCount = Math.floor(dataBytes / 2)
  if (sampleCount > 0) {
    let sumSq = 0
    let peak = 0
    // Sample up to 16,000 values evenly across the buffer to evaluate loudness without excessive overhead
    const step = Math.max(1, Math.floor(sampleCount / 16000))
    let checked = 0
    for (let i = 0; i < sampleCount; i += step) {
      const byteOffset = off + 8 + i * 2
      if (byteOffset + 1 < buf.length) {
        const val = Math.abs(dv.getInt16(byteOffset, true)) / 32768
        sumSq += val * val
        if (val > peak) peak = val
        checked++
      }
    }
    const rms = checked > 0 ? Math.sqrt(sumSq / checked) : 0
    if (rms < 0.0025 && peak < 0.015) {
      return { ok: false, error: `WAV audio is silent (RMS energy < 0.0025, peak ${(peak * 100).toFixed(1)}%). Silence is not sent to Muse Voice Transcribe.` }
    }
  }

  return { ok: true, info: { sampleRate: fmt.rate, durationMs, dataBytes } }
}

/** Builds the multipart body by hand so the `request` part is a plain application/json part exactly like the documented curl. */
export function buildTranscribeBody(wav: Uint8Array, request: Record<string, unknown>) {
  const boundary = `wardni${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
  const enc = new TextEncoder()
  const head = enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(request)}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="utterance.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
  )
  const tail = enc.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(head.length + wav.length + tail.length)
  body.set(head, 0)
  body.set(wav, head.length)
  body.set(tail, head.length + wav.length)
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

export type TranscribeResult =
  | { ok: true; transcript: string; audioMs: number; sessionId: string; latencyMs: number }
  | { ok: false; error: string; status: number; retryable: boolean }

export async function transcribeWav(wav: Uint8Array, opts: { languages?: string[]; keywords?: string[]; sessionId?: string } = {}): Promise<TranscribeResult> {
  if (!voiceEnabled()) return { ok: false, error: 'Muse Voice Transcribe is not configured.', status: 503, retryable: false }
  const check = inspectWav(wav)
  if (!check.ok) return { ok: false, error: check.error, status: 400, retryable: false }
  const languages = (opts.languages || []).map((l) => LANGUAGES[l] || l).filter((l, i, a) => Object.values(LANGUAGES).includes(l) && a.indexOf(l) === i)
  const request: Record<string, unknown> = {
    model: VOICE_MODEL(),
    audioEncoding: 'WAV',
    mode: 'PUSH_TO_TALK',
    keywords: (opts.keywords?.length ? opts.keywords : DEFAULT_KEYWORDS).slice(0, 30),
  }
  if (languages.length) request.languageBias = languages
  const { body, contentType } = buildTranscribeBody(wav, request)
  const sessionId = (opts.sessionId || `wardni-${Date.now().toString(36)}`).replace(/[^\w.-]/g, '').slice(0, 64)
  try {
    const { res, ms } = await timedFetch(
      `${BASE()}/asr/transcribe?sessionId=${encodeURIComponent(sessionId)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${voiceKey()}`, 'Content-Type': contentType, Accept: 'application/json' }, body: body as unknown as BodyInit },
      15_000,
    )
    const raw = await res.text()
    logApiCall({ model: VOICE_MODEL(), endpoint: 'POST /asr/transcribe', status: res.status, latencyMs: ms, note: `${check.info.durationMs} ms audio` })
    if (!res.ok) {
      // 429 and 5xx are worth one retry by the caller; 4xx means this audio will never succeed.
      return { ok: false, error: `Voice HTTP ${res.status}: ${raw.slice(0, 160)}`, status: res.status, retryable: res.status === 429 || res.status >= 500 }
    }
    let j: { transcript?: unknown; audioDurationMs?: unknown; sessionId?: unknown }
    try {
      j = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'Voice service returned a non-JSON body.', status: 502, retryable: true }
    }
    return {
      ok: true,
      transcript: String(j.transcript ?? '').trim().slice(0, 1500),
      audioMs: Number(j.audioDurationMs) || check.info.durationMs,
      sessionId: String(j.sessionId || sessionId),
      latencyMs: ms,
    }
  } catch (err) {
    logApiCall({ model: VOICE_MODEL(), endpoint: 'POST /asr/transcribe', status: 'ERR', latencyMs: 0, note: describeError(err) })
    return { ok: false, error: describeError(err), status: 504, retryable: true }
  }
}
