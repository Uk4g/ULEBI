import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers.mjs'

const analytics = load('analytics')

test('computeUsageSummary aggregates real token counts, costs, and budget threshold alerts across all 4 Meta models', () => {
  const nowMs = Date.parse('2026-11-03T16:00:00Z')
  const events = [
    {
      id: 'ev1',
      room: 'r1',
      roomName: 'Room 204',
      source: 'SAM',
      level: 'RED',
      engine: 'wonder',
      headline: 'Unassisted exit',
      reason: 'Left bed',
      nurseAction: 'Attend immediately',
      latencyMs: 720,
      tokens: '3000',
      createdAt: '2026-11-03T15:30:00Z',
    },
    {
      id: 'ev2',
      room: 'r2',
      roomName: 'Room 208',
      source: 'VOICE',
      level: 'YELLOW',
      engine: 'spark',
      headline: 'Bathroom assist',
      reason: 'Requested bathroom',
      nurseAction: 'Assist patient',
      latencyMs: 410,
      tokens: '500',
      createdAt: '2026-11-03T15:40:00Z',
    },
  ]
  const apiLogs = [
    {
      id: 'l1',
      time: '2026-11-03T15:50:00Z',
      model: 'muse-voice-transcribe-1.0',
      endpoint: 'POST /asr/transcribe',
      status: 200,
      latencyMs: 260,
      note: '3000 ms audio',
      inputTokens: 360,
      outputTokens: 90,
      totalTokens: 450,
      actorName: 'Sara Mansouri, RN',
    },
  ]

  const summary = analytics.computeUsageSummary({
    events,
    apiLogs,
    budgetLimitUsd: 0.1,
    budgetAlertThresholdPct: 80,
    nowMs,
  })

  assert.equal(summary.models.length, 4)
  const wonderRow = summary.models.find((m) => m.key === 'wonder')
  const sparkRow = summary.models.find((m) => m.key === 'spark')
  const voiceRow = summary.models.find((m) => m.key === 'voice')
  assert.ok(wonderRow.totalTokens >= 3000)
  assert.ok(sparkRow.totalTokens >= 500)
  assert.ok(voiceRow.totalTokens >= 450)
  assert.ok(summary.totalCostMonthUsd > 0)
  assert.equal(summary.budgetWarning, true)
  assert.equal(summary.series24h.length, 12)
  assert.equal(summary.series7d.length, 7)
  assert.equal(summary.series3m.length, 12)
  assert.ok(summary.byActor['Sara Mansouri, RN'].tokens >= 450)
})

test('replayStateAtSecond reconstructs exact room statuses and active nurse call countdown at 1-second resolution', () => {
  const rooms = [
    { id: 'r1', name: 'Room 204', clinicalContext: 'Fall risk', latestBySource: {}, clearedAt: null },
    { id: 'r2', name: 'Room 208', clinicalContext: 'NPO', latestBySource: {}, clearedAt: null },
  ]
  const events = [
    {
      id: 'e1',
      room: 'r1',
      roomName: 'Room 204',
      source: 'VOICE',
      level: 'YELLOW',
      engine: 'spark',
      headline: 'Pain reported',
      nurseAction: 'Check patient',
      createdAt: '2026-11-03T15:00:10Z',
    },
    {
      id: 'e2',
      room: 'r1',
      roomName: 'Room 204',
      source: 'SAM',
      level: 'RED',
      engine: 'wonder',
      headline: 'Out of bed unattended',
      nurseAction: 'Go now',
      createdAt: '2026-11-03T15:00:40Z',
    },
  ]
  const escalations = [
    {
      id: 'esc1',
      room: 'r1',
      roomName: 'Room 204',
      active: true,
      level: 'RED',
      status: 'INVITED',
      headline: 'Out of bed unattended',
      queue: [
        { id: 'n1', name: 'Nurse Sara' },
        { id: 'n2', name: 'Nurse Karim' },
      ],
      timeoutSec: 30,
      createdAt: '2026-11-03T15:00:40Z',
      acknowledgedAt: '2026-11-03T15:01:30Z',
    },
  ]
  const nurses = [
    { id: 'n1', name: 'Nurse Sara', role: 'Charge Nurse', onDuty: true, callOrder: 1 },
    { id: 'n2', name: 'Nurse Karim', role: 'Ward RN', onDuty: true, callOrder: 2 },
  ]

  // At 15:00:05Z -> before any event -> Room 204 is STANDBY
  const s0 = analytics.replayStateAtSecond({
    rooms,
    events,
    escalations,
    nurses,
    apiLogs: [],
    targetMs: Date.parse('2026-11-03T15:00:05Z'),
  })
  assert.equal(s0.rooms[0].level, 'STANDBY')
  assert.equal(s0.activeCalls.length, 0)

  // At 15:00:20Z -> after YELLOW voice event, before RED -> Room 204 is YELLOW
  const s1 = analytics.replayStateAtSecond({
    rooms,
    events,
    escalations,
    nurses,
    apiLogs: [],
    targetMs: Date.parse('2026-11-03T15:00:20Z'),
  })
  assert.equal(s1.rooms[0].level, 'YELLOW')

  // At 15:00:50Z -> 10s into RED escalation -> step 1/2 (Nurse Sara), 20s remaining
  const s2 = analytics.replayStateAtSecond({
    rooms,
    events,
    escalations,
    nurses,
    apiLogs: [],
    targetMs: Date.parse('2026-11-03T15:00:50Z'),
  })
  assert.equal(s2.rooms[0].level, 'RED')
  assert.equal(s2.activeCalls.length, 1)
  assert.equal(s2.activeCalls[0].assignedNurseName, 'Nurse Sara')
  assert.equal(s2.activeCalls[0].stepIndex, 1)
  assert.equal(s2.activeCalls[0].remainingSec, 20)

  // At 15:01:15Z -> 35s into RED escalation -> step 2/2 (Nurse Karim), 25s remaining
  const s3 = analytics.replayStateAtSecond({
    rooms,
    events,
    escalations,
    nurses,
    apiLogs: [],
    targetMs: Date.parse('2026-11-03T15:01:15Z'),
  })
  assert.equal(s3.activeCalls[0].assignedNurseName, 'Nurse Karim')
  assert.equal(s3.activeCalls[0].stepIndex, 2)
  assert.equal(s3.activeCalls[0].remainingSec, 25)
})

test('answerWardQuestion provides grounded clinical answers and timeline timestamps', () => {
  const snap = {
    rooms: [{ id: 'r1', name: 'Room 204', clinicalContext: 'Post-op hip' }],
    nurses: [{ id: 'n1', name: 'Sara Mansouri', role: 'Charge Nurse', onDuty: true }],
    escalations: [{ id: 'esc1', room: 'r1', roomName: 'Room 204', active: true, level: 'RED', assignedNurseName: 'Sara Mansouri', status: 'INVITED' }],
    events: [{ id: 'ev1', room: 'r1', roomName: 'Room 204', source: 'SAM', level: 'RED', headline: 'Unassisted bed exit', nurseAction: 'Attend Room 204', createdAt: '2026-11-03T15:10:00Z' }],
  }
  const ans = analytics.answerWardQuestion('Which rooms escalated tonight?', snap)
  assert.match(ans.reply, /Room 204/)
  assert.equal(ans.timelineTimestamp, '2026-11-03T15:10:00Z')
})
