import type { Level } from './types'
import { LEVEL_RANK } from './types'

export type VerdictLike = { level: Level; headline: string; reason: string; nurse_action: string }

export const rank = (l: Level | string | null | undefined) => LEVEL_RANK[String(l)] || 0
export const maxLevel = (a: Level, b: Level): Level => (rank(a) >= rank(b) ? a : b)

/**
 * Safety floor. AI models (Muse Spark / Muse Wonder) may RAISE a verdict above the deterministic floor,
 * but they may never lower it. If the AI ranks below the floor, the floor verdict wins and says so.
 */
export function applyFloor<T extends VerdictLike>(floorLevel: Level, floorVerdict: VerdictLike, ai: T): T & { floored: boolean } {
  if (rank(ai.level) >= rank(floorLevel)) return { ...ai, floored: false }
  return {
    ...ai,
    level: floorLevel,
    headline: floorVerdict.headline,
    reason: `${floorVerdict.reason} (AI ranked this ${ai.level}; the rules floor ${floorLevel} was kept.)`,
    nurse_action: floorVerdict.nurse_action,
    floored: true,
  }
}

/** Merge several AI verdicts for the same event: the highest level wins, and its wording is used. */
export function highestVerdict<T extends VerdictLike>(verdicts: T[]): T | null {
  let best: T | null = null
  for (const v of verdicts) if (!best || rank(v.level) > rank(best.level)) best = v
  return best
}

/** Strips characters a patient (or bystander) could use to break out of a delimited prompt section. */
export function untrusted(text: string, max: number): string {
  return String(text ?? '')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
