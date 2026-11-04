# Ulebi v12-final__5 — FIXED (from the __5 upload, original untouched)

## Why the checker in your screenshot did nothing
Your screenshot is NOT the real app. It is the layout-only preview file
(public/home.html / public/standalone-preview.html). That file tries to call
Meta straight from the browser, which Meta blocks (CORS) and which would expose
your key in the browser. It can never verify live. The real checker is the
Next.js app's AI settings modal, which calls Meta through server routes.
In this fix the preview panel is honest: clicking Save & Verify there now says
"Preview only — no live Meta connection here" and tells you to use pnpm dev.

## Real-app checker fixes (src/components/wardni/AppShell.tsx)
- verify() / saveKeys() / clearKeys() had try/finally with NO catch. api()
  throws on any HTTP/network failure, so a failure showed no notice at all —
  the panel looked unchanged ("does nothing"). All three now catch and show
  the error as a notice.
- Voice row now shows Error (not Standby) when state is INVALID_API/UNREACHABLE.
- SAM/Spark per-model errors are now shown under the table.
- Removed the "Use Demo Key" button — that key is fake and always fails 401.

## __5 sidebar crash fixed
__5 added a Clinical Architecture Banner that used `st`, which does not exist
in SidebarContent — every AppShell page (including /guide) returned 500 at
render time, even though the build compiled. Fixed by passing snap?.api as
apiState prop. /guide, /dashboard, /voice, /vision all return 200 live.

## Other nonfunctional things fixed (v6 rules, completed)
- Untranscribed voice: triage route now 400, nothing stored. UI no longer
  stores it either — it shows "nothing stored, check the patient in person".
- Typed transcript: VoiceView transcript box is now read-only. Only mic and
  file-upload transcripts are sent.
- Browser speech: option removed from the engine select, start() refuses it,
  transcribe route no longer returns fallback:'browser'.
- Routine voice/vision with Spark down: triage route now 503, nothing stored.
  YELLOW/RED rules floors are still recorded immediately (by design).
- Pad nurse naming: no more hardcoded "Nurse Sara". With no roster it now
  says "no nurse on duty". Also fixed: an active automated-alarm escalation
  no longer makes a routine pad claim "Automated ward emergency alarm" as the
  nurse — the on-duty roster wins, otherwise "no nurse on duty".

## Verified live in this build (dev, no real key)
49 tests pass, build compiles, login, room create, voice RED rules event,
voice routine AI-down 503, untranscribed 400, pad WATER/DRINK "no nurse on
duty" with no escalation, /guide 200, checker with a fake key gives
independent per-model errors (SAM 401 / Spark timeout in one run — not the
old collapsed error). Meta reachability from this VM is flaky tonight:
attempts gave 401+401, then SAM 401 + Spark timeout, then socket error +
timeout. Retry a timeout once; a 401 proves the endpoint/model, not the key.

## Still unproven (needs a real key, on your PC)
Any live SAM/Spark/Voice/Wonder call with a real key, SAM wire parsing,
Wonder live assessment, live mic transcription, camera relay, marker-colour
identification, Usage dollar costs (still hardcoded estimates), RTSP and
two-way intercom (still not built). Run from this zip: pnpm install,
pnpm payload migrate (first run only), pnpm dev, first admin at /admin,
AI settings → paste key → Save & Verify Live.
