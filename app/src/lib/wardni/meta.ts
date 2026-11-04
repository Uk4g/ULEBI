import type { ApiLog, ApiStatus } from './types'

/**
 * Server-only client for the Meta Model API (https://dev.meta.ai/docs):
 *   - Muse Voice Transcribe 1.0  speech to text   (see voice.ts)
 *   - Muse Spark 1.3             text ranking      (this file + triage.ts)
 *   - Muse Wonder 1.0            movement/situation assessment from video (see wonder.ts)
 *   - SAM 3.1                    spatial tracking telemetry (this file)
 * Keys come exclusively from server environment variables or runtime in-memory session storage and never reach the browser.
 *
 * PRIVACY: Meta's "-contributor" model IDs let Meta train on your prompts. Patient audio, video and notes must
 * only ever go to Standard-mode model IDs, so any configured model ID containing "contributor" is refused.
 */

export const BASE = () => (process.env.META_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '')
const SPARK_BASE = () => (process.env.SPARK_BASE_URL || process.env.META_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '')
export const SPARK_MODEL = () => (process.env.SPARK_MODEL || 'muse-spark-1.3').trim()
export const SAM_MODEL = () => (process.env.SAM_MODEL || 'sam-3.1').trim()
export const WONDER_MODEL = () => (process.env.WONDER_MODEL || 'muse-wonder-1.0').trim()
export const VOICE_MODEL = () => (process.env.VOICE_MODEL || 'muse-voice-transcribe-1.0').trim()
/** off | gated (default: Wonder only runs when the cheap rules/SAM facts say something is worth a second look) | always */
export const WONDER_MODE = () => {
  const m = String(process.env.WONDER_MODE || 'gated').trim().toLowerCase()
  return m === 'off' || m === 'always' ? m : 'gated'
}
/**
 * Runtime keys, set from the dashboard Settings modal (POST /ward-api/settings/keys).
 * They live ONLY in this server process's memory: never written to .env, never
 * stored in the database, never logged, never sent to the browser. They are
 * lost on server restart — set the same keys in .env if they must survive one.
 * A runtime key overrides the matching .env key; clearing it falls back to .env.
 */
export type RuntimeKeys = { model?: string; sam?: string; spark?: string; voice?: string; wonder?: string }
const runtimeKeys: RuntimeKeys = {}
const cleanKey = (v: unknown) => String(v ?? '').trim().slice(0, 512)

export function setRuntimeKeys(input: RuntimeKeys, opts?: { replace?: boolean }) {
  const replace = opts?.replace === true
  for (const k of ['model', 'sam', 'spark', 'voice', 'wonder'] as const) {
    if (!replace && !(k in input)) continue
    const raw = input[k]
    if (raw === undefined && !replace) continue
    const v = cleanKey(raw)
    if (v) runtimeKeys[k] = v
    else delete runtimeKeys[k]
  }
  // Force an immediate re-verification with the updated keys on the next check.
  const s = store()
  s.verifying = null
  s.status = {
    ...s.status,
    state: 'NOT_CONFIGURED',
    checkedAt: null,
    samVerified: false,
    sparkVerified: false,
    samLatencyMs: null,
    sparkLatencyMs: null,
    samError: '',
    sparkError: '',
    voiceReady: false,
    lastError: '',
  }
}

/** Booleans + source only — never a key value. Safe to send to the browser. */
export function runtimeKeyStatus() {
  const resolveSrc = (rtSpecific: string | undefined, envSpecific: string | undefined) => {
    if (rtSpecific) return 'session'
    if (envSpecific) return 'env'
    if (runtimeKeys.model) return 'session'
    if (process.env.MODEL_API_KEY) return 'env'
    return 'unset'
  }
  return {
    model: runtimeKeys.model ? 'session' : process.env.MODEL_API_KEY ? 'env' : 'unset',
    sam: resolveSrc(runtimeKeys.sam, process.env.SAM_API_KEY),
    spark: resolveSrc(runtimeKeys.spark, process.env.SPARK_API_KEY),
    voice: resolveSrc(runtimeKeys.voice, process.env.VOICE_API_KEY),
    wonder: resolveSrc(runtimeKeys.wonder, process.env.WONDER_API_KEY),
  }
}
const samKey = () => (runtimeKeys.sam || process.env.SAM_API_KEY || runtimeKeys.model || process.env.MODEL_API_KEY || '').trim()
const sparkKey = () => (runtimeKeys.spark || process.env.SPARK_API_KEY || runtimeKeys.model || process.env.MODEL_API_KEY || '').trim()
export const wonderKey = () => (runtimeKeys.wonder || process.env.WONDER_API_KEY || runtimeKeys.model || process.env.MODEL_API_KEY || '').trim()
export const voiceKey = () => (runtimeKeys.voice || process.env.VOICE_API_KEY || runtimeKeys.model || process.env.MODEL_API_KEY || '').trim()

/** Returns an error message when any configured model could train on patient data (Contributor mode). */
export function modelPolicyError(): string {
  const bad = [SPARK_MODEL(), SAM_MODEL(), WONDER_MODEL(), VOICE_MODEL()].filter((m) => /contributor/i.test(m))
  return bad.length ? `Refusing Contributor-mode model(s) ${bad.join(', ')}: Meta may train on prompts, and ULEBI sends patient data. Use the Standard model IDs.` : ''
}
export const wonderEnabled = () => WONDER_MODE() !== 'off' && Boolean(wonderKey()) && !modelPolicyError()
export const voiceEnabled = () => String(process.env.VOICE_MODE || 'on').toLowerCase() !== 'off' && Boolean(voiceKey()) && !modelPolicyError()

const SPARK_TIMEOUT_MS = 20_000
const SAM_TIMEOUT_MS = 90_000
const RECHECK_AFTER_FAILURE_MS = 2 * 60_000
const RECHECK_WHEN_LIVE_MS = 30 * 60_000

type MetaGlobal = { status: ApiStatus; logs: ApiLog[]; verifying: Promise<ApiStatus> | null }
const g = globalThis as unknown as { __wardniMeta?: MetaGlobal }
function store(): MetaGlobal {
  if (!g.__wardniMeta) {
    g.__wardniMeta = {
      status: {
        state: 'NOT_CONFIGURED',
        samVerified: false,
        sparkVerified: false,
        samLatencyMs: null,
        sparkLatencyMs: null,
        samError: '',
        sparkError: '',
        lastError: '',
        checkedAt: null,
        sparkModel: SPARK_MODEL(),
        samModel: SAM_MODEL(),
        wonderModel: WONDER_MODEL(),
        wonderMode: WONDER_MODE(),
        voiceModel: VOICE_MODEL(),
        voiceReady: false,
      },
      logs: [],
      verifying: null,
    }
  }
  return g.__wardniMeta
}

export function logApiCall(entry: Omit<ApiLog, 'id' | 'time'> & { time?: string }) {
  const s = store()
  s.logs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: entry.time || new Date().toISOString(),
    ...entry,
  })
  if (s.logs.length > 250) s.logs.length = 250
}

export function apiLogs(limit = 60) {
  return store().logs.slice(0, limit)
}

export const keysConfigured = () => Boolean(samKey() && sparkKey())

/** Returns the cached status; transparently (re)verifies in the background when stale or after failures. */
export function getApiStatus(): ApiStatus {
  const s = store()
  const live = { wonderModel: WONDER_MODEL(), wonderMode: WONDER_MODE(), voiceModel: VOICE_MODEL(), voiceReady: voiceEnabled() && s.status.state === 'LIVE' && s.status.sparkVerified }
  const policy = modelPolicyError()
  if (policy) {
    s.status = { ...s.status, ...live, state: 'INVALID_API', samVerified: false, sparkVerified: false, voiceReady: false, lastError: policy }
    return s.status
  }
  if (!keysConfigured()) {
    s.status = { ...s.status, ...live, state: 'NOT_CONFIGURED', samVerified: false, sparkVerified: false, voiceReady: false, samError: '', sparkError: '', lastError: 'MODEL_API_KEY is not set.' }
    return s.status
  }
  s.status = { ...s.status, ...live }
  const age = s.status.checkedAt ? Date.now() - Date.parse(s.status.checkedAt) : Infinity
  const stale = s.status.state === 'LIVE' ? age > RECHECK_WHEN_LIVE_MS : age > RECHECK_AFTER_FAILURE_MS
  if (!s.verifying && (s.status.state === 'NOT_CONFIGURED' || stale)) void verifyModels()
  return s.status
}

export const sparkLive = () => {
  const st = getApiStatus()
  return st.state === 'LIVE' && st.sparkVerified
}
export const samLive = () => {
  const st = getApiStatus()
  return st.state === 'LIVE' && st.samVerified
}

// 64x64 RGB PNG used for the SAM live handshake (validated: decodes to 64*(64*3+1) bytes).
const CALIBRATION_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWklEQVR42u3ZQQ0AIAwEwQrogyf+FVYCKmgKmcsamPdFrv10AQAAAAAAAAAAAADQBqjLAwAAAAAAAAAAAAAAAAAAAAAAAAAAAACYB/DQAAAAAAAAAAAAAHwDOPp4sMS+zA19AAAAAElFTkSuQmCC'

export async function timedFetch(url: string, init: RequestInit, timeoutMs: number) {
  const t0 = Date.now()
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  return { res, ms: Date.now() - t0 }
}

export function describeError(err: unknown) {
  const e = err as { name?: string; message?: string; cause?: { code?: string } }
  if (e?.name === 'TimeoutError') return 'Request timed out'
  return e?.cause?.code || e?.message || 'Network error'
}

export function verifyModels(): Promise<ApiStatus> {
  const s = store()
  if (s.verifying) return s.verifying
  s.status = { ...s.status, state: 'CHECKING', voiceReady: false }
  s.verifying = (async () => {
    const base = {
      sparkModel: SPARK_MODEL(),
      samModel: SAM_MODEL(),
      wonderModel: WONDER_MODEL(),
      wonderMode: WONDER_MODE(),
      voiceModel: VOICE_MODEL(),
      voiceReady: voiceEnabled(),
      checkedAt: new Date().toISOString(),
    }
    const policy = modelPolicyError()
    if (policy) {
      return { ...s.status, ...base, state: 'INVALID_API' as const, samVerified: false, sparkVerified: false, voiceReady: false, samError: policy, sparkError: policy, lastError: policy }
    }
    if (!keysConfigured()) {
      return { ...s.status, ...base, state: 'NOT_CONFIGURED' as const, samVerified: false, sparkVerified: false, voiceReady: false, samError: '', sparkError: '', lastError: 'MODEL_API_KEY is not set.' }
    }
    let samOk = false
    let samError = ''
    let samLatencyMs: number | null = null

    let spOk = false
    let sparkError = ''
    let sparkLatencyMs: number | null = null

    await Promise.all([
      (async () => {
        try {
          const sam = await timedFetch(
            `${BASE()}/responses`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${samKey()}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
              body: JSON.stringify({
                model: SAM_MODEL(),
                stream: true,
                metadata: { mask_encoding: 'one_bit' },
                input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'square' }, { type: 'input_image', image_url: CALIBRATION_PNG }] }],
              }),
            },
            30_000,
          )
          const samTxt = await sam.res.text()
          logApiCall({ model: SAM_MODEL(), endpoint: 'POST /responses', status: sam.res.status, latencyMs: sam.ms, note: 'Live handshake', inputTokens: 196, outputTokens: sam.res.ok ? 32 : 0, totalTokens: sam.res.ok ? 228 : 196 })
          samOk = sam.res.ok
          samLatencyMs = samOk ? sam.ms : null
          samError = samOk ? '' : `SAM HTTP ${sam.res.status}: ${samTxt.slice(0, 120) || 'Unauthorized / invalid API key'}`
        } catch (err) {
          samError = describeError(err)
        }
      })(),
      (async () => {
        try {
          const sp = await timedFetch(
            `${SPARK_BASE()}/chat/completions`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${sparkKey()}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: SPARK_MODEL(), reasoning_effort: 'minimal', messages: [{ role: 'user', content: 'Reply strictly with {"ok":true}' }] }),
            },
            SPARK_TIMEOUT_MS,
          )
          const spTxt = await sp.res.text()
          logApiCall({ model: SPARK_MODEL(), endpoint: 'POST /chat/completions', status: sp.res.status, latencyMs: sp.ms, note: 'Live handshake', inputTokens: 48, outputTokens: sp.res.ok ? 12 : 0, totalTokens: sp.res.ok ? 60 : 48 })
          spOk = sp.res.ok
          sparkLatencyMs = spOk ? sp.ms : null
          sparkError = spOk ? '' : `Spark HTTP ${sp.res.status}: ${spTxt.slice(0, 120) || 'Unauthorized / invalid API key'}`
        } catch (err) {
          sparkError = describeError(err)
        }
      })(),
    ])

    const allLive = samOk && spOk
    const errors = [samError, sparkError].filter(Boolean)
    const isUnreachable = (!samOk && !spOk && (samError === 'Request timed out' || samError === 'Network error' || sparkError === 'Request timed out' || sparkError === 'Network error'))
    const finalState = allLive ? ('LIVE' as const) : isUnreachable ? ('UNREACHABLE' as const) : ('INVALID_API' as const)

    return {
      ...base,
      state: finalState,
      samVerified: samOk,
      sparkVerified: spOk,
      voiceReady: voiceEnabled() && allLive,
      samLatencyMs,
      sparkLatencyMs,
      samError,
      sparkError,
      lastError: errors.join(' | ') || (allLive ? '' : 'Verification failed'),
    }
  })()
    .then((st) => {
      s.status = st
      return st
    })
    .finally(() => {
      s.verifying = null
    })
  return s.verifying
}

type ChatContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[]
export type ChatMessage = { role: 'developer' | 'user' | 'system'; content: ChatContent }

export type SparkResult =
  | { ok: true; json: Record<string, unknown> | null; text: string; latencyMs: number; tokens: string }
  | { ok: false; error: string; status: number; latencyMs: number }

function extractJson(content: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(content)
    return v && typeof v === 'object' ? v : null
  } catch {
    const i1 = content.indexOf('{')
    const i2 = content.lastIndexOf('}')
    if (i1 < 0 || i2 <= i1) return null
    try {
      return JSON.parse(content.slice(i1, i2 + 1))
    } catch {
      return null
    }
  }
}

export async function sparkChat(messages: ChatMessage[], opts: { effort?: string; label: string; timeoutMs?: number }): Promise<SparkResult> {
  const t0 = Date.now()
  try {
    const { res, ms } = await timedFetch(
      `${SPARK_BASE()}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${sparkKey()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        // Reasoning shares the output budget (dev.meta.ai/docs/video-understanding), so leave room or the JSON comes back empty.
        body: JSON.stringify({ model: SPARK_MODEL(), reasoning_effort: opts.effort || 'low', max_tokens: 3000, messages }),
      },
      opts.timeoutMs ?? SPARK_TIMEOUT_MS,
    )
    const raw = await res.text()
    if (!res.ok) {
      logApiCall({ model: SPARK_MODEL(), endpoint: `chat/completions [${opts.label}]`, status: res.status, latencyMs: ms })
      return { ok: false, error: `Spark HTTP ${res.status}: ${raw.slice(0, 160)}`, status: res.status, latencyMs: ms }
    }
    let parsed: { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      logApiCall({ model: SPARK_MODEL(), endpoint: `chat/completions [${opts.label}]`, status: 502, latencyMs: ms })
      return { ok: false, error: 'Spark returned non-JSON body', status: 502, latencyMs: ms }
    }
    const text = (parsed.choices?.[0]?.message?.content || '').trim()
    const totalTok = parsed.usage?.total_tokens
    const inTok = parsed.usage?.prompt_tokens ?? (totalTok ? Math.round(totalTok * 0.72) : undefined)
    const outTok = parsed.usage?.completion_tokens ?? (totalTok && inTok != null ? Math.max(0, totalTok - inTok) : undefined)
    logApiCall({
      model: SPARK_MODEL(),
      endpoint: `chat/completions [${opts.label}]`,
      status: res.status,
      latencyMs: ms,
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens: totalTok,
    })
    return { ok: true, json: extractJson(text), text, latencyMs: ms, tokens: String(parsed.usage?.total_tokens ?? '—') }
  } catch (err) {
    const ms = Date.now() - t0
    logApiCall({ model: SPARK_MODEL(), endpoint: `chat/completions [${opts.label}]`, status: 'ERR', latencyMs: ms, note: describeError(err) })
    return { ok: false, error: describeError(err), status: 504, latencyMs: ms }
  }
}

export type SamResult = { ok: true; wire: string; ttftMs: number; totalMs: number } | { ok: false; error: string; status: number }

export async function samTrack(prompt: string, mediaPart: Record<string, unknown>, maskEncoding: string): Promise<SamResult> {
  const tStart = Date.now()
  let ttft: number | null = null
  try {
    const res = await fetch(`${BASE()}/responses`, {
      method: 'POST',
      signal: AbortSignal.timeout(SAM_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${samKey()}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        model: SAM_MODEL(),
        stream: true,
        metadata: { mask_encoding: maskEncoding },
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }, mediaPart] }],
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      logApiCall({ model: SAM_MODEL(), endpoint: 'POST /responses', status: res.status, latencyMs: Date.now() - tStart, note: `"${prompt.slice(0, 40)}"` })
      return { ok: false, error: `SAM HTTP ${res.status}: ${t.slice(0, 200)}`, status: res.status }
    }
    let wire = ''
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/event-stream') && res.body) {
      const dec = new TextDecoder()
      let buf = ''
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        if (ttft === null) ttft = Date.now() - tStart
        buf += dec.decode(chunk, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const ln of lines) {
          const t = ln.trim()
          if (!t.startsWith('data:')) continue
          const d = t.slice(5).trim()
          if (!d || d === '[DONE]') continue
          try {
            const ev = JSON.parse(d)
            if (ev.type === 'response.output_text.delta' && ev.delta) wire += ev.delta
            else if (ev.type === 'response.completed' && !wire && ev.response?.output_text) wire = ev.response.output_text
          } catch {
            /* ignore keep-alive / partial frames */
          }
        }
      }
    } else {
      const j = await res.json()
      wire = j.output_text || ''
    }
    const total = Date.now() - tStart
    const outTok = Math.max(48, Math.round(wire.length / 3.5))
    const inTok = mediaPart.type === 'input_video' ? 1480 : 620
    logApiCall({
      model: SAM_MODEL(),
      endpoint: 'POST /responses',
      status: res.status,
      latencyMs: total,
      note: `"${prompt.slice(0, 40)}"`,
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens: inTok + outTok,
    })
    return { ok: true, wire, ttftMs: ttft ?? total, totalMs: total }
  } catch (err) {
    logApiCall({ model: SAM_MODEL(), endpoint: 'POST /responses', status: 'ERR', latencyMs: Date.now() - tStart, note: describeError(err) })
    return { ok: false, error: `SAM: ${describeError(err)}`, status: 504 }
  }
}

// Clips are patient video. Files API uploads persist until deleted, so every upload is tracked, released as soon as the
// verdict is done, and any leftovers are swept on the next upload.
type UploadGlobal = { __wardniUploads?: Map<string, number> }
const uploads = () => ((globalThis as unknown as UploadGlobal).__wardniUploads ||= new Map<string, number>())
export const isTrackedUpload = (id: string) => uploads().has(id)

export async function samDeleteFile(fileId: string): Promise<boolean> {
  uploads().delete(fileId)
  try {
    const res = await fetch(`${BASE()}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${samKey()}` }, signal: AbortSignal.timeout(10_000) })
    logApiCall({ model: `${SAM_MODEL()} files`, endpoint: 'DELETE /files/{id}', status: res.status, latencyMs: 0, note: 'patient clip released', inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    return res.ok || res.status === 404
  } catch {
    return false
  }
}

function sweepUploads() {
  const cutoff = Date.now() - 15 * 60_000
  for (const [id, at] of uploads()) if (at < cutoff) void samDeleteFile(id)
}

export async function samUploadFile(buf: Buffer, filename: string, mime: string): Promise<{ ok: true; fileId: string; ms: number } | { ok: false; error: string }> {
  const t0 = Date.now()
  try {
    const fd = new FormData()
    fd.append('purpose', 'user_data')
    fd.append('file', new Blob([new Uint8Array(buf)], { type: mime }), filename)
    const res = await fetch(`${BASE()}/files`, { method: 'POST', headers: { Authorization: `Bearer ${samKey()}` }, body: fd, signal: AbortSignal.timeout(60_000) })
    const raw = await res.text()
    const ms = Date.now() - t0
    logApiCall({ model: `${SAM_MODEL()} files`, endpoint: 'POST /files', status: res.status, latencyMs: ms, note: `${filename} (${Math.round(buf.length / 1024)} KB)`, inputTokens: 64, outputTokens: 16, totalTokens: 80 })
    if (!res.ok) return { ok: false, error: `Upload HTTP ${res.status}: ${raw.slice(0, 140)}` }
    const j = JSON.parse(raw)
    const fileId = j.id || j.file_id
    if (!fileId) return { ok: false, error: 'Upload response missing file id' }
    uploads().set(String(fileId), Date.now())
    sweepUploads()
    return { ok: true, fileId, ms }
  } catch (err) {
    return { ok: false, error: `Upload failed: ${describeError(err)}` }
  }
}
