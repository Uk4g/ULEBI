import { recordAudit } from '@/lib/wardni/engine'
import { runtimeKeyStatus, setRuntimeKeys, verifyModels } from '@/lib/wardni/meta'
import { handle, json, readJson, requireStaff } from '@/lib/wardni/http'

const KEY_FIELDS = ['model', 'sam', 'spark', 'voice', 'wonder'] as const
type KeyField = (typeof KEY_FIELDS)[number]

/**
 * Runs the live Meta API handshake (SAM 3.1 /v1/responses + Muse Spark 1.3 /v1/chat/completions).
 * If the caller includes new key values in the request body (e.g. clicking "Test Connection" after
 * pasting a key in the modal), those keys are applied to session memory first so the test checks
 * the exact key entered by the user.
 */
export const POST = handle(async (req) => {
  const user = await requireStaff(req)
  const body = await readJson(req, 8 * 1024).catch(() => ({} as Record<string, unknown>))
  const record = (body || {}) as Record<string, unknown>

  const input: Partial<Record<KeyField, string>> = {}
  if (user.role === 'admin') {
    for (const f of KEY_FIELDS) {
      const raw = record[`${f}ApiKey`] ?? record[f]
      if (typeof raw === 'string' && raw.trim().length > 0 && raw.trim().length <= 512) {
        input[f] = raw.trim()
      }
    }
    if (Object.keys(input).length > 0) {
      setRuntimeKeys(input)
    }
  }

  const status = await verifyModels()
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'TEST_META_API_CONNECTION',
    target: 'Meta Model Pipeline',
    detail: `Tested Meta API connection — status: ${status.state} (SAM: ${status.samLatencyMs ?? '—'}ms, Spark: ${status.sparkLatencyMs ?? '—'}ms)`,
    level: status.state === 'LIVE' ? 'routine' : 'YELLOW',
  })
  return json({ ok: status.state === 'LIVE', keys: runtimeKeyStatus(), status })
})
