import test from 'node:test'
import assert from 'node:assert/strict'
import { load, mockFetch, resetEnv } from './helpers.mjs'

const wavLib = load('wav')
const sine = (ms, rate, amp = 0.3, hz = 220) => Float32Array.from({ length: Math.round((rate * ms) / 1000) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate))
const silence = (ms, rate) => new Float32Array(Math.round((rate * ms) / 1000))
const noise = (ms, rate, amp = 0.002) => Float32Array.from({ length: Math.round((rate * ms) / 1000) }, () => (Math.random() * 2 - 1) * amp)
const cat = (...a) => { const o = new Float32Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length } return o }

test('encodeWav16 output is exactly what Muse Voice Transcribe accepts', () => {
  const voice = load('voice')
  const wav = wavLib.encodeWav16(sine(1000, 16000), 16000)
  const r = voice.inspectWav(wav)
  assert.ok(r.ok, r.error)
  assert.equal(r.info.sampleRate, 16000)
  assert.equal(r.info.durationMs, 1000)
})

test('inspectWav rejects what the API would reject', () => {
  const { inspectWav } = load('voice')
  assert.equal(inspectWav(new Uint8Array(10)).ok, false)
  assert.match(inspectWav(wavLib.encodeWav16(sine(100, 44100), 44100)).error, /16 kHz or 24 kHz/)
  assert.match(inspectWav(new TextEncoder().encode('RIFF'.padEnd(60, 'x'))).error, /RIFF\/WAVE|fmt/)
  assert.match(inspectWav(wavLib.encodeWav16(new Float32Array(0), 16000)).error, /no audio|short/)
})

test('resampleTo: 48 kHz -> 16 kHz keeps length ratio and a low tone', () => {
  const out = wavLib.resampleTo(sine(500, 48000, 0.5, 200), 48000, 16000)
  assert.equal(out.length, 8000)
  const peak = Math.max(...out.map(Math.abs))
  assert.ok(peak > 0.45 && peak <= 0.52, String(peak))
})

test('SpeechSegmenter: one spoken phrase between silences yields exactly one utterance with pre-roll', () => {
  const rate = 48000
  const seg = new wavLib.SpeechSegmenter({ sampleRate: rate })
  const sig = cat(noise(1000, rate), sine(1500, rate), noise(1600, rate))
  const out = []
  for (let i = 0; i < sig.length; i += 128) out.push(...seg.push(sig.slice(i, i + 128))) // worklet-sized chunks
  assert.equal(out.length, 1)
  assert.ok(out[0].durationMs >= 1500 && out[0].durationMs <= 2300, String(out[0].durationMs))
  assert.equal(out[0].forced, false)
})

test('SpeechSegmenter: a click is ignored, two phrases yield two utterances, and a long monologue is cut at 12 s', () => {
  const rate = 16000
  const run = (sig) => { const s = new wavLib.SpeechSegmenter({ sampleRate: rate }); const o = []; for (let i = 0; i < sig.length; i += 128) o.push(...s.push(sig.slice(i, i + 128))); o.push(...s.flush()); return o }
  assert.equal(run(cat(noise(500, rate), sine(60, rate, 0.8), noise(2000, rate))).length, 0, 'click')
  assert.equal(run(cat(noise(500, rate), sine(800, rate), noise(1500, rate), sine(800, rate), noise(1500, rate))).length, 2, 'two phrases')
  const long = run(cat(noise(300, rate), sine(30_000, rate)))
  assert.ok(long.length >= 3 && long[0].forced, `long monologue segments: ${long.length}`)
  assert.ok(long.every((s) => s.durationMs <= 12_400))
})

test('SpeechSegmenter.flush returns an utterance still in progress (Stop pressed mid-sentence)', () => {
  const rate = 16000
  const s = new wavLib.SpeechSegmenter({ sampleRate: rate })
  const sig = cat(noise(400, rate), sine(900, rate))
  const out = []
  for (let i = 0; i < sig.length; i += 128) out.push(...s.push(sig.slice(i, i + 128)))
  assert.equal(out.length, 0)
  assert.equal(s.flush().length, 1)
})

test('transcribeWav sends exactly the documented request and parses the response', async () => {
  resetEnv(); process.env.MODEL_API_KEY = 'k'
  const voice = load('voice')
  const m = mockFetch(() => ({ body: { sessionId: 's1', transcript: ' Au secours, je suis tombé ', audioDurationMs: 1000, turns: [] } }))
  try {
    const wav = wavLib.encodeWav16(sine(1000, 16000), 16000)
    const r = await voice.transcribeWav(wav, { languages: ['ar', 'fr', 'en', 'xx'] })
    assert.ok(r.ok, r.error)
    assert.equal(r.transcript, 'Au secours, je suis tombé')
    const c = m.calls[0]
    assert.match(c.url, /^https:\/\/api\.meta\.ai\/v1\/asr\/transcribe\?sessionId=/)
    assert.equal(c.method, 'POST')
    assert.equal(c.headers.Authorization, 'Bearer k')
    assert.match(c.headers['Content-Type'], /^multipart\/form-data; boundary=/)
    const text = Buffer.from(c.body).toString('latin1')
    assert.match(text, /name="request"\r\nContent-Type: application\/json\r\n\r\n/)
    const req = JSON.parse(text.split('name="request"')[1].split('\r\n\r\n')[1].split('\r\n--')[0])
    assert.deepEqual({ ...req, keywords: undefined }, { model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', languageBias: ['Arabic', 'French', 'English'], keywords: undefined })
    assert.match(text, /name="audio"; filename="utterance\.wav"\r\nContent-Type: audio\/wav\r\n\r\nRIFF/)
  } finally { m.restore() }
})

test('transcribeWav: retryable only for 429/5xx, never sends invalid audio, and respects the off switch', async () => {
  resetEnv(); process.env.MODEL_API_KEY = 'k'
  const voice = load('voice')
  const wav = wavLib.encodeWav16(sine(500, 16000), 16000)
  let status = 429
  const m = mockFetch(() => ({ status, body: { error: 'x' } }))
  try {
    assert.equal((await voice.transcribeWav(wav)).retryable, true)
    status = 400
    assert.equal((await voice.transcribeWav(wav)).retryable, false)
    const before = m.calls.length
    const bad = await voice.transcribeWav(new Uint8Array(100))
    assert.equal(bad.ok, false)
    assert.equal(m.calls.length, before, 'invalid audio is rejected locally')
    process.env.VOICE_MODE = 'off'
    assert.equal((await voice.transcribeWav(wav)).status, 503)
  } finally { m.restore() }
})

// ───────── Muse Wonder ─────────
const facts = { frames_analyzed: 8, patient_visible: true, patient_out_of_bed: true, patient_lock: 'continuity', staff_co_present_near_bed: false, tracks: [{ track_id: 'p#1', resolved_role: 'ORIGIN_LOCKED_PATIENT' }] }
const wonderReply = (o) => ({ body: { output: [{ type: 'reasoning', content: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(o) }] }], usage: { total_tokens: 3100 } } })

test('shouldAssess: gated mode only pays for Wonder when something needs a second look', () => {
  const { shouldAssess } = load('wonder')
  const calm = { ...facts, patient_out_of_bed: false }
  assert.equal(shouldAssess(calm, 'routine', 'gated'), false)
  assert.equal(shouldAssess(facts, 'YELLOW', 'gated'), true)
  assert.equal(shouldAssess({ ...calm, patient_visible: false }, 'routine', 'gated'), true)
  assert.equal(shouldAssess({ ...calm, tracks: [{ resolved_role: 'UNRESOLVED_PERSON' }] }, 'routine', 'gated'), true)
  assert.equal(shouldAssess(calm, 'routine', 'always'), true)
  assert.equal(shouldAssess(facts, 'RED', 'off'), false)
})

test('wonderAssess: Responses API request shape, video by file_id, JSON parsed from output[].content[]', async () => {
  resetEnv(); process.env.MODEL_API_KEY = 'k'
  const { wonderAssess } = load('wonder'); const rules = load('rules')
  const floor = rules.visionRules(facts, 'frail, fall risk', 'Room 4')
  const m = mockFetch(() => wonderReply({ level: 'RED', headline: 'Patient on floor', reason: 'Collapsed beside bed', nurse_action: 'Go now', observations: { patient_posture: 'on_floor', staff_hands_on: false, telemetry_agrees: true } }))
  try {
    const r = await wonderAssess({ roomId: '1', roomName: 'Room 4', ctx: 'frail, fall risk', media: { fileId: 'file-abc123' }, facts, floor })
    assert.ok(r.ok, r.error)
    assert.equal(r.outcome.level, 'RED'); assert.equal(r.outcome.engine, 'wonder'); assert.equal(r.outcome.observations.patient_posture, 'on_floor'); assert.equal(r.outcome.tokens, '3100')
    const c = m.calls[0]; const b = JSON.parse(c.body)
    assert.equal(c.url, 'https://api.meta.ai/v1/responses')
    assert.equal(b.model, 'muse-wonder-1.0'); assert.deepEqual(b.reasoning, { effort: 'low' }); assert.ok(b.max_output_tokens >= 2000)
    assert.equal(b.input[0].role, 'developer')
    assert.deepEqual(b.input[1].content[1], { type: 'input_video', file_id: 'file-abc123' })
    assert.match(b.input[1].content[0].text, /<telemetry>/)
  } finally { m.restore() }
})

test('wonderAssess: cannot lower the rules floor, and says so', async () => {
  resetEnv(); process.env.MODEL_API_KEY = 'k'
  const { wonderAssess } = load('wonder'); const floor = load('rules').visionRules(facts, 'fall risk', 'Room 4') // RED floor
  const m = mockFetch(() => wonderReply({ level: 'routine', headline: 'Resting', reason: 'looks fine', nurse_action: 'none', observations: {} }))
  try {
    const r = await wonderAssess({ roomId: '1', roomName: 'R', ctx: '', media: { fileId: 'f' }, facts, floor })
    assert.equal(r.outcome.level, 'RED'); assert.equal(r.outcome.floored, true)
  } finally { m.restore() }
})

test('wonderAssess: per-room rate limit and circuit breaker after repeated failures', async () => {
  resetEnv(); process.env.MODEL_API_KEY = 'k'; process.env.WONDER_MIN_INTERVAL_SEC = '5'
  const { wonderAssess, wonderSkipReason } = load('wonder'); const floor = load('rules').visionRules(facts, '', 'R')
  const m = mockFetch(() => ({ status: 500, body: { error: 'boom' } }))
  try {
    const args = (id) => ({ roomId: id, roomName: 'R', ctx: '', media: { fileId: 'f' }, facts, floor })
    assert.equal((await wonderAssess(args('a'))).status, 500)
    assert.match(wonderSkipReason('a'), /rate-limited/, 'same room immediately again')
    assert.equal((await wonderAssess(args('b'))).status, 500)
    assert.equal((await wonderAssess(args('c'))).status, 500) // 3rd failure trips the breaker
    assert.match(wonderSkipReason('d'), /paused/)
    assert.equal(m.calls.length, 3, 'no calls while paused')
  } finally { m.restore() }
})

test('wonder: Contributor model and WONDER_MODE=off disable it', () => {
  resetEnv(); process.env.MODEL_API_KEY = 'k'
  const meta = load('meta')
  assert.equal(meta.wonderEnabled(), true)
  process.env.WONDER_MODE = 'off'; assert.equal(meta.wonderEnabled(), false)
  process.env.WONDER_MODE = 'gated'; process.env.WONDER_MODEL = 'muse-wonder-1.0-contributor'; assert.equal(meta.wonderEnabled(), false)
})
