import { after } from 'next/server'
import { getPayloadClient } from '@/lib/payload'
import { enrichEvent, findRoom, persistExtendedSettings, recordAudit, recordEvent } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff, str } from '@/lib/wardni/http'
import { highestVerdict } from '@/lib/wardni/combine'
import { isTrackedUpload, samDeleteFile, sparkLive } from '@/lib/wardni/meta'
import { rank } from '@/lib/wardni/combine'
import { runTriage, type PipelineDeps } from '@/lib/wardni/pipeline'
import { visionRules, voiceRules, type MovementFacts } from '@/lib/wardni/rules'
import { mergeWard, triageVision, triageVoice, type TriageOutcome } from '@/lib/wardni/triage'
import { roomLevel, type RoomDTO } from '@/lib/wardni/types'
import { shouldAssess, wonderAssess, type MediaInput } from '@/lib/wardni/wonder'

const EFFORTS = new Set(['minimal', 'low', 'medium', 'high'])

export const POST = handle(async (req) => {
  const user = await requireStaff(req)
  const body = await readJson(req, 6 * 1024 * 1024)
  const source = String(body.source || '').toUpperCase()
  const effort = EFFORTS.has(String(body.reasoningEffort)) ? String(body.reasoningEffort) : 'low'
  const payload = await getPayloadClient()

  if (source === 'MERGE') {
    const [rooms, escalations] = await Promise.all([
      payload.find({ collection: 'rooms', limit: 200, depth: 0, user: user.doc as never, overrideAccess: false }),
      payload.find({ collection: 'escalations', where: { active: { equals: true } }, limit: 100, depth: 0, user: user.doc as never, overrideAccess: false }),
    ])
    if (!rooms.docs.length) return fail(400, 'Add at least one room first.')
    const snapshot = rooms.docs.map((r) => {
      const room = r as unknown as RoomDTO
      const esc = escalations.docs.find((e) => String((e as { room?: unknown }).room) === String(r.id)) as Record<string, unknown> | undefined
      return {
        room: room.name,
        clinicalContext: room.clinicalContext,
        level: roomLevel(room),
        sam: room.latestBySource?.SAM,
        voice: room.latestBySource?.VOICE,
        task: room.latestBySource?.TASK,
        escalation: esc ? { level: esc.level, status: esc.status, assigned: esc.assignedNurseName, repeats: esc.repeatCount } : null,
      }
    })
    const summary = { ...(await mergeWard(snapshot, effort)), updatedAt: new Date().toISOString() }
    recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'SYNTHESIZE_SHIFT',
      target: 'Shift Directive',
      detail: `Synthesized shift directive (${summary.overall_level.toUpperCase()} · ${summary.engine}): "${summary.ward_headline}"`,
      level: summary.overall_level,
    })
    await persistExtendedSettings(payload, { masterSummary: summary })
    return json({ ok: true, summary })
  }

  const room = await findRoom(payload, str(body.roomId, 80))
  if (!room) return fail(404, 'Room not found.')
  const ctx = room.clinicalContext || ''

  const deps: PipelineDeps = {
    record: (i) => recordEvent(payload, { room, ...i }),
    enrich: (id, patch) => enrichEvent(payload, id, room.id, patch),
    schedule: (fn) => after(fn),
    log: (m, e) => console.error(m, e),
  }

  // ───────── VOICE: Muse Voice Transcribe 1.0 output → rules floor → Muse Spark 1.3 ranking ─────────
  if (source === 'VOICE') {
    // No-fake-data rule: untranscribed speech is never stored as an event.
    // A nurse is told to check the patient via the UI error, not via a stored YELLOW event.
    if (body.untranscribed === true) return fail(400, 'Speech heard but not transcribed — nothing stored. Check the patient in person.')
    const transcript = str(body.transcript, 1500)
    if (transcript.length < 2) return fail(400, 'Transcript is empty.')
    const rules = voiceRules(transcript, ctx, room.name)
    // Routine requests with Spark down are not stored as rules events (v6 rule).
    // YELLOW/RED floors are still recorded immediately by runTriage below.
    if (rank(rules.floor) < rank('YELLOW') && !sparkLive()) return fail(503, 'Muse Spark 1.3 is unavailable — routine request not stored.')
    const r = await runTriage({
      source: 'VOICE',
      rules,
      detail: transcript.slice(0, 200),
      ai: () => triageVoice(transcript, ctx, room.name, effort),
      deps,
    })
    return json({ ok: true, event: r.event, note: r.note, phase: r.phase })
  }

  // ───────── SAM: SAM 3.1 telemetry output → Muse Wonder 1.0 assessment → Muse Spark 1.3 clinical ranking ─────────
  if (source === 'SAM') {
    const f = (body.movementFacts || {}) as MovementFacts
    const facts: MovementFacts = {
      frames_analyzed: Number(f.frames_analyzed) || 0,
      patient_visible: Boolean(f.patient_visible),
      patient_out_of_bed: Boolean(f.patient_out_of_bed),
      patient_lock: String(f.patient_lock || 'none').slice(0, 40),
      staff_co_present_near_bed: Boolean(f.staff_co_present_near_bed),
      tracks: Array.isArray(f.tracks) ? f.tracks.slice(0, 20) : [],
    }
    const rules = visionRules(facts, ctx, room.name)
    // Routine SAM verdicts with Spark down are not stored (same v6 rule as voice).
    if (rank(rules.floor) < rank('YELLOW') && !sparkLive()) return fail(503, 'Muse Spark 1.3 is unavailable — routine vision verdict not stored.')
    const fileId = typeof body.videoFileId === 'string' && /^[\w.-]{1,200}$/.test(body.videoFileId) && isTrackedUpload(body.videoFileId) ? body.videoFileId : ''
    const imageDataUrl = typeof body.imageDataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.imageDataUrl) ? body.imageDataUrl : ''
    const wonderMedia: MediaInput | null = fileId ? { fileId } : imageDataUrl ? { imageDataUrl } : null

    const ai = async (): Promise<TriageOutcome> => {
      try {
        const useWonder = Boolean(wonderMedia) && shouldAssess(facts, rules.level)
        const wonder = useWonder && wonderMedia
          ? await wonderAssess({ roomId: String(room.id), roomName: room.name, ctx, media: wonderMedia, facts, floor: rules, effort })
          : null
        const wonderOutcome = wonder && wonder.ok ? wonder.outcome : null

        // Sequential handoff: Wonder 1.0's assessment + SAM 3.1's telemetry are passed into Spark 1.3
        const spark = await triageVision(facts, ctx, room.name, room.negativeExclusions || '', effort, wonderOutcome)

        const best = highestVerdict<TriageOutcome>([...(wonderOutcome ? [{ ...wonderOutcome, failSafe: false } as TriageOutcome] : []), spark])!
        const notes = [
          spark.note,
          wonder && !wonder.ok ? `Wonder skipped: ${wonder.error}` : '',
          wonderOutcome && spark.engine !== 'rules' && spark.level !== wonderOutcome.level ? `Spark ranked ${spark.level} after reviewing Wonder (${wonderOutcome.level}).` : '',
        ]
          .filter(Boolean)
          .join(' · ')
        const posture = wonderOutcome
          ? ` [Wonder saw: ${wonderOutcome.observations.patient_posture}${wonderOutcome.observations.telemetry_agrees === false ? '; disagrees with tracker' : ''}]`
          : ''
        return {
          ...best,
          reason: `${best.reason}${posture}`.slice(0, 1200),
          failSafe: wonderOutcome ? false : spark.failSafe,
          latencyMs: spark.latencyMs + (wonderOutcome?.latencyMs || 0),
          note: notes || undefined,
        }
      } finally {
        if (fileId) void samDeleteFile(fileId)
      }
    }

    const prev = room.latestBySource?.SAM
    const detail = `${facts.tracks.length} track(s) · ${facts.frames_analyzed} frame(s) · lock: ${facts.patient_lock}`
    const r = await runTriage({
      source: 'SAM',
      rules,
      detail,
      ai,
      deps,
      shouldRecord: (o) => !(o.level === 'routine' && prev?.level === 'routine' && Date.now() - Date.parse(prev.at) < 5 * 60_000),
    })
    if (!r.event && r.outcome && prev) {
      const o = r.outcome
      return json({
        ok: true,
        recorded: false,
        event: {
          id: prev.id,
          room: String(room.id),
          roomName: room.name,
          source: 'SAM',
          level: o.level,
          engine: o.engine,
          failSafe: o.failSafe,
          headline: o.headline,
          reason: o.reason,
          nurseAction: o.nurse_action,
          detail,
          latencyMs: o.latencyMs,
          tokens: o.tokens,
          createdAt: prev.at,
        },
      })
    }
    return json({ ok: true, recorded: true, event: r.event, note: r.note, phase: r.phase })
  }

  return fail(400, 'Unknown triage source.')
})
