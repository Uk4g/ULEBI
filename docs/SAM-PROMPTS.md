# SAM prompts — text, visual (spatial), and exemplar

SAM 3.1 in Ulebi is prompted in three ways, all in Vision Step A, one SAM call
per class, in parallel. The prompt is always sent as `input_text` next to the
visual input in `POST /v1/responses` (`stream: true`, `mask_encoding: one_bit`
by default), and SAM returns a wire of per-frame boxes that the app parses
into tracks.

## 1. Text prompt — name it in words

Built by `buildClassPrompt` in text mode:

```
label (desc)
```

Defaults shipped with every room:

| Class | Text prompt sent to SAM | Role |
|---|---|---|
| Patient | `patient in bed (person lying in hospital bed wearing patient gown)` | Patient |
| Staff | `medical staff (nurse or doctor standing beside bed in scrubs or coat)` | Staff |

Rules:

- Up to 8 classes per room. Each class has a label, a visual description, a role
  (Patient / Staff / Object), and a colour for the wireframe.
- If a class has no description, only the label is sent.
- The description is appended into the same text string — it is not a separate
  API field. That is this project's construction, not a documented SAM parameter.
- Negative exclusions (default: `medical staff, nurse, doctor, visitor`) are
  not sent to SAM. They are a post-filter: any track whose label matches an
  exclusion is classified `STAFF_OR_EXCLUDED` and can never become the patient.

## 2. Visual prompt (spatial) — point at it instead of naming it

When a class is in spatial mode and has a box or points drawn on the overlay,
the prompt is not words at all. It is a `<0f>` token string:

```
<0f>1<|box;x1=320;y1=180;x2=900;y2=620;w=1280;h=720|><|point;x=600;y=400;label=1;w=1280;h=720|>
```

- The nurse draws a box and/or clicks points on the room overlay in Vision Step A.
- Coordinates are pixels in the source resolution (`w`, `h` are the source size).
- A box says "this area". A point with `label=1` says "this spot is the thing".
- Spatial mode only applies when a box or points exist; otherwise the class
  falls back to its text prompt.

This is the visual prompt: you show SAM where, instead of telling it what.

## 3. Exemplar prompt — show it one example, then name it

1. The nurse uploads or crops one example image of the object (for example,
   a crop of the patient's gown, or an IV pole).
2. Spark turns that crop into a short visual noun phrase, 2–5 words, via
   `exemplarPhrase` — for example `patient in blue hospital gown` or
   `metal rolling iv pole`.
3. That phrase replaces the class label as the SAM text prompt for the run.
4. If Spark is not LIVE, `exemplarPhrase` returns nothing and the original
   label is used unchanged.

## Related: patient photo lock (Spark, not SAM)

Patient lock is a separate Spark call, not a SAM prompt:

1. Admission reference photo + live Frame-0 snapshot go to Spark (`locatePatient`).
2. Spark returns a box in normalized 0.0–1.0 coordinates plus a `visual_desc`.
3. The box becomes the class's spatial box; the description becomes its `desc`.
4. From then on, the class prompts SAM with that description, and tracks are
   resolved against the locked box (continuity first, then bed zone, then
   single-person track — otherwise `UNRESOLVED_PERSON`).

## What SAM returns, and what happens next

SAM's streamed output is parsed as a wire like:

```
<0f>1<|box;x1=320;y1=180;x2=900;y2=620;w=1280;h=720|>
```

The parser turns each frame's boxes into tracks (one track ID per object,
identity preserved across frames by SAM), then `computeFacts` derives:

- `patient_visible`, `patient_out_of_bed`, `staff_co_present_near_bed`
- `patient_lock` (continuity / origin_bed / single_person_track / none)
- per-track bed overlap percentages

Those facts go to the triage route (Spark, with gated Wonder), never raw video.

## Positive and negative points

### Text prompt

| Positive | Negative |
|---|---|
| Zero setup — type a label and it runs | Ambiguous: "patient" also matches visitors and staff in the same frame |
| Fast, easy to edit per room | Cannot tell two patients apart, or the same patient from another person |
| No image or drawing needed | Depends entirely on SAM's language reading of the words |
| One call per class, in parallel | The description is just appended text, not a separate SAM field — its effect is unproven live |
| Works well for common, distinct classes | Needs the bed-zone + lock logic downstream to actually identify the patient |

### Visual (spatial) prompt

| Positive | Negative |
|---|---|
| Precise — you point at the exact person or area | Manual setup: someone must draw the box/points for every room |
| Disambiguates where words fail | Breaks if the camera moves, the bed moves, or the resolution changes (pixel coordinates) |
| Powers the patient lock (continuity across slices) | More setup time than text, per room, per class |
| Works even when the object is hard to describe | Still needs downstream track resolution — a box alone does not name a role |
| No extra model call | Token format (`<0f>`, box/point grammar) is code, never proven against a live SAM payload |

### Exemplar prompt

| Positive | Negative |
|---|---|
| Best for specific things words miss (a particular gown, an IV pole) | Needs Spark LIVE first — an extra model call, extra latency, extra cost |
| Adapts to the ward's actual visuals, not a generic label | If the crop is bad, the phrase is generic or wrong |
| The resulting phrase is short and SAM-friendly (2–5 words) | If Spark fails, it silently falls back to the original label — the run still happens, just without the exemplar |
| No training, no dataset needed | The crop itself is never sent to SAM, only the phrase — so SAM never sees the example |

### SAM tracking overall

| Positive | Negative |
|---|---|
| Native video tracking, identity preserved across frames, zero-shot | Wire parsing unproven against a real payload |
| No custom tracker, no training, no YOLO/ByteTrack needed | Cost and latency per clip never measured; continuous use on all rooms is unaffordable on credits |
| One call per class, streamed, with mask output | Up to 16 objects per frame — a crowded room can hit the cap |
| Works from a snapshot or a video file_id | Colour-based descriptions fail on IR night cameras (colour is invisible in IR) |
| Negative exclusions are cheap insurance against staff misclassification | Exclusions match on label text only — if SAM labels staff as "patient", the filter does not catch it |

## What is not yet proven

- The wire grammar above is the parser's expectation, written against
  documented/example shapes. It has never been checked against a real SAM
  payload with a real key.
- Whether SAM accepts the `<0f>` spatial tokens and the exemplar-derived
  phrases exactly as sent is code, not a live result.
- The checker handshake uses a different, tiny prompt — the word `square`
  plus a 64×64 calibration PNG — only to prove the endpoint answers. It is
  not a vision prompt and proves nothing about tracking.
