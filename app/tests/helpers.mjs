import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const dir = process.env.WARDNI_BUILD
if (!dir) throw new Error('Run these tests with `node scripts/test.mjs` (it transpiles src/lib/wardni first).')
export const load = (name) => require(path.join(dir, `${name}.js`))

/** Replaces global fetch with a scripted handler; returns the recorded calls and a restore function. */
export function mockFetch(handler) {
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body }
    calls.push(call)
    const r = await handler(call)
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...(r.headers || {}) } })
  }
  return { calls, restore: () => (globalThis.fetch = real) }
}

export const ENV_KEYS = ['MODEL_API_KEY', 'SPARK_MODEL', 'SAM_MODEL', 'WONDER_MODEL', 'VOICE_MODEL', 'WONDER_MODE', 'VOICE_MODE', 'WONDER_MIN_INTERVAL_SEC', 'META_BASE_URL']
export function resetEnv() {
  for (const k of ENV_KEYS) delete process.env[k]
  delete globalThis.__wardniMeta
  delete globalThis.__wardniWonder
  delete globalThis.__wardniUploads
}
