import { recordAudit } from '@/lib/wardni/engine'
import { getApiStatus, keysConfigured, runtimeKeyStatus, setRuntimeKeys, verifyModels } from '@/lib/wardni/meta'
import { fail, handle, json, readJson, requireStaff } from '@/lib/wardni/http'

const KEY_FIELDS = ['model', 'sam', 'spark', 'voice', 'wonder'] as const
type KeyField = (typeof KEY_FIELDS)[number]

export const GET = handle(async (req) => {
  await requireStaff(req)
  return json({ ok: true, keys: runtimeKeyStatus(), status: getApiStatus() })
})

export const POST = handle(async (req) => {
  const user = await requireStaff(req, { admin: true })
  const body = await readJson(req, 4 * 1024)
  const record = body as Record<string, unknown>

  if (record.clear === true) {
    setRuntimeKeys({ model: '', sam: '', spark: '', voice: '', wonder: '' }, { replace: true })
    const status = keysConfigured() ? await verifyModels() : getApiStatus()
    recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'CLEAR_API_KEYS',
      target: 'Meta API Keys',
      detail: 'Cleared all session API keys from server memory',
      level: 'YELLOW',
    })
    return json({ ok: status.state === 'LIVE', cleared: true, keys: runtimeKeyStatus(), status })
  }

  if (typeof record.clearKey === 'string' && KEY_FIELDS.includes(record.clearKey as KeyField)) {
    const k = record.clearKey as KeyField
    setRuntimeKeys({ [k]: '' })
    const status = keysConfigured() ? await verifyModels() : getApiStatus()
    recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'CLEAR_SINGLE_KEY',
      target: `Meta Key (${k.toUpperCase()})`,
      detail: `Cleared ${k.toUpperCase()} override key from server session`,
      level: 'INFO',
    })
    return json({ ok: status.state === 'LIVE', clearedKey: k, keys: runtimeKeyStatus(), status })
  }

  const pick = (v: unknown) => {
    if (v === null || v === undefined || v === '') return undefined
    if (typeof v !== 'string') return null
    return v.trim()
  }

  const input: Partial<Record<KeyField, string>> = {}
  for (const f of KEY_FIELDS) {
    const v = pick(record[`${f}ApiKey`] ?? record[f])
    if (v === null) return fail(400, `Key for ${f} must be text.`)
    if (v !== undefined && v.length > 512) return fail(400, `Key for ${f} is too long.`)
    if (v !== undefined) input[f] = v
  }

  if (Object.keys(input).length === 0) {
    return fail(400, 'Paste at least one API key to save & verify, or use Clear to remove session keys.')
  }

  setRuntimeKeys(input)
  const status = await verifyModels()
  recordAudit({
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    action: 'SAVE_VERIFY_API_KEYS',
    target: 'Meta API Keys',
    detail: `Updated session keys (${Object.keys(input).join(', ')}) — handshake result: ${status.state}`,
    level: status.state === 'LIVE' ? 'routine' : 'YELLOW',
  })
  return json({ ok: status.state === 'LIVE', keys: runtimeKeyStatus(), status })
})
