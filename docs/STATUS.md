# Status — proven vs unproven

Updated 4 Nov 2026, against the `ulebi-v12v5-fixed` build, now included in full in `app/`.

## Proven

- 49 tests pass; `pnpm build` compiles with all routes.
- Login and auth gating; room creation; voice routine and RED rules events;
  pad WATER and EMERGENCY HELP; escalation creation; merge directive (RED first).
- Checker: SAM and Spark handshakes run in parallel with independent per-model
  errors; `voiceReady` is true only when state is LIVE; Wonder is shown as
  "Ready (gated)", not LIVE, because Wonder is never handshaken.
- A fake key returns real Meta errors (for example `SAM HTTP 401` /
  `Spark HTTP 401`), proving the endpoints and model strings reach Meta's auth stage.
- No-fake-data rules: untranscribed → 400; routine with Spark down → 503;
  transcript box read-only; browser speech removed; vision slices video-only;
  silent WAVs rejected server-side; routine pads name a nurse or say none on duty;
  routine pads create no escalation; guide no longer claims a scrape-audio setting.

## Fixed in v12v5-fixed (from the v12-final__5 upload)

- Preview checker honesty: the layout-only preview file can never verify keys
  from a browser, so it now says so instead of pretending.
- Real checker error handling: verify/save/clear previously swallowed failures
  silently; they now show a notice with the error.
- Sidebar crash: the __5 banner used an undefined variable and made every
  AppShell page return 500 at render time. Fixed.
- Removed the fake "Use Demo Key" button.
- Pad nurse naming: no more hardcoded nurse name, and an automated-alarm
  escalation is no longer presented as a nurse.

## Not proven — do not claim these

- Any live SAM, Spark, Voice, or Wonder call with a real key.
- SAM wire parsing against a real payload (the parser is written against
  documented/example shapes and mocked wires only).
- Wonder live assessment, live mic transcription, camera relay with a real stream.
- Patient identification by marker colour + bed zone (proposal, untested).
- Usage dollar costs (hardcoded price estimates; handshake tokens are estimates).
- RTSP camera input and two-way intercom (not built; voice is patient → nurse only).
- A public live link or host (none verified); domain registration unverified.

## Known limits

- Meta reachability from some networks is flaky: consecutive fake-key checks
  returned 401+401, then SAM 401 + Spark timeout, then a socket error + timeout.
  Retry a timeout once.
- The dashboard logo is still a shield mark, not the woven-ring logo
  (a mark-only export is needed for the 28 px slot). Cosmetic only.
- SAM latency and real cost per clip have never been measured.
