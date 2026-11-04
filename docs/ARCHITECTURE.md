# Architecture

## One deployment = one ward

Ulebi is a single-instance server app (Next.js 16 + Payload), not multi-tenant SaaS.
One deployment has one admin key, its own rooms, beds, cameras, and nurses.
A public demo runs a sample ward without a key, with the RULES fallback labelled as such.
"Everyone can use it" means the repo is public: anyone clones it, sets their own key,
and runs their own instance.

## Sections, in build order

1. **SAM (Vision)** — live camera, clip, or webcam input; live video + wireframe overlay,
   track IDs, analyser states, settings (prompt, bed zone, marker colour, camera source, key status).
   Spark studies the SAM output alone and produces a SAM-only verdict.
2. **Voice** — mic or audio file via Muse Voice Transcribe; Spark alone produces a voice-only verdict.
3. **Task buttons (bedside pads)** — HELP, WATER, DRINK, EAT, BATHROOM, PAIN/COMFORT.
   Each press goes to Spark alone and produces a task verdict.
4. **Combined dashboard** — merges the three section outputs plus all rooms and patients
   into one ward order, RED first. The merge is a Spark call over room snapshots, and it
   can never read calmer than the room boards.
5. **Nurse call + escalation** — the system invites a nurse. No acknowledge in the configured
   window (default 45 s, configurable 15–300 s) → next nurse. Still nothing + RED →
   automated alarm/notification. Alerting only; care decisions stay with the nurse.

## Pipeline

```
SAM / Voice / Task
  → Rules floor (deterministic, instant, labelled RULES)
  → Spark, raise-only (may raise or enrich, never lower)
  → Wonder, gated (non-routine, out of bed, not visible, or unresolved person;
     ≥15 s per room, 3-failure circuit breaker)
  → MERGE (Spark master summary, forced to the highest room level)
  → Escalation chain (one active escalation per room, upgrades in place)
```

- RED/YELLOW floors are recorded immediately, before any AI call, so a slow or failing
  AI can never delay an alarm.
- Routine inputs wait for Spark. If Spark is down, routine inputs return 503 and are
  stored as nothing. TASK presses are the exception: a patient's request is always stored.
- Routine SAM verdicts are de-duplicated (same routine verdict within 5 minutes is not re-stored).

## Patient vs staff resolution

SAM's prompt returns every person in frame. Resolution order in code:

1. Continuity lock (track overlap / centre distance).
2. Track starting mostly inside the bed zone.
3. Single-person track.
4. Otherwise `UNRESOLVED_PERSON` — never silently assigned to staff or patient.

Staff comes only from Staff-role classes or exclusion keywords. No face recognition.
A bright marker colour per patient/bed plus the bed-zone filter is the proposed
identification fix; it is untested.

## Camera relay

Room cameras go through a server-side relay (`/ward-api/cam/[roomId]`).
It supports HLS, MJPEG, and MP4 only — not RTSP. URLs are SSRF-validated, and
credentials in a camera URL are moved server-side into a token, never sent to the browser.
Recorded clips and old footage are test inputs only; the product input is live
hospital camera streams (IP cameras, IR at night).

## Data model

- **Rooms** — name, clinical risk profile, camera URL, bed zone, vision classes,
  negative exclusions (default: medical staff, nurse, doctor, visitor).
- **Nurses / staff** — name, role, on-duty flag, call order.
- **Events** — source (SAM/VOICE/TASK), level (RED/YELLOW/routine), engine
  (spark / wonder / rules), headline, reason, nurse action, detail.
- **Escalations** — one active per room, queue from the on-duty roster,
  acknowledge / advance recorded, repeats recorded, upgrades in place.
- **API log / audit log** — every Meta call and every key action, with token
  estimates where the API returns no usage. Handshake token counts are estimates,
  not measured billing. Usage dollar costs are hardcoded price estimates.

## Key handling

- One Meta Model API key connects SAM, Spark, Voice Transcribe, and Wonder.
- Keys live in server process memory only (≤512 chars, clearable, with `.env` fallback).
- The dashboard shows connected / not-connected only. It never echoes a key.
- Settings routes: GET requires staff, POST requires admin. The verify route lets any
  staff re-run the handshake, but only an admin's pasted key values are applied.
