import type { BedZone, VisionClass } from './types'

/** Client-side SAM 3.1 wire parsing and patient-vs-staff telemetry. Pure functions (no DOM). */

export type TrackPoint = {
  frameIndex: number
  trackId: string
  classLabel: string
  declaredRole: VisionClass['role']
  color: string
  nx1: number
  ny1: number
  nx2: number
  ny2: number
  cx: number
  cy: number
}

export type ParsedSam = { frames: { frameIndex: number; objects: TrackPoint[] }[]; tracks: Record<string, TrackPoint[]> }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Parses `<Nf>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|>` streams. Objects may be separated by
 * commas, spaces or newlines; missing w/h fall back to the real source resolution.
 */
export function parseSamWire(wire: string, cls: VisionClass, classIdx: number, srcW: number, srcH: number): ParsedSam {
  const frames: ParsedSam['frames'] = []
  const tracks: ParsedSam['tracks'] = {}
  if (!wire?.trim()) return { frames, tracks }
  const blocks: { frameIndex: number; body: string }[] = []
  if (/<\d+f>/.test(wire)) {
    const re = /<(\d+)f>([\s\S]*?)(?=<\d+f>|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(wire)) !== null) blocks.push({ frameIndex: Number(m[1]), body: m[2] })
  } else if (wire.includes('<|box;')) {
    blocks.push({ frameIndex: 0, body: wire })
  }
  const objRe = /(\d+)\s*<\|box;([^|]*)\|>/g
  for (const b of blocks) {
    const objects: TrackPoint[] = []
    objRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = objRe.exec(b.body)) !== null) {
      const kv: Record<string, number> = {}
      for (const part of (m[2] || '').split(';')) {
        const eq = part.indexOf('=')
        if (eq > 0) kv[part.slice(0, eq).trim()] = Number(part.slice(eq + 1).trim())
      }
      if (![kv.x1, kv.y1, kv.x2, kv.y2].every(Number.isFinite)) continue
      const sw = Math.max(1, kv.w || srcW)
      const sh = Math.max(1, kv.h || srcH)
      const nx1 = clamp01(Math.min(kv.x1, kv.x2) / sw)
      const ny1 = clamp01(Math.min(kv.y1, kv.y2) / sh)
      const nx2 = clamp01(Math.max(kv.x1, kv.x2) / sw)
      const ny2 = clamp01(Math.max(kv.y1, kv.y2) / sh)
      const rec: TrackPoint = {
        frameIndex: b.frameIndex,
        trackId: `${cls.label || `class ${classIdx + 1}`}#${m[1]}${classIdx ? `·c${classIdx + 1}` : ''}`,
        classLabel: cls.label || 'target',
        declaredRole: cls.role,
        color: cls.color,
        nx1,
        ny1,
        nx2,
        ny2,
        cx: (nx1 + nx2) / 2,
        cy: (ny1 + ny2) / 2,
      }
      objects.push(rec)
      ;(tracks[rec.trackId] ||= []).push(rec)
    }
    frames.push({ frameIndex: b.frameIndex, objects })
  }
  return { frames, tracks }
}

type Box = { nx1: number; ny1: number; nx2: number; ny2: number }

/** Percent of the box's own area that lies inside the zone. */
export function overlapPct(p: Box, z: BedZone) {
  const ix = Math.max(0, Math.min(p.nx2, z.xMax) - Math.max(p.nx1, z.xMin))
  const iy = Math.max(0, Math.min(p.ny2, z.yMax) - Math.max(p.ny1, z.yMin))
  const area = Math.max(1e-4, (p.nx2 - p.nx1) * (p.ny2 - p.ny1))
  return Math.round(((ix * iy) / area) * 100)
}

function iou(a: Box, b: Box) {
  const ix = Math.max(0, Math.min(a.nx2, b.nx2) - Math.max(a.nx1, b.nx1))
  const iy = Math.max(0, Math.min(a.ny2, b.ny2) - Math.max(a.ny1, b.ny1))
  const inter = ix * iy
  const union = (a.nx2 - a.nx1) * (a.ny2 - a.ny1) + (b.nx2 - b.nx1) * (b.ny2 - b.ny1) - inter
  return union > 0 ? inter / union : 0
}

const centerDist = (a: Box, b: Box) => Math.hypot((a.nx1 + a.nx2) / 2 - (b.nx1 + b.nx2) / 2, (a.ny1 + a.ny2) / 2 - (b.ny1 + b.ny2) / 2)

export type ResolvedRole = 'ORIGIN_LOCKED_PATIENT' | 'UNRESOLVED_PERSON' | 'STAFF_OR_EXCLUDED' | 'EQUIPMENT'
export type TrackFact = {
  track_id: string
  resolved_role: ResolvedRole
  frames_seen: number
  bed_overlap_start_pct: number
  bed_overlap_end_pct: number
  center_in_bed_end: boolean
}

export type PatientLock = Box

/**
 * Patient vs. staff separation:
 * 1. Staff = Staff-role classes or labels matching negative exclusions (never the patient).
 * 2. Patient = the person track continuing the previous slice's locked patient box; otherwise the
 *    person track that STARTS >= 40% inside the bed zone; otherwise the only person track.
 * 3. Other person tracks are UNRESOLVED_PERSON — never silently relabelled as staff.
 */
export function computeFacts(tracks: Record<string, TrackPoint[]>, bed: BedZone, negativeExclusions: string, lock: PatientLock | null) {
  const negatives = negativeExclusions
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const entries = Object.entries(tracks).filter(([, pts]) => pts.length)
  const baseRole = (p: TrackPoint): 'STAFF' | 'EQUIPMENT' | 'PERSON' =>
    p.declaredRole === 'Staff' || negatives.some((kw) => p.classLabel.toLowerCase().includes(kw)) ? 'STAFF' : p.declaredRole === 'Object' ? 'EQUIPMENT' : 'PERSON'
  const persons = entries.filter(([, pts]) => baseRole(pts[0]) === 'PERSON')

  let patientId: string | null = null
  let lockMode = 'none'
  if (lock && persons.length) {
    const scored = persons
      .map(([id, pts]) => ({ id, score: iou(pts[0], lock), dist: centerDist(pts[0], lock) }))
      .sort((a, b) => b.score - a.score || a.dist - b.dist)
    if (scored[0].score > 0.1 || scored[0].dist < 0.2) {
      patientId = scored[0].id
      lockMode = 'continuity'
    }
  }
  if (!patientId) {
    const inBed = persons.map(([id, pts]) => ({ id, ov: overlapPct(pts[0], bed) })).filter((x) => x.ov >= 40).sort((a, b) => b.ov - a.ov)
    if (inBed.length) {
      patientId = inBed[0].id
      lockMode = 'origin_bed'
    }
  }
  if (!patientId && persons.length === 1) {
    patientId = persons[0][0]
    lockMode = 'single_person_track'
  }

  const facts: TrackFact[] = entries.map(([id, pts]) => {
    const first = pts[0]
    const last = pts[pts.length - 1]
    const role = baseRole(first)
    const resolved: ResolvedRole = id === patientId ? 'ORIGIN_LOCKED_PATIENT' : role === 'STAFF' ? 'STAFF_OR_EXCLUDED' : role === 'EQUIPMENT' ? 'EQUIPMENT' : 'UNRESOLVED_PERSON'
    return {
      track_id: id,
      resolved_role: resolved,
      frames_seen: pts.length,
      bed_overlap_start_pct: overlapPct(first, bed),
      bed_overlap_end_pct: overlapPct(last, bed),
      center_in_bed_end: last.cx >= bed.xMin && last.cx <= bed.xMax && last.cy >= bed.yMin && last.cy <= bed.yMax,
    }
  })

  const patient = patientId ? tracks[patientId] : null
  const patientLast = patient ? patient[patient.length - 1] : null
  const pf = facts.find((f) => f.track_id === patientId)
  // Center-based exit test: a patient whose box spans the bed width is NOT a rail crossing.
  const outOfBed = Boolean(pf && (!pf.center_in_bed_end || pf.bed_overlap_end_pct < 30))
  const pad = 0.08
  const near: BedZone = { xMin: bed.xMin - pad, yMin: bed.yMin - pad, xMax: bed.xMax + pad, yMax: bed.yMax + pad }
  const staffNear = entries.some(([, pts]) => baseRole(pts[0]) === 'STAFF' && overlapPct(pts[pts.length - 1], near) >= 10)

  return {
    facts: {
      frames_analyzed: Math.max(0, ...entries.map(([, p]) => p.length)),
      patient_visible: Boolean(patient),
      patient_out_of_bed: outOfBed,
      patient_lock: lockMode,
      staff_co_present_near_bed: staffNear,
      tracks: facts,
    },
    newLock: patientLast ? { nx1: patientLast.nx1, ny1: patientLast.ny1, nx2: patientLast.nx2, ny2: patientLast.ny2 } : lock,
  }
}

/** Builds the SAM text or `<0f>` spatial prompt for one class. */
export function buildClassPrompt(cls: VisionClass, mode: 'text' | 'spatial' | 'exemplar', srcW: number, srcH: number) {
  if (mode === 'spatial' && (cls.spatialBox || cls.spatialPoints.length)) {
    let tok = '<0f>1'
    if (cls.spatialBox) {
      const b = cls.spatialBox
      tok += `<|box;x1=${Math.round(b.xMin * srcW)};y1=${Math.round(b.yMin * srcH)};x2=${Math.round(b.xMax * srcW)};y2=${Math.round(b.yMax * srcH)};w=${srcW};h=${srcH}|>`
    }
    for (const p of cls.spatialPoints) tok += `<|point;x=${Math.round(p.x * srcW)};y=${Math.round(p.y * srcH)};label=${p.label};w=${srcW};h=${srcH}|>`
    return tok
  }
  const lbl = (cls.label || 'patient').trim()
  const dsc = (cls.desc || '').trim()
  return dsc ? `${lbl} (${dsc})` : lbl
}

export const DEFAULT_CLASSES: VisionClass[] = [
  { label: 'patient in bed', desc: 'person lying in hospital bed wearing patient gown', role: 'Patient', color: '#2DD4BF', spatialPoints: [], spatialBox: null },
  { label: 'medical staff', desc: 'nurse or doctor standing beside bed in scrubs or coat', role: 'Staff', color: '#38BDF8', spatialPoints: [], spatialBox: null },
]

