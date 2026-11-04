// Shared (client + server) ULEBI data shapes.

export type Level = 'RED' | 'YELLOW' | 'routine'
export type Source = 'SAM' | 'VOICE' | 'TASK' | 'ADMIN'
export type Engine = 'spark' | 'rules' | 'hardware' | 'wonder'
export type StaffRole = 'admin' | 'charge_nurse' | 'nurse'

export type BedZone = { xMin: number; yMin: number; xMax: number; yMax: number }

export type VisionClass = {
  label: string
  desc: string
  role: 'Patient' | 'Staff' | 'Object'
  color: string
  spatialPoints: { x: number; y: number; label: 0 | 1 }[]
  spatialBox: BedZone | null
}

export type EventSummary = {
  id: string
  level: Level
  headline: string
  nurseAction: string
  reason?: string
  engine?: Engine
  failSafe?: boolean
  at: string
}

export type RoomDTO = {
  id: string
  name: string
  clinicalContext?: string | null
  camUrl?: string | null
  hasCamToken?: boolean | null
  negativeExclusions?: string | null
  bedZone?: BedZone | null
  visionClasses?: VisionClass[] | null
  latestBySource?: Partial<Record<Source, EventSummary>> | null
  clearedAt?: string | null
  createdAt?: string
}

export type NurseDTO = { id: string; name: string; role?: string | null; onDuty?: boolean | null; callOrder?: number | null }

export type EscalationStatus =
  | 'INVITED'
  | 'ESCALATED_NEXT_NURSE'
  | 'UNASSIGNED_ALERT'
  | 'AUTOMATED_EMERGENCY_ALARM'
  | 'STATION_ATTENTION_REQUIRED'
  | 'ACKNOWLEDGED'

export type EscalationDTO = {
  id: string
  room: string
  roomName: string
  active: boolean
  level: 'RED' | 'YELLOW'
  status: EscalationStatus
  source?: string | null
  headline?: string | null
  nurseAction?: string | null
  queue?: { id: string; name: string }[] | null
  queueIndex?: number | null
  assignedNurseName?: string | null
  attempt?: number | null
  timeoutSec?: number | null
  deadline?: string | null
  repeatCount?: number | null
  acknowledgedBy?: string | null
  acknowledgedAt?: string | null
  history?: { at: string; type: string; [k: string]: unknown }[] | null
  updatedAt?: string
  createdAt?: string
}

export type WardEventDTO = {
  id: string
  room?: string | null
  roomName?: string | null
  source: Source
  level: Level
  engine?: Engine | null
  failSafe?: boolean | null
  headline?: string | null
  reason?: string | null
  nurseAction?: string | null
  detail?: string | null
  latencyMs?: number | null
  tokens?: string | null
  createdAt: string
}

export type ApiState = 'NOT_CONFIGURED' | 'CHECKING' | 'LIVE' | 'INVALID_API' | 'UNREACHABLE'

export type ApiStatus = {
  state: ApiState
  samVerified: boolean
  sparkVerified: boolean
  samLatencyMs: number | null
  sparkLatencyMs: number | null
  samError?: string
  sparkError?: string
  lastError: string
  checkedAt: string | null
  sparkModel: string
  samModel: string
  /** Muse Wonder (movement assessment). `wonderMode` is off | gated | always. */
  wonderModel: string
  wonderMode: string
  /** Muse Voice Transcribe (server-side speech-to-text). */
  voiceModel: string
  voiceReady: boolean
}

export type ApiLog = {
  id: string
  time: string
  model: string
  endpoint: string
  status: number | string
  latencyMs: number
  note?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  roomId?: string
  roomName?: string
  actorId?: string
  actorName?: string
  level?: Level
}

export type AuditEntry = {
  id: string
  at: string
  actorId: string
  actorName: string
  actorRole: StaffRole
  action: string
  target: string
  detail: string
  level?: Level | 'INFO'
}

export type ModelKey = 'voice' | 'sam' | 'wonder' | 'spark'

export type ModelUsageRow = {
  key: ModelKey
  modelId: string
  label: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requests: number
  pricePer1kUsd: number
  costTodayUsd: number
  costShiftUsd: number
  costMonthUsd: number
  avgLatencyMs: number
}

export type SpendSeriesPoint = {
  label: string
  timestamp: string
  currentUsd: number
  previousUsd: number
  averageUsd: number
  tokens: number
  requests: number
  byModelUsd: Record<ModelKey, number>
}

export type UsageSummary = {
  headlineSpendUsd: number
  avgDailySpendUsd: number
  avgMonthlySpendUsd: number
  budgetLimitUsd: number
  budgetAlertThresholdPct: number
  budgetExceeded: boolean
  budgetWarning: boolean
  totalCallsMonth: number
  totalTokensMonth: number
  totalCostMonthUsd: number
  models: ModelUsageRow[]
  series24h: SpendSeriesPoint[]
  series7d: SpendSeriesPoint[]
  series3m: SpendSeriesPoint[]
  byActor: Record<string, { requests: number; tokens: number; costUsd: number }>
}

export type AccessRequestDTO = {
  id: string
  name: string
  email: string
  requestedRole: StaffRole
  note?: string
  requestedAt: string
  type: 'signup' | 'reset'
}

export type MasterSummary = { overall_level: Level; ward_headline: string; priority_plan: string; updatedAt: string; engine?: Engine }

export type WardSnapshot = {
  serverTime: string
  rooms: RoomDTO[]
  nurses: NurseDTO[]
  escalations: EscalationDTO[]
  events: WardEventDTO[]
  escalationTimeoutSec: number
  masterSummary: MasterSummary | null
  api: ApiStatus
  apiLogs: ApiLog[]
  auditLogs?: AuditEntry[]
  usage?: UsageSummary
  budgetLimitUsd?: number
  idleLockMinutes?: number
  accessRequests?: AccessRequestDTO[]
  me: { id: string; name: string; email: string; role: StaffRole }
}

export const LEVEL_RANK: Record<string, number> = { routine: 1, YELLOW: 2, RED: 3 }

export const TASKS = [
  { id: 'EMERGENCY HELP', label: 'Help', sub: 'Emergency' },
  { id: 'BATHROOM ASSIST', label: 'Bathroom', sub: 'Help me get up' },
  { id: 'WATER', label: 'Water', sub: 'Glass of water' },
  { id: 'DRINK', label: 'Drink', sub: 'Juice, tea, other' },
  { id: 'EAT', label: 'Eat', sub: 'Meal or snack' },
  { id: 'PAIN / COMFORT', label: 'Pain / Comfort', sub: 'Pain, blanket, position' },
] as const

export type TaskId = (typeof TASKS)[number]['id']

/** A room's current level: highest of its module verdicts recorded after the last "mark stable". */
export function roomLevel(room: RoomDTO): Level | 'STANDBY' {
  const cleared = room.clearedAt ? Date.parse(room.clearedAt) : 0
  let best: Level | 'STANDBY' = 'STANDBY'
  for (const ev of Object.values(room.latestBySource || {})) {
    if (!ev || Date.parse(ev.at) <= cleared) continue
    if (best === 'STANDBY' || LEVEL_RANK[ev.level] > LEVEL_RANK[best]) best = ev.level
  }
  return best
}
