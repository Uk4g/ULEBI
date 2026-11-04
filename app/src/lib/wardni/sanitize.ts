import type { BedZone, VisionClass } from './types'

const clamp01 = (n: unknown) => Math.max(0, Math.min(1, Number(n)))

export function sanitizeBox(b: unknown): BedZone | null {
  if (!b || typeof b !== 'object') return null
  const o = b as Record<string, unknown>
  const box = { xMin: clamp01(o.xMin), yMin: clamp01(o.yMin), xMax: clamp01(o.xMax), yMax: clamp01(o.yMax) }
  if (Object.values(box).some((n) => !Number.isFinite(n))) return null
  if (box.xMax - box.xMin < 0.02 || box.yMax - box.yMin < 0.02) return null
  return box
}

const ROLES = new Set(['Patient', 'Staff', 'Object'])

export function sanitizeClasses(v: unknown): VisionClass[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.slice(0, 8).map((c) => {
    const o = (c || {}) as Record<string, unknown>
    const pts = Array.isArray(o.spatialPoints) ? o.spatialPoints.slice(0, 20) : []
    return {
      label: String(o.label || '').slice(0, 60),
      desc: String(o.desc || '').slice(0, 160),
      role: (ROLES.has(String(o.role)) ? o.role : 'Object') as VisionClass['role'],
      color: /^#[0-9a-fA-F]{6}$/.test(String(o.color)) ? String(o.color) : '#2DD4BF',
      spatialPoints: pts
        .map((p) => {
          const q = (p || {}) as Record<string, unknown>
          return { x: clamp01(q.x), y: clamp01(q.y), label: (q.label === 0 ? 0 : 1) as 0 | 1 }
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      spatialBox: sanitizeBox(o.spatialBox),
    }
  })
}
