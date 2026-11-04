# v12v6-simple — what changed (Vision + Login + AI checker only)

Base: v12v5-fixed (all its rules kept), plus the __6 Guide banner and the
admin@ulebi.com first-login change. __6 itself was NOT used as the base:
it reverted v12v5-fixed — untranscribed stored again, pad hardcoded
"Nurse Sara" again, browser speech back, "Use Demo Key" back, the
layout-preview checker claiming live verification again, and the real
checker verify/save/clear back to try/finally with no catch (silent
"does nothing"). All of those regressions are NOT in this build.

## Vision (dashboard) — same functions, plain words
- Step names: "1 · Who to watch", "2 · Start the video", "3 · Read the decision",
  with a one-line guide at the top of the page.
- Modes: "Describe in words" / "Point on screen" / "Show an example".
- Tools: "This is it" / "Not this" / "Draw a box". Classes: "What is this?"
  / "What does it look like?" / "This is the patient / staff / equipment".
- Bed zone: "Mark the bed area". Privacy: "Show video" / "Hide video
  (outlines only)". Capture: "Short video check (3.5 sec)" / "Single photo
  check". Outlines: "Standard outline" / "Detailed outline".
- Buttons: "Check now", "Watch continuously" / "Stop watching".
- Decision panel: "What the AI decided"; live picture flags in plain words
  ("Patient seen", "Out of bed", "Staff at bedside"); track roles as
  Patient / Staff / Equipment / "Not sure yet"; "How the decision was made"
  in three plain steps instead of endpoint names.
- No logic changed: same prompts, same SAM calls, same facts, same triage.

## Login — same sign-in, cleaner design
- Gradient top strip, larger card, "Welcome back" + "Sign in to the
  night-shift dashboard." Light / Dark toggle (was Daylight / Night-Shift).
- First-login box retitled "First time here? Use this account" with
  "Fill it in for me". Lockout: "Too many tries — please wait".
- "Keep me signed in on this computer", "Sign in", footer "Ulebi ·
  Night-shift ward dashboard". No auth logic changed.

## AI checker (AppShell modal) — same checks, simple words
- Title "AI connection", description in plain words, key kept on server only.
- Table: "What it does" (Listening / Watching / Second look / Deciding,
  model id kept small underneath), Key as Saved / On server / Not added,
  Status as Connected / Problem / Not connected / Ready when needed.
- Errors translated to plain sentences (key not accepted / Meta took too
  long / could not reach Meta), with the raw error kept under
  "Technical details (for support)" for debugging.
- Buttons: "Test connection", "Save and connect", "Disconnect AI".
- No checker logic changed: same verify/save/clear, same per-model errors,
  same catch-and-show behaviour from v12v5-fixed.
