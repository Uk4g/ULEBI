import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers.mjs'

const { computeFacts, parseSamWire, overlapPct } = load('vision')
const { isPrivateOrLoopbackIp, sanitizeCameraUrl } = load('ssrf')
const BED = { xMin: 0.2, yMin: 0.2, xMax: 0.8, yMax: 0.8 }
const pt = (id, cls, role, b) => ({ frameIndex: 0, trackId: id, classLabel: cls, declaredRole: role, color: '#fff', nx1: b[0], ny1: b[1], nx2: b[2], ny2: b[3], cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 })

test('vision: a patient lying across the full bed width is NOT flagged as leaving (v3.1 rail false positive)', () => {
  const t = { 'p#1': [pt('p#1', 'patient in bed', 'Patient', [0.2, 0.3, 0.8, 0.7]), pt('p#1', 'patient in bed', 'Patient', [0.18, 0.3, 0.82, 0.7])] }
  assert.equal(computeFacts(t, BED, '', null).facts.patient_out_of_bed, false)
})

test('vision: a patient who starts on the floor outside the bed is still the patient, never staff (v3.1 bug #4)', () => {
  const t = { 'p#1': [pt('p#1', 'patient in bed', 'Patient', [0.0, 0.85, 0.25, 0.98])] }
  const { facts } = computeFacts(t, BED, '', null)
  assert.equal(facts.patient_lock, 'single_person_track')
  assert.equal(facts.tracks[0].resolved_role, 'ORIGIN_LOCKED_PATIENT')
  assert.equal(facts.patient_out_of_bed, true)
})

test('vision: the lock carries across rolling slices and a visitor is never promoted to patient', () => {
  const slice1 = { 'p#1': [pt('p#1', 'patient in bed', 'Patient', [0.3, 0.3, 0.7, 0.7])] }
  const { newLock } = computeFacts(slice1, BED, '', null)
  const slice2 = {
    'p#9': [pt('p#9', 'patient in bed', 'Patient', [0.05, 0.1, 0.15, 0.5])], // someone else, far from the bed
    'p#2': [pt('p#2', 'patient in bed', 'Patient', [0.32, 0.3, 0.72, 0.7])], // continues the locked box
  }
  const { facts } = computeFacts(slice2, BED, '', newLock)
  assert.equal(facts.patient_lock, 'continuity')
  assert.equal(facts.tracks.find((t) => t.track_id === 'p#2').resolved_role, 'ORIGIN_LOCKED_PATIENT')
  assert.equal(facts.tracks.find((t) => t.track_id === 'p#9').resolved_role, 'UNRESOLVED_PERSON')
})

test('vision: staff come only from Staff-role classes or exclusion keywords', () => {
  const t = { 'p#1': [pt('p#1', 'patient in bed', 'Patient', [0.3, 0.3, 0.7, 0.7])], 'n#1': [pt('n#1', 'nurse', 'Patient', [0.75, 0.3, 0.9, 0.9])] }
  const { facts } = computeFacts(t, BED, 'nurse, doctor', null)
  assert.equal(facts.tracks.find((x) => x.track_id === 'n#1').resolved_role, 'STAFF_OR_EXCLUDED')
  assert.equal(facts.staff_co_present_near_bed, true)
})

test('parseSamWire: handles newline-separated objects and falls back to the real source size', () => {
  const cls = { label: 'patient', desc: '', role: 'Patient', color: '#fff', spatialPoints: [], spatialBox: null }
  const wire = '<0f>1<|box;x1=100;y1=50;x2=300;y2=250|>\n2<|box;x1=400;y1=60;x2=500;y2=260|><1f>1<|box;x1=110;y1=50;x2=310;y2=250|>'
  const p = parseSamWire(wire, cls, 0, 1000, 500)
  assert.equal(p.frames.length, 2)
  assert.equal(p.frames[0].objects.length, 2)
  assert.ok(Math.abs(p.frames[0].objects[0].nx2 - 0.3) < 1e-9)
  assert.ok(Math.abs(p.frames[0].objects[0].ny2 - 0.5) < 1e-9)
})

test('ssrf: private, loopback, link-local, metadata and mapped-IPv6 addresses are blocked; public are allowed', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.5', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '[::1]', 'not-an-ip']) assert.equal(isPrivateOrLoopbackIp(ip), true, ip)
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPrivateOrLoopbackIp(ip), false, ip)
})

test('ssrf: camera credentials are lifted out of the URL', () => {
  const r = sanitizeCameraUrl('http://admin:p%40ss@cam.example.com/stream')
  assert.equal(r.url, 'http://cam.example.com/stream')
  assert.equal(r.token, `Basic ${Buffer.from('admin:p@ss').toString('base64')}`)
  assert.ok(sanitizeCameraUrl('ftp://x').error)
})
