# HVAC — rewrite audit

Baseline: `flows:lint hvac` reported 78 errors and 3 warnings across 43 steps
(3,411 words). After the rewrite: 0 errors, 0 warnings, 2,867 words. No step,
button, route (`to_step_key`), variant, or sort order changed; 7 button labels
were reworded.

HVAC talks to a customer about a system, so the guide's nouns change (customer,
technician, house, service records) but every rule applies as written.

## Findings

**Structural (blocked `flows:apply`)**
- `open` used `{{asked_by}}` and `voicemail` used `{{practice_phone}}` twice;
  the player fills neither, so they rendered as raw placeholders and `apply`
  refused the file. Replaced with `{{asked_by_provider}}` and a spoken
  `(your office number)` placeholder, as the guide's known-findings list says.
- `scheduling` used `{{rec_pronoun_cap}}` (R8). Now "We".

**Long multi-option questions (R1, R2)** — 23 R1 errors, 30 R2 errors.
- `opening_question` stacked all three answers inside one question. Now the
  three-things statement, then "Which one is closest for you?"
- `resp_great` asked "when was it serviced?" and "recently, a while, or not
  sure?" in one breath. The options moved into the coaching note (they are the
  three buttons).
- `digging_in` had eight questions, several doubled ("Is the heating keeping
  up? Does the house actually get to the temperature you set?"; "How's the
  thermostat? Easy to work with, doing what you tell it?"). Each is now one
  short question. The "turning on and off more often" question had no button
  and no chip, so it was dropped (chips win); the count went from eight to
  seven, matching the seven focus buttons.
- Every `f_*` focus screen asked two questions in one sentence ("Which rooms?
  And is it worse in summer or winter?"). Split, with `(Let them answer.)`
  between them.
- `svc_while`, `svc_unknown`, `maint_rec`: 43- and 44-word recommendation
  sentences ("Since it's been a while, I'd suggest having us give the system a
  complete check and service, that way you know everything is operating the
  way it should, and if it all looks great, that's good news too."). Split
  into three sentences each.
- `confirm` asked three questions in one paragraph; `urgent` had a 35-word
  safety instruction. Split.

**Stock phrases and flourishes (R4)** — 19 errors.
- "honestly" (×5), "I completely understand" (×3), "that makes complete
  sense" (×2), "every single day", "exactly the kind of thing", "here's the
  honest truth", "yes-yes options", "that yes is the moment", "thrilled",
  "the heart of the call", "waste your time or your money".
- "That's fantastic", "You're doing exactly what most people don't", "I love
  hearing that" openers trimmed to "That's great."
- "quietly" appeared four times as a copywriter tic ("quietly do their job",
  "creeping up"). Removed.

**Invented claims (R5)** — none: the HVAC script never quoted the customer.

**Coaching notes (R7)** — 14 errors.
- `resp_problems`, `svc_while` had bare "Let them answer." lines that
  rendered as speech.
- "Can I share why I ask? (Wait for their response.)" glued the note to the
  spoken line on three screens.
- Every objection ended in the unparenthesised "Confirm and continue: Does
  that make sense? (Wait for a fast yes.) Do you have any other questions or
  concerns?" (R9 as well).
- `close_callback`, `competitor`, `replaced`, `recovery` had inline
  `(Listen fully…then:)` notes mid-paragraph.
- `digging_in` recap "Recap and focus: So …" was a note glued to speech.
- Notes that explained psychology ("Their answer is the heart of the call",
  "The visit usually pays for itself here", "A genuine question, asked
  warmly, re-opens most of these calls") were kept only when they are an
  instruction the caller can act on, and shortened.

**Objection tails (R9)** — all four objections plus `svc_*` screens shared
the identical closing. Now: cost → "Would it be okay to at least get the look
on the calendar?"; think → "Does that sound fair?"; spouse → "Would that
work?"; busy → "Is there a day that's usually easier for you?".

**Vocabulary (R3)** — "assess" → "take a real look"; "operating at peak
efficiency" → "run its best"; "inexpensive" → "cheap"; "disposition" kept in a
coaching note only (it is the button name).

**Punctuation** — colons and semicolons used as sentence joints ("here's how
this works: one of our technicians…"; "sometimes it's the thermostat, and
sometimes…") became full stops. Label "“None of those times work”. Set a
callback" fixed.

**Titles** — "The Magic Question & Recommendation", "Scheduling: Two Yes-Yes
Options", "Serviced Recently: Stay Ahead of It" shortened to where-am-I
titles ("Recommendation", "Scheduling", "Serviced recently").

## Chips (R10)

HVAC had no concern chips; the seven `digging_in` buttons route to the
`f_*` focus screens. Chips were added in `concern-options.ts` in the same
order as the buttons (Not heating or cooling right, Hot or cold rooms, Dust
allergies or humidity, New noises or smells, Higher bills, Older system,
Thermostat), each with a spoken phrase, and `recommendation` now says "takes a
look at {{main_concern}}" so the tapped chip carries forward. Untapped, it
falls back to "what's been bothering you the most".

## Left as found / for review

- ~~The player always prepends an "Original complaint" chip whose fallback
  phrase is "what you originally came in for" (`script-merge.ts`). That reads
  oddly for a house call.~~ Resolved: the player now keys the fallback on the
  niche sector, so home-services niches speak "what we originally came out for".
- `{{asked_by_provider}}` renders as "{{practice_name}} asked me to reach out to
  you personally." because `provider_name` is filled with the practice name;
  for a company that reads fine ("Acme Heating asked me to reach out…").
- `f_noise` told the caller to press the URGENT button, but the `f_*` focus
  screens only offered Continue / callback. Resolved in a follow-up: `f_noise`
  now has its own "URGENT safety issue" choice (variant negative) routing to
  `urgent`, added via the flows JSON + `flows:apply`.
- Med Spa (healthcare, inactive) has no `script_flow_steps` or
  `script_flow_choices` rows, only 4 legacy `script_sections` slots (out of
  scope). Nothing to keep or rewrite; left untouched.
