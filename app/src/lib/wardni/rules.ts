import type { Level } from './types'

/**
 * Deterministic triage used when Muse Spark is not configured, unreachable, or returns garbage.
 * Keeps every module working (and ranking conservatively) with the AI offline.
 */

/**
 * `level` is the rules engine's best judgement (used on its own when the AI is offline or fails).
 * `floor` is the level the AI may never go below: it is recorded immediately and can only be raised.
 */
export type Verdict = { level: Level; headline: string; reason: string; nurse_action: string; floor: Level }

/** Fail-safe level parser: negations first, then positive urgency tokens, unknown -> YELLOW. */
export function normalizeVerdictLevel(raw: unknown): { level: Level; failSafe: boolean } {
  const cleaned = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return { level: 'YELLOW', failSafe: true }
  if (/^(ROUTINE|GREEN|STABLE|NORMAL|LOW|CALM|OK|NONE|NON URGENT|NOT URGENT|NO URGENCY|NOT CRITICAL|NOT EMERGENCY|NO EMERGENCY)$/.test(cleaned)) {
    return { level: 'routine', failSafe: false }
  }
  if (/^NOT RED$/.test(cleaned)) return { level: 'YELLOW', failSafe: false }
  if (/\b(RED|URGENT|CRITICAL|EMERGENCY|IMMEDIATE|SEVERE|DANGER|HIGH|LIFE THREAT|LIFE THREATENING)\b/.test(cleaned)) {
    return { level: 'RED', failSafe: false }
  }
  if (/\b(YELLOW|AMBER|SOON|MODERATE|MEDIUM|WARNING|WARN|CAUTION|PRIORITY|CHECK)\b/.test(cleaned)) {
    return { level: 'YELLOW', failSafe: false }
  }
  return { level: 'YELLOW', failSafe: true }
}

const isFallRisk = (ctx: string) => /fall|post.?op|hip|frail|dizz|sedat|delirium|confus/i.test(ctx)
const isNpo = (ctx: string) => /\bNPO\b|nil by mouth|nothing by mouth|fasting|à jeun/i.test(ctx)

export function taskRules(task: string, note: string, ctx: string, roomName: string): Verdict {
  const t = task.toUpperCase()
  if (t.includes('EMERGENCY')) {
    return {
      level: 'RED',
      headline: 'Bedside Emergency Help pressed',
      reason: note ? `Patient pressed Emergency Help ("${note}"). Risk profile: ${ctx || 'not recorded'}.` : `Patient pressed the bedside Emergency Help button. Risk profile: ${ctx || 'not recorded'}.`,
      nurse_action: `Go to ${roomName} immediately for an emergency bedside check.`,
      floor: 'RED',
    }
  }
  if (t.includes('BATHROOM')) {
    const fall = isFallRisk(ctx)
    return {
      level: 'YELLOW',
      headline: fall ? 'Bathroom transfer — fall-risk patient' : 'Bathroom assistance requested',
      reason: fall ? `Fall-risk profile (${ctx}). Patient may try to get up unassisted.` : 'Patient requested help getting to the bathroom.',
      nurse_action: fall ? `Attend ${roomName} promptly; assist transfer before the patient stands alone.` : `Assist the patient in ${roomName} to the bathroom.`,
      // A flagged fall-risk patient trying to get up is never allowed to fall below YELLOW.
      floor: fall ? 'YELLOW' : 'routine',
    }
  }
  if (t.includes('PAIN')) {
    return {
      level: 'YELLOW',
      headline: 'Pain or discomfort reported',
      reason: note ? `Patient reports: "${note}".` : 'Patient pressed Pain / Comfort.',
      nurse_action: `Assess pain and comfort in ${roomName}; follow the existing care plan.`,
      floor: 'routine',
    }
  }
  if (isNpo(ctx) && /WATER|DRINK|EAT/.test(t)) {
    return {
      level: 'YELLOW',
      headline: `${t.split(' ')[0]} requested — patient is NPO`,
      reason: `Care note indicates restricted intake (${ctx}).`,
      nurse_action: `Visit ${roomName} and explain intake restriction; do not serve food or drink without clearance.`,
      floor: 'YELLOW',
    }
  }
  const item = t.includes('WATER') ? 'Water' : t.includes('EAT') ? 'Meal / snack' : t.includes('DRINK') ? 'Drink' : task
  return {
    level: 'routine',
    headline: `${item} requested`,
    reason: note ? `Routine request. Note: "${note}".` : 'Routine comfort request.',
    nurse_action: `Bring ${item.toLowerCase()} to ${roomName} on the next round.`,
    floor: 'routine',
  }
}

// JS `\b` is ASCII-only, so "à l'aide" or "je suis tombé" (ends in é) never matched the old patterns.
// These helpers use Unicode-aware boundaries so French and Arabic work like English.
const NB = String.raw`(?<![\p{L}\p{N}])`
const NA = String.raw`(?![\p{L}\p{N}])`
const word = (src: string) => new RegExp(`${NB}(?:${src})${NA}`, 'iu')

/** Unambiguous high-severity events: always RED, wherever they appear in the sentence. */
const RED_STRONG = word(
  [
    String.raw`i fell`, String.raw`i['’]?ve fallen`, String.raw`i have fallen`, String.raw`fell down`, String.raw`fallen`, String.raw`on the floor`,
    String.raw`can['’]?t breathe`, String.raw`cannot breathe`, String.raw`can['’]?t get (?:my )?breath`, String.raw`short of breath`,
    String.raw`chest (?:pain|hurts?|is hurting|tight|feels tight)`, String.raw`heart attack`, String.raw`bleeding`, String.raw`choking`, String.raw`emergency`,
    String.raw`je suis tomb[ée]e?`, String.raw`je tombe`, String.raw`au secours`, String.raw`[àa] l['’]aide`, String.raw`je ne peux pas respirer`, String.raw`j['’]étouffe`,
    String.raw`douleur (?:[àa] la|dans la) poitrine`, String.raw`saigne`,
  ].join('|'),
)
const RED_STRONG_AR = /النجدة|أسعفوني|اسعفوني|سقطت|طحت|وقعت على الأرض|ما نقدرش نتنفس|ما نقدر نتنفس|لا أستطيع التنفس|ألم في الصدر|ألم فالصدر|نزيف|ندمي/u

/** A call for help. Only RED when it is the whole utterance or is shouted; otherwise YELLOW. */
const HELP_WORD = word(String.raw`help(?: me| us)?|please help|aide|aidez[- ]moi|aidez|sos|ساعدوني|ساعدني|ساعدونا`)
const SHOUTED_HELP = /(?<![\p{L}\p{N}])(?:help(?: me| us)?|aidez[- ]moi|aide|sos)\s*!+/iu
/** Clinical complaints: a nurse must look, so the AI may not rank these below YELLOW. */
const YELLOW_CLINICAL = new RegExp(
  `${NB}(?:pain|hurts?|aching|dizzy|nause\\w*|vomit\\w*|douleur|mal|vertige|nausée)${NA}|ألم|يوجعني|دوخة`,
  'iu',
)
/** Mobility requests: YELLOW, but only a hard floor for patients flagged as fall-risk (same rule as the bedside pad). */
const YELLOW_MOBILITY = new RegExp(`${NB}(?:bathroom|toilet|restroom|toilettes?|get up|stand up|sit up)${NA}|حمام|نهض|نقوم`, 'iu')
/** Comfort chatter: YELLOW when the AI is offline, but the AI is free to rank it as routine. */
const YELLOW_SOFT = new RegExp(`${NB}(?:cold|sick|froid)${NA}`, 'iu')
const NEGATED_HELP = /(?<![\p{L}\p{N}])(?:don'?t|do not|no|not)\s+(?:need|want)\s+(?:any\s+)?help(?![\p{L}\p{N}])|pas besoin d['’]aide|لا أحتاج مساعدة|ما نحتاجش مساعدة/iu

export function voiceRules(transcript: string, ctx: string, roomName: string): Verdict {
  const t = transcript.trim()
  const words = t.split(/\s+/).filter(Boolean)
  const strong = RED_STRONG.test(t) || RED_STRONG_AR.test(t)
  const helpNegated = NEGATED_HELP.test(t)
  const helpWord = HELP_WORD.test(t) && !helpNegated
  const shortCry = helpWord && words.length <= 4
  if (strong || shortCry || (helpWord && SHOUTED_HELP.test(t))) {
    return {
      level: 'RED',
      floor: 'RED',
      headline: 'Distress words detected at bedside',
      reason: `Transcript contains a call for help, fall, or breathing words: "${t.slice(0, 140)}".`,
      nurse_action: `Go to ${roomName} immediately and check the patient.`,
    }
  }
  const clinical = helpWord || YELLOW_CLINICAL.test(t)
  const mobility = YELLOW_MOBILITY.test(t)
  if (clinical || mobility || YELLOW_SOFT.test(t)) {
    return {
      level: 'YELLOW',
      floor: clinical || (mobility && isFallRisk(ctx)) ? 'YELLOW' : 'routine',
      headline: 'Patient needs bedside assistance',
      reason: `Help request, pain, bathroom, or discomfort mentioned. Risk profile: ${ctx || 'not recorded'}.`,
      nurse_action: `Attend ${roomName} soon to assist.`,
    }
  }
  return {
    level: 'routine',
    floor: 'routine',
    headline: 'Calm bedside speech',
    reason: 'No distress or assistance keywords detected.',
    nurse_action: `No immediate action; review on the next round of ${roomName}.`,
  }
}

/**
 * Speech was detected at the bedside but the transcription service failed. We cannot know what was said,
 * so a nurse is asked to look (YELLOW, floor YELLOW) instead of silently dropping a possible cry for help.
 */
export function untranscribedVoiceVerdict(roomName: string, cause = 'transcription unavailable'): Verdict {
  return {
    level: 'YELLOW',
    floor: 'YELLOW',
    headline: 'Speech heard at bedside — could not be transcribed',
    reason: `The bedside microphone picked up speech but ${cause}. Content unknown.`,
    nurse_action: `Check on the patient in ${roomName}.`,
  }
}

export type MovementFacts = {
  frames_analyzed: number
  patient_visible: boolean
  patient_out_of_bed: boolean
  patient_lock: string
  staff_co_present_near_bed: boolean
  tracks: unknown[]
}

export function visionRules(f: MovementFacts, ctx: string, roomName: string): Verdict {
  if (f.patient_out_of_bed && f.staff_co_present_near_bed) {
    return {
      level: 'routine',
      headline: 'Assisted transfer in progress',
      reason: 'Patient is leaving the bed zone with staff present beside the bed.',
      nurse_action: 'No action — staff already at bedside.',
      floor: 'routine',
    }
  }
  if (f.patient_out_of_bed) {
    const fall = isFallRisk(ctx)
    return {
      level: fall ? 'RED' : 'YELLOW',
      headline: fall ? 'Fall-risk patient out of bed, no staff present' : 'Patient out of bed unattended',
      reason: `Origin-locked patient track left the calibrated bed zone. Risk profile: ${ctx || 'not recorded'}.`,
      nurse_action: fall ? `Go to ${roomName} immediately — unassisted bed exit.` : `Check on the patient in ${roomName}.`,
      floor: fall ? 'RED' : 'YELLOW',
    }
  }
  if (!f.patient_visible) {
    return {
      level: 'YELLOW',
      headline: 'Patient not visible to camera',
      reason: 'No patient track was found in this slice. The patient may have left the field of view or the camera is obstructed.',
      nurse_action: `Visually confirm the patient in ${roomName}.`,
      floor: 'YELLOW',
    }
  }
  return {
    level: 'routine',
    headline: 'Patient resting in bed',
    reason: 'Patient track remains inside the bed zone.',
    nurse_action: 'No action needed.',
    floor: 'routine',
  }
}
