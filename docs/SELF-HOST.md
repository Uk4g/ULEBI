# Self-host

Full guide, first setup to last step (Meta credits and key, room hardware, bed
zones, AI check, daily use): [SETUP-GUIDE.md](SETUP-GUIDE.md). This page is the
short version.

**Room hardware required:** an IR / low-light camera per room (HLS, MJPEG, or
MP4 stream — not raw RTSP) and a microphone per room (bedside mic, or a camera
with a built-in mic used as that room's mic input). Vision video checks are
video-only; voice goes through the voice section's mic or audio file.

Ulebi is a Next.js 16 + Payload app. It needs Node 24+ and pnpm 9–11.

## First run

```bash
cd app
pnpm install
pnpm payload migrate   # first run only — creates the tables
pnpm dev               # first admin at /admin
```

Notes:

- `pnpm payload migrate` does not read `.env` — export `PAYLOAD_SECRET` and an
  absolute `DATABASE_URL` in the shell first (sourcing `.env` works).
- The included SQLite file does not survive an ephemeral host. Use a host with a
  persistent disk (a VPS, or Railway with a volume mounted at the database path).
  There is NO Postgres adapter in this code — the earlier "Postgres swap" note was
  a documentation error and has been removed.
- Never put a real Meta key in `.env`, chat, a preview file, or the repo.

## Check the Meta connection

1. Sign in as admin, open the header AI pill → **AI settings**.
2. Paste your Meta API key (buy Meta Model API credits first — no credits, no AI),
   click **Save and connect**.
3. Pass is per-model **Connected** in the AI connection table. A failure shows the
   exact per-model error in plain words (for example `SAM HTTP 401` / `Spark HTTP 401`
   separately, with the raw error under "Technical details").
4. If a check times out on the first try, retry once — Meta reachability can be
   flaky. A timeout is not proof of a bad key; a 401 is proof the endpoint and
   model string are accepted and the key is rejected.

## What each screen does

- **Dashboard** — ward order, RED first, plus the shift directive (Synthesize Shift /
  Morning Handoff — the same merge call).
- **Vision** — per room: classes + bed zone, webcam or `.mp4`/`.mov` clip (max 40 MB),
  3.5 s slices, wireframe overlay. Refuses to run unless SAM is LIVE.
- **Voice** — bedside mic (Muse Voice Transcribe only) or audio/video file upload
  (decode, silence, and empty-transcript checks). Transcript is read-only.
- **Tasks / pads** — bedside pad at `/pad/[roomId]` with its secret pad key.
  Routine presses name the nurse notified, or say no nurse is on duty.
  Routine presses do not create a RED/YELLOW escalation.
- **Staff, Rooms, Calendar, Usage, Guide, AI assistant** — roster, camera settings,
  replay, cost estimates (from the API log; handshake tokens are estimates),
  in-app guide, and a ward-grounded assistant.

## When AI is down

- RED/YELLOW rules events are still recorded immediately, labelled RULES.
- Routine voice/vision requests return 503 and store nothing.
- Untranscribed speech returns 400 and stores nothing.
- The dashboard keeps showing `AI OFFLINE · RULES` instead of faking LIVE.
