# Plumbing — rewrite audit

Baseline: `flows:lint plumbing` reported 78 errors and 4 warnings across 43
steps (3,420 words). After the rewrite: 0 errors, 0 warnings, 2,929 words. No
step, button, route (`to_step_key`), variant, or sort order changed; 9 button
labels were reworded.

The Plumbing flow is the HVAC flow with plumbing nouns (plumber, water heater,
drains, water bill), so the findings largely mirror `hvac.audit.md`; the
plumbing-specific ones are listed here.

## Findings

**Structural (blocked `flows:apply`)**
- `{{asked_by}}` in `open`, `{{practice_phone}}` twice in `voicemail`,
  `{{rec_pronoun_cap}}` in `scheduling`. Same fixes as HVAC:
  `{{asked_by_provider}}`, `(your office number)`, "We".

**Long multi-option questions (R1, R2)**
- `digging_in` had eight questions, five of them doubled ("How's the hot
  water? Plenty for everyone, or does it run out faster?"; "How's the water
  itself? Any taste, smell, or hard-water spots?"). Each is now one question.
  "Have you noticed the water bill creeping up?" had no button of its own (it
  belongs to the leaks focus screen, where it now lives), so the count went
  from eight to seven, matching the seven focus buttons.
- `f_waterheater` ("run out faster, take forever, or both? And how old?"),
  `f_drains`, `f_leaks` ("Which is it? A faucet, a toilet, or the bill?"),
  `f_pressure`, `f_quality`, `f_sump` all stacked two or three questions.
  Split with `(Let them answer.)` between.
- `svc_while` / `svc_unknown` 43- and 44-word recommendation sentences that
  listed "the water heater, the drains, the shutoff valves" inside a
  subordinate clause. The list is now its own short sentence.
- `urgent`: "If sewage is backing up or water is actively flooding: shut off
  the main water valve if you can get to it safely, and let's get a plumber
  out to you as an emergency call. Today." (35 words). Now three sentences.

**Stock phrases and flourishes (R4)**
- "honestly" (×5), "I completely understand" (×3), "that makes complete
  sense" (×2), "here's the thing about clogs", "every single day", "exactly
  the kind of thing we love to help with", "thrilled", "yes-yes", "waste your
  time or your money", "that yes is the moment".
- "quieter than it is cheap", "quietly add to your water bill", "nobody
  should be rationing hot water" — the last kept, the first two cut.

**Invented claims (R5)** — none.

**Coaching notes (R7)**
- Bare "Let them answer." and "Be empathetic and listen. Do NOT try to book"
  lines on `resp_problems` / `svc_while` rendered as speech ("empathetic" is
  also on the swap table).
- "Can I share why I ask? (Wait for their response.)" glued on three screens.
- `f_quality` listed the hard-water symptoms as a spoken sub-question; they
  are now a coaching note the caller can use if the customer hesitates.
- Same "Confirm and continue" tail on every objection.

**Objection tails (R9)** — same four distinct closings as HVAC.

**Vocabulary (R3)** — "sediment" kept (customers say it); "assess" → "take a
real look"; "aging pipes" → "older pipes"; "inexpensive" → "cheap";
"treating the symptom, not the cause" kept, it is plain speech.

**Punctuation / titles** — same colon-as-joint fixes and shortened titles as
HVAC; "Focus: Fixtures, Disposal & Projects" → "Focus: fixtures, disposal,
and projects".

## Chips (R10)

Plumbing had no chips. Seven were added in `concern-options.ts` matching the
`digging_in` buttons in order (Hot water running out, Slow drains or clogs,
Drips or running toilets, Low water pressure, Water taste smell or hard water,
Sump pump, Disposal fixtures or a project). `recommendation` says "takes a
look at {{main_concern}}".

## Left as found / for review

- Same player-side "Original complaint" chip note as HVAC.
- `open` still offers "“We had it all redone”" → `replaced`; the label is the
  literal thing a customer says and was kept.
- Med Spa: see `hvac.audit.md` (inactive, no flow rows, untouched).
