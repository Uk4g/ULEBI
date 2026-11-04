import net from 'node:net'
import { promises as dns } from 'node:dns'

const allowLocalCam = () => String(process.env.ALLOW_LOCAL_CAM || '').toLowerCase() === 'true'

/** Blocks loopback, private, link-local, CGNAT, multicast and IPv4-mapped/compatible IPv6 forms. */
export function isPrivateOrLoopbackIp(ipStr: string): boolean {
  if (!ipStr) return true
  const clean = String(ipStr).trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  if (net.isIPv4(clean)) {
    const p = clean.split('.').map(Number)
    return (
      p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      p[0] >= 224
    )
  }
  if (net.isIPv6(clean)) {
    let work = clean
    if (work.includes('.')) {
      const lastColon = work.lastIndexOf(':')
      const v4 = work.slice(lastColon + 1)
      if (!net.isIPv4(v4)) return true
      const o = v4.split('.').map(Number)
      work = `${work.slice(0, lastColon)}:${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`
    }
    const halves = work.split('::')
    if (halves.length > 2) return true
    const left = halves[0] ? halves[0].split(':').filter(Boolean) : []
    const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : []
    const missing = 8 - (left.length + right.length)
    if (missing < 0) return true
    const g = [...left, ...(halves.length === 2 ? Array(missing).fill('0') : []), ...right].map((x) => parseInt(x, 16))
    if (g.length !== 8 || g.some((n) => !Number.isFinite(n))) return true
    if (g.every((n) => n === 0)) return true
    if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true
    if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && (g[5] === 0xffff || g[5] === 0)) {
      return isPrivateOrLoopbackIp(`${(g[6] >> 8) & 255}.${g[6] & 255}.${(g[7] >> 8) & 255}.${g[7] & 255}`)
    }
    if ((g[0] & 0xfe00) === 0xfc00) return true
    if ((g[0] & 0xffc0) === 0xfe80) return true
    if ((g[0] & 0xff00) === 0xff00) return true
    return false
  }
  return true
}

/** Strips user:pass@ from a camera URL and converts it into a Basic Authorization value. */
export function sanitizeCameraUrl(raw: string, explicitToken = ''): { url: string; token: string; error?: string } {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { url: '', token: explicitToken.trim() }
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return { url: '', token: '', error: 'Invalid camera URL syntax.' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { url: '', token: '', error: 'Camera URL must use http:// or https://.' }
  let token = explicitToken.trim()
  if (u.username || u.password) {
    if (!token) token = `Basic ${Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64')}`
    u.username = ''
    u.password = ''
  }
  return { url: u.toString(), token }
}

export async function validateCameraTarget(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'Invalid camera URL.' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'Camera URL must use http(s).' }
  if (u.username || u.password) return { ok: false, reason: 'Embedded credentials are not allowed; use the camera token field.' }
  if (allowLocalCam()) return { ok: true, url: u }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, reason: 'Loopback camera hosts are blocked (set ALLOW_LOCAL_CAM=true for LAN cameras).' }
  }
  if (net.isIP(host)) {
    return isPrivateOrLoopbackIp(host)
      ? { ok: false, reason: 'Private / loopback camera IPs are blocked (set ALLOW_LOCAL_CAM=true for LAN cameras).' }
      : { ok: true, url: u }
  }
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true })
    if (!records.length) return { ok: false, reason: 'Camera hostname could not be resolved.' }
    if (records.some((r) => isPrivateOrLoopbackIp(r.address))) {
      return { ok: false, reason: 'Camera hostname resolves to a private / loopback IP.' }
    }
    return { ok: true, url: u }
  } catch {
    return { ok: false, reason: 'Camera DNS lookup failed.' }
  }
}
