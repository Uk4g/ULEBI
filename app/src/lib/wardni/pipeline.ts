import type { Engine, Level, Source, WardEventDTO } from './types'
import { maxLevel, rank } from './combine'
import type { Verdict } from './rules'
import type { TriageOutcome } from './triage'

/**
 * Two-phase triage.
 *
 *  Phase 1 (deterministic, instant): when the rules already say a nurse must act (floor YELLOW or RED), the event is
 *          recorded and the nurse-call chain started BEFORE any AI call. A slow or failing AI can never delay an alarm.
 *  Phase 2 (AI, in the background): Muse Spark / Muse Wonder review the same event. They may RAISE it (a new, higher
 *          event; the escalation upgrades in place) or enrich the wording of the recorded event. They never lower it.
 *
 * When the rules floor is "routine" (the common case for rolling monitoring), the AI verdict is awaited because it may
 * be the only thing that notices a problem.
 */

export type RecordInput = {
  source: Source
  level: Level
  engine: Engine
  failSafe?: boolean
  headline: string
  reason: string
  nurseAction: string
  detail?: string
  latencyMs?: number
  tokens?: string
}

export type EnrichPatch = { headline?: string; reason?: string; nurseAction?: string; latencyMs?: number; tokens?: string; engine?: Engine }

export type PipelineDeps = {
  record: (input: RecordInput) => Promise<WardEventDTO>
  enrich: (eventId: string, patch: EnrichPatch) => Promise<unknown>
  /** Runs work after the response is sent (Next's `after`). Must swallow its own errors. */
  schedule: (fn: () => Promise<void>) => void
  log?: (msg: string, err?: unknown) => void
}

export type PipelineResult = { event: WardEventDTO | null; phase: 'immediate' | 'ai'; note?: string; outcome?: TriageOutcome }

const toRecord = (source: Source, o: TriageOutcome, detail?: string): RecordInput => ({
  source,
  level: o.level,
  engine: o.engine as Engine,
  failSafe: o.failSafe,
  headline: o.headline,
  reason: o.reason,
  nurseAction: o.nurse_action,
  detail,
  latencyMs: o.latencyMs,
  tokens: o.tokens,
})

export async function runTriage(args: {
  source: Source
  rules: Verdict
  detail?: string
  ai: () => Promise<TriageOutcome>
  deps: PipelineDeps
  /** Sync path only: return false to skip persisting (e.g. an unchanged routine verdict during rolling monitoring). */
  shouldRecord?: (o: TriageOutcome) => boolean
}): Promise<PipelineResult> {
  const { source, rules, detail, deps } = args

  if (rank(rules.floor) >= rank('YELLOW')) {
    const recordedLevel = maxLevel(rules.level, rules.floor)
    const event = await deps.record({
      source,
      level: recordedLevel,
      engine: 'rules',
      headline: rules.headline,
      reason: rules.reason,
      nurseAction: rules.nurse_action,
      detail,
      latencyMs: 0,
      tokens: 'rules',
    })
    deps.schedule(async () => {
      try {
        const o = await args.ai()
        if (o.engine === 'rules' || o.floored) return // AI offline / failed / agreed with the floor: nothing to add
        if (rank(o.level) > rank(recordedLevel)) await deps.record(toRecord(source, o, detail))
        else if (o.level === recordedLevel && o.nurse_action) {
          await deps.enrich(event.id, { headline: o.headline, reason: o.reason, nurseAction: o.nurse_action, latencyMs: o.latencyMs, tokens: o.tokens, engine: o.engine as Engine })
        }
      } catch (err) {
        deps.log?.('[wardni] background AI review failed', err)
      }
    })
    return { event, phase: 'immediate', note: 'Escalated immediately by rules; AI review is running in the background.' }
  }

  const outcome = await args.ai()
  if (args.shouldRecord && !args.shouldRecord(outcome)) return { event: null, phase: 'ai', note: outcome.note, outcome }
  const event = await deps.record(toRecord(source, outcome, detail))
  return { event, phase: 'ai', note: outcome.note, outcome }
}
