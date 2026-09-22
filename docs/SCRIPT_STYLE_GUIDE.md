# Reactivation Script Style Guide

Every screen of the interactive call script is read aloud, word for word, by a
front-desk caller. This guide is the standard all scripts are written to. The
reference implementation is the **general** flow plus the **Skin Tightening**
niche (`artifacts/api-server/content/flows/general.json` and
`skin-tightening.json`). When in doubt, copy how those two read.

The mechanical rules are enforced by `pnpm --filter @workspace/api-server run
flows:lint`. The judgement rules are enforced by reading the screen out loud.

---

## 1. Who is reading this

The caller is a regular 30-year-old front-desk employee. They are not the
provider, not a sales trainer, and not a copywriter. They have a headset on,
a patient on the line, and this screen in front of them at 20 px. They will
read whatever is on the screen exactly as written, including the mistakes.

So every spoken line has to be something that person can say in one breath,
in their own voice, without stumbling, without sounding like a script, and
without promising anything the office cannot back up.

The patient on the other end is a normal adult who finished a course of care
months ago. They do not know the clinical words, they do not remember what
they told the office two years ago, and they can tell when they are being
"closed".

---


## 2. The rules

## 2. The rules

### R1. One question per sentence
Never stack questions. "How long has it been, a few weeks, a month?" is two
questions. Ask the first, stop, and let them answer. If you need to offer
options, put the options in the *next* sentence, or better, drop them.

> Before: *How long has that been coming back? A few weeks, a month or two?*
> After: *How long has that been coming back?*

Lint flags two `?` in one breath (no full stop between them).

### R2. Spoken sentences under 20 words, average about 10
A 30-word sentence cannot be read aloud naturally. Split it. Cut the second
clause. If the sentence has a colon or a semicolon in it, it is two sentences.

Lint flags any spoken sentence over 20 words and warns when a screen
averages more than 15.

### R3. Everyday vocabulary
Say what a patient's friend would say. Clinical words and copy words get
swapped:

| Never say | Say instead |
| --- | --- |
| laxity | loosening |
| crepey | thin-looking |
| non-judgmental (as a note) | stay warm |
| delicate areas | the thinner skin |
| collagen, "collagen story" | the firmness |
| maintenance schedule / maintenance session | regular check / a check-in visit |
| evaluation | visit, or "take a look" |
| periodic | regular |
| discouraging | frustrating |
| empathetic / empathy (as a note) | be kind / stay warm |
| vibrant | good |
| "fell off the radar" | "got pushed down the list" |
| softening, texture (skin) | loosening, thin-looking |
| results have "faded" | "loosened up again" |

Lint flags the left-hand column.

### R4. No sales stock phrases
These are the lines a trainer says on stage. They sound rehearsed on the
phone. Banned outright:

- "I'll tell you the same thing I tell everyone"
- "we'd be honored if you let us help" (and any "honored")
- "the last thing we want to do is waste your time or your money"
- "that's exactly the kind of thing we help people with every single day"
- "here's the thing" / "here's the funny thing"
- "use-it-or-lose-it"
- "the long way around"
- "stay ahead of it instead of behind it", "sneaking back", "quietly chipping away"
- "would you agree that's not really OK?"
- "yes-yes options", "the heart of the close", "that yes is the moment" (trainer
  notes that leaked into the script)
- intensifiers: absolutely, incredibly, honestly, beautifully, thrilled, "nothing better than"
- over-validation openers: "I completely understand", "I completely hear you",
  "that makes complete sense", "makes total sense", "completely normal",
  "no guilt at all", "that's real, and I'm glad you told me"

Plain replacements: "I understand." "That happens." "That's fair." "Okay."

Lint flags every one of these.

**Retired closes.** Two lines used to be the house close and were retired from
every script so callers hear one closing voice (the R11 bridge plus "Can I make
a recommendation?"). They are the most likely phrases for a batch rewrite or a
hand edit in the DB to bring back, so lint treats them as an error, not a
warning, and checks the whole step including coaching notes:

- "My recommendation is that…"
- "Do you see how that could be the case?"

The list lives in `RETIRED_PHRASES` in `artifacts/api-server/scripts/flows/lint.ts`,
next to the R4 stock-phrase list. Add to it there when another line is retired;
do not reintroduce a retired line under a different rule.

### R5. Never claim what the patient said or felt
The caller was not in the room. "I remember how happy you were" is a lie the
patient can hear. "You told us it was about looking as good as you feel" is a
guess. Point at the file instead:

- "Your notes say you were happy with how it turned out."
- "Your notes say we were working on {{complaint_reference}}."

Inside the current call it is fine to refer to what they *just* said
("You said the arms bother you most"). It is never fine to refer to a past
visit as a memory.

Lint flags "I remember", "you told us", "how happy/proud/pleased you were",
"how much you loved", "how much it bothered you".

### R6. Name the provider once per screen, then "we"
`{{provider_name}}` appears at most once on a screen ("so {{provider_name}}
has the full picture"). After that it is "we", "us", "our". The caller speaks
for the office.

Lint warns on a second `{{provider_name}}` on the same screen.

### R7. Coaching notes: parentheses, one line, imperative
Anything the caller should *do* rather than *say* goes in parentheses, on its
own line, as a short instruction:

- `(Let them answer.)`
- `(Wait for the yes.)`
- `(Do not book yet.)`
- `(Write down every area they name.)`

Never write a note that looks like a spoken line ("Then respond with
empathy:"). Never glue a note to the end of a spoken sentence. Never write a
two-paragraph note explaining the psychology. The player renders a paragraph
in muted italics only when the whole paragraph is wrapped in parentheses, so a
note that is not wrapped shows up as something to read aloud.

Lint flags note-like lines without parentheses and notes glued to speech.

### R8. No `{{rec_pronoun}}` / `{{rec_obj}}` / `{{rec_poss}}` tokens
The old scripts swapped "I/we" depending on whether the provider was calling.
It produced "{{rec_pronoun}}'ll let you know, and {{rec_pronoun}}'d be honored
if you let {{rec_obj}}" and read like a form letter. Write `{{provider_name}}`
once and then "we". The provider reading the script says "we" too; it is the
office speaking.

Lint flags the four legacy tokens as errors.

### R9. Objection tails vary
Every objection screen used to end with the identical "Confirm and continue:
Does that make sense? (Wait for a fast yes.) Do you have any other questions
or concerns?" Callers who hit two objections in a row said it twice. Each
objection ends with its own short check, for example:

- "Does that sound fair?"
- "Would that work?"
- "Can we at least get you in for the look?"
- "Is there anything else on your mind?"

Two objection screens in the same flow should not share the same closing line.
And no objection screen ends with "Does that sound reasonable?"; that line
belongs to the recommendation screen, and the caller just said it.

Lint checks every `obj_*` screen the caller can reach in a flow (the niche's
own `obj_*` screens plus any general one it does not override but still
routes to) for: exactly one spoken question before the first `(Let them
answer…)` note (a `{{pt_*_ask}}` / `{{pt_*_q}}` token counts), a closing
line no other reachable objection screen uses, and no "Does that sound
reasonable?" tail. Inherited general screens are reported as
`<niche>:<key> (inherited from general)` at the niche's severity, so deleting
an override cannot quietly put general's old handle back in front of the
caller. These are errors for niches listed in `OBJECTION_SHAPE_NICHES` in
`scripts/flows/lint.ts` and warnings elsewhere; add a niche to that list
once its objection screens have been rewritten.

#### Objection handle shape (five beats)
An objection handle is not a three-sentence brush-off ("That's fair. A visit
lets us see what changed. Would you be open to that?"). Every `obj_*` screen
follows the same five beats, top to bottom, with the niche's own reason in the
middle:

1. **Acknowledge** in one short line, by name where it fits.
2. **One isolating question** that finds out which version of the objection
   this is ("Is it the cost of the visit itself, or not knowing what insurance
   will cover?"). One `?`, under 20 words.
3. `(Let them answer.)` on its own line, with any do-not instruction folded in
   ("Do not quote prices…", "Do not knock the other option.").
4. **The niche-specific reason**, tied to `{{main_concern}}`, that makes the
   visit the sensible next step. This is the paragraph that changes from
   niche to niche; it should not be pasteable into another niche's file.
   `{{provider_name}}` appears here once, then "we".
5. **A low-stakes ask** with a tail unique to that screen ("Can we pencil it
   in, and you can move it after you two talk?").

Reference: Chiropractic `obj_managing_own`:

> Good for you, {{contact_first_name}}. That takes some discipline.
>
> What have you been doing for it?
>
> (Let them answer. Give them credit for it.)
>
> That's getting you through the day, and that matters. What it can't do is
> tell you why {{main_concern}} keeps coming back. Managing something and
> fixing it are two different things.
>
> A check with {{provider_name}} tells you which one you're dealing with. If
> what you're doing is enough, we'll tell you to keep going. If it isn't,
> you'll find out now instead of a year from now.
>
> Would it help to know for sure?

The shared `general` objections (`obj_cost`, `obj_time`, `obj_spouse`,
`obj_other_option`) and `uncover` are deliberately generic. When a niche gets
this treatment, add same-key overrides to the niche file rather than editing
`general.json`, and give each override the standard two buttons ("Resolved:
back to scheduling" → `scheduling`, "Another concern came up" → `uncover`).

### R10. Question screens map one-to-one to the concern chips
On the `digging_in*` screens, niches with concern chips
(`artifacts/reactivation-power/src/lib/concern-options.ts`) show a chip row
under the script: the caller taps the concern the patient names, and it fills
`{{main_concern}}` on every later screen. The questions on that screen must
line up with the chips exactly: one question per chip, in chip order, using
the chip's own words, and nothing extra between them. Then one recap question
("Of those, which one bothers you the most?"). The caller should never hear
an answer they cannot tap.

Skin Tightening chips: Jawline / neck, Arms, Above the knees, Chest, Backs of
hands, Skin after weight change. So the screen has exactly those six
questions, then the pick.

Lint checks each chip has a question mentioning it, and warns on extra
questions or a count mismatch.


---

### R11. The read-back happens once, on the Review screen
Every flow runs Making It Real → `review` → `recommendation`. The recap
("let me make sure I have this right… Did I get that right?") belongs on
`review` and nowhere else. `recommendation` opens with the bridge and asks
permission ("Can I make a recommendation?") before it recommends anything.
If the recap shows up on both screens the caller reads the patient's answers
back twice in a row, which sounds like a script.

Lint errors when:
- a `review` step has no read-back opener or never asks "Did I get that
  right?";
- any other step (recommendation, objections, making it real, anything)
  contains a read-back opener or "Did I get that right?";
- a `recommendation` step (or `recommendation_*` variant) never asks "Can I
  make a recommendation?", asks it anywhere but the first spoken paragraph,
  keeps talking in the same paragraph after asking (the ask ends its
  paragraph; the caller waits for the yes), or starts recommending ("let's
  get you in", "I recommend", "Does that sound reasonable?") before it has
  asked.

The one allowed exception to "first paragraph" is the explainer shape used by
the dental checks, HVAC/Plumbing and the weight-focus variants: paragraph one
explains the visit and ends with "Does that make sense?", paragraph two is
the ask on its own, and the recommendation follows. Anything else that delays
the ask is an error.

Unit tests for the rule live in
`artifacts/api-server/scripts/flows/__tests__/lint.test.ts` and also run
every checked-in flow through it.


### R12. Every non-terminal screen has a way out
A step with no outgoing choice, in its own file or in `general.json`, leaves
the caller on "End of script" with a patient still on the line. Lint reports
it as an error unless the step is a terminal screen (scheduling, close,
wrap-up, bonus, voicemail, wrong number, do-not-call) or is listed in
`KNOWN_DEAD_ENDS` in `scripts/flows/lib.ts`, where it lints as a warning
until its routing is decided. See section 5 for the details.

### R13. Ask before you ask
The script asks permission twice: once before the questions ("Can I ask you
a few quick questions?" / "Let me ask you a few quick questions. Is that
okay?") and once before the recommendation ("Can I make a recommendation?").
"Does that sound reasonable?" is the close of a recommendation the patient
agreed to hear. Without the ask it lands as a pitch.

A **permission screen** is any `transition*` or `permission_questions*` step,
plus any step with a button that routes straight to a `digging_in*` screen
(so a `doing_well_variant` that skips the transition counts too). Lint errors
when:
- a permission screen has no permission question in its spoken text. The
  opener has to be a question: "can I ask", "could I ask", "may I ask",
  "mind if I", "would it be okay if", "okay if I", "is that okay?", "can I
  share", "can I tell you", "can I make a recommendation / suggestion";
- any screen (objection, lapsed, cadence, recommendation, anything) says
  "Does that sound reasonable?" and never asked one of those permission
  questions earlier on the same screen, or asked it only after the close.

An opener inside a coaching note does not count; the caller has to say it.
The `general.json` `doing_well_variant` is not a permission screen on its
own: it asks about early signs, then hands off to `transition` (which asks)
or `recommendation` (which asks). If a niche reroutes it straight to
`digging_in`, the ask has to move onto that screen.

The same unit-test file covers R13 and runs every checked-in flow through it.


### R14. Making It Real keeps the three-question shape
Every `making_it_real*` screen asks exactly three spoken questions, in this
order, each on its own paragraph ending in "?" and each followed by a
coaching note (`(Let them answer.)`):
1. duration: a low anchor then "or longer than that?" (aesthetics: "or more
   like months?"; home services: "or since last season?");
2. frequency: a low number then "or is it more often than that?" (home
   services: "or is it most days?"; aesthetics: "or every time you look in
   the mirror?");
3. impact: opens with "When it's at its worst" and names three buckets.

Lint errors on any other count of questions, a question missing its scale,
a third question that does not open with "When it's at its worst", a
question that keeps talking after the "?", or a question with no coaching
note after it. Questions inside coaching notes do not count. The bare
pre-rewrite questions ("How long has that been bothering you?") fail here,
as does the old "repeat it back, that's a long time" move. See example 5.

The same unit-test file covers R14 and runs every checked-in flow through it.


---

### R15. Parent-mode chips speak about the patient, not to them
Clear Aligners and Orthodontics carry a `mode_parent` step: the caller may be
speaking with a parent. A concern chip's spoken phrase is injected wherever
`{{main_concern}}` appears ("take a look at {{main_concern}}"), so on those
niches it has to read the same to either listener. Write it pronoun-free:
"the shifting", "how the smile looks in photos", never "your smile".

Lint errors when a chip's spoken phrase for a parent-mode niche contains
"you", "your", "yours" or "yourself", or any `{{token}}`. Tokens inside a
chip are never expanded (the merge is single-pass), so `{{pt_your}}` would
reach the caller raw. Parent mode is read from the flow file (any
`mode_parent*` step), not from a list of niche names; a niche that gains a
parent screen later picks up the rule automatically. Unit tests cover the
rule and run every checked-in parent-mode flow through it.

---

### R15. Every screen has a way in
R12 catches screens with no way out; R15 catches screens with no way in. A
step that no choice routes to (in its own file or in `general.json`) and
that is not an entry screen is either a typo in a `to_step_key` or dead
content that will drift out of date and confuse the next rewrite. Lint
reports it as a warning. Entry screens are `open` (the player starts on the
lowest `sort_order`) and the outcome-button screens `voicemail`,
`wrong_number`, `dnc`; they are listed in `ENTRY_STEP_PATTERNS` next to
`TERMINAL_STEP_PATTERNS` in `scripts/flows/lib.ts`. Screens the player swaps
in by key rather than by button (`making_it_real_nw`) are listed in
`PLAYER_ROUTED_STEP_PATTERNS` in the same place. See section 5.


### R16. The review reads back the buckets the patient heard
The third Making It Real question offers three impact buckets ("photos,
going out, or feeling put together"). The review screen the caller reaches
next has to name each of them, either in its spoken line or in the "(Say
what they named: …)" coaching note. A niche that writes its own
`making_it_real` but inherits general's `review` would otherwise read back
"work, home, or your own time" to a patient who was asked about photos.

Lint takes the buckets from the effective `making_it_real*` screens (the
file's own, else general's) and checks them against the effective `review*`
screens (the file's own, else general's, reported as "inherited from
general" so the fix lands in the niche file). A bucket counts as named when
the review contains it verbatim, one of the short forms declared in
`IMPACT_BUCKET_EQUIVALENTS` in `scripts/flows/lint.ts` ("relaxing and doing
your own thing" → "your own time"; "at home" → "home"), or all of its
content words. Anything missing is an error. Changing the buckets on a niche
means giving that niche its own review (or updating the one it has); adding
a new short form means declaring it in the equivalents table, not loosening
the rule. See example 6.

The same unit-test file covers R16 and runs every checked-in flow through it.

---

## 3. The standard step skeleton

Every niche is built from the same keys. A niche file only contains the steps
it overrides; everything else falls through to `general.json`. **A niche row
with the same `step_key` replaces the general row, and a niche's choice set
for a step replaces the general set for that step.**

| step_key | Purpose | Usual routes |
| --- | --- | --- |
| `open` | Greeting, reason for the call, "do you have a minute?" | → `opening_question` |
| `opening_question` | The three-answer question: still good / coming back / fully back | → `resp_doing_great` / `resp_coming_back` / `resp_fully_back` |
| `resp_doing_great` | Acknowledge, remind them of the result (from notes) | → `doing_well_variant` or `permission_questions` |
| `resp_coming_back` | Acknowledge, normalize | → `transition` |
| `resp_fully_back` | Acknowledge, ask what changed, do not book | → `transition` |
| `doing_well_variant` / `permission_questions` | Doing-great path: ask permission for the questions | → `transition` / `digging_in` / `recommendation` |
| `transition` | Ask permission to run through the questions | → `digging_in` (or `digging_in_concern`) |
| `digging_in` (`digging_in_concern`, `digging_in_kept`, …) | The question screen, one question per chip, then the pick | → `making_it_real` (and `lapsed_commitment` when nothing found) |
| `making_it_real` | Three questions about the concern: how long, how often, how it affects them | → `review` |
| `review` | Recap, "did I get that right?", bridge to how they want to feel | → `recommendation` / `bridge_no` |
| `recommendation` | "Can I make a recommendation?" then the recommendation, "does that sound reasonable?" | → `scheduling` / `uncover` / `obj_*` |
| `uncover` | Soft no: ask what is in the way | → `scheduling` / `obj_*` |
| `bridge_no` | They hesitate on the review: find out why | → `recommendation` / `obj_*` / `uncover` |
| `obj_taken_care_of`, `obj_cost`, `obj_other_option`, `obj_time`, `obj_spouse` | General objections | → `scheduling` / `uncover` |
| `obj_<niche>` (`obj_loosened`, `obj_embarrassed`, `obj_did_it_work`, `obj_think`, `obj_send_info`, …) | Niche objections | → `scheduling` / `uncover` |
| `lapsed_commitment`, `lapsed_*` | Doing great, nothing found: why did they stop coming, one screen per reason | → `scheduling` / `lapsed_commitment` |
| `scheduling` | Two days, two times, book it, log the call | (end) |

Sort order: the main path runs 0–17 in the order above, objections from 100,
niche extras from 130. Sort order only matters for the first screen (lowest
wins) and for reading order in the export.

Every screen is: **spoken lines**, each on its own paragraph, with **coaching
notes** in parentheses on their own paragraphs between them. Blank line
between paragraphs. No headings, no bullets, no bold.

---

## 4. Token reference

Tokens the player fills. Anything else renders as `[RAW PLACEHOLDER]` and
`flows:apply` refuses the file.

| Token | Fills with |
| --- | --- |
| `{{contact_first_name}}` | Patient's first name |
| `{{contact_full_name}}` | Patient's full name |
| `{{caller_name}}` / `{{your_name}}` | The caller's name |
| `{{practice_name}}` | The office name |
| `{{provider_name}}` | The provider's name (currently the same value as the practice name). Once per screen. |
| `{{asked_by_provider}}` | "{{provider_name}} asked me to reach out to you personally." or, when the provider is calling, "I wanted to reach out to you personally." |
| `{{complaint_reference}}` | What the notes say they came in for ("the lower back pain"). Falls back to "what you originally came in for". An "…, especially with {{complaint_reference}}" clause is dropped entirely when nothing is documented. |
| `{{main_concern}}` | The chip the caller tapped on the question screen ("that jawline and neck area"). Falls back to "what's been bothering you the most". |
| `{{pt_*}}` | Dental/ortho parent-mode tokens (you / your child). Only for flows that have a `mode_parent` screen. |
| `{{rec_pronoun}}`, `{{rec_pronoun_cap}}`, `{{rec_obj}}`, `{{rec_poss}}` | **Legacy. Do not use (R8).** Still substituted so un-rewritten niches keep working. |

Placeholders the caller fills in by voice, not tokens: `(day)`, `(time)`.
Keep them exactly like that so they stand out on the screen.

---

## 5. Routing rules

- **`to_step_key` never changes in a rewrite.** Every button goes where it
  went before. If a flow needs a new branch, that is a separate change with
  its own review.
- **Button labels may be reworded, but a label is the literal thing the
  patient says** (in quotes: *"I don't have time"*) or the literal thing the
  caller observed (*Hesitant or soft no*). Not an instruction.
- A niche's choice set for a step replaces the general set. If a niche
  overrides `recommendation` it must list every button it wants, including
  the general objections.
- Every `to_step_key` must exist in the niche file or in `general.json`.
  `flows:apply` refuses otherwise.
- Never delete rows. Rows in the database that are not in the file are left
  alone and listed by `flows:apply` so the author can decide.
- **Every screen needs a way out.** A step with no outgoing choice (in its
  niche file or in `general.json`) shows "End of script" mid-call. Lint R12
  reports this as an error unless the step is a terminal screen
  (`scheduling`, `close_*`, `booked_wrap`, `*_bonus`, `voicemail`,
  `wrong_number`, `dnc`, `end*` / `wrap_up*`; see `TERMINAL_STEP_PATTERNS`
  in `scripts/flows/lib.ts`). A dead end that is intentionally still open
  must be listed in `KNOWN_DEAD_ENDS` in the same file, where it lints as a
  warning; lint also warns once a listed step has grown buttons so the entry
  gets removed.
- **Every screen needs a way in.** A step that no `to_step_key` points at
  (in its niche file or in `general.json`; for `general.json` the niche
  files' buttons count too) is unreachable. Lint R15 warns unless the step
  is an entry screen (`open`, `voicemail`, `wrong_number`, `dnc`; see
  `ENTRY_STEP_PATTERNS` in `scripts/flows/lib.ts`) or one the player swaps
  in by key (`PLAYER_ROUTED_STEP_PATTERNS`). Fix the typo or delete the
  step; do not leave content nobody can reach.
- Choice `variant` colours the button: `positive` (they agreed), `caution`
  (hesitant), `negative` (bad news), `objection`, `default` (continue).

---

## 6. Per-screen checklist

Before a screen is done, read it aloud once and tick every line:

1. Could a 30-year-old front-desk caller say every line in their own voice?
2. One question per sentence, one question per paragraph?
3. Every spoken sentence under 20 words, most under 12?
4. No word from the swap table, no banned phrase?
5. Nothing claims what the patient said or felt at a past visit?
6. `{{provider_name}}` at most once, then "we"?
7. Every coaching note in parentheses, on its own line, an instruction?
8. No `{{rec_*}}` token?
9. If it is an objection: does its closing line differ from the other objections?
10. If it is a question screen: one question per chip, in chip order, then the pick?
11. Every button still routes to the same `to_step_key`?
12. If it is a transition or routes to the questions: does it ask permission? If it ends on "Does that sound reasonable?": did it ask first?
13. If it is the review: does it name the same three impact buckets the Making It Real screen offered?
14. Title is short and tells the caller where they are ("Objection: cost").

---

## 7. Before / after (from the Skin Tightening script)

**1. Opening question (R1, R2)**

> Before: *So {{contact_first_name}}, how have things been going since you
> finished your skin tightening treatments with us? Is your skin still looking
> firm and lifted and you're loving how you look, has a little started to
> creep back, or are you pretty much back to where you were before you started
> with us?*
>
> After: *So {{contact_first_name}}, how has your skin been since you finished
> your treatments with us? I usually hear one of three things. Still looking
> firm, a little starting to loosen up, or pretty much back to how it was.
> Which one is closest for you?*
>
> The three options become a statement, so the caller asks one question, not
> three, and the patient still picks one of the three buttons.

**2. Doing great (R4, R5, R7)**

> Before: *I love hearing that, {{contact_first_name}}. That's exactly what we
> want. There's nothing better than looking in the mirror and seeing firmness
> where there used to be softness. Do you remember how much it bothered you
> before we treated it? How often you'd catch yourself noticing it, in the
> mirror or in photos? (Let them answer. Let them relive the win before you
> move on.)*
>
> After: *That's great to hear, {{contact_first_name}}. Your notes say it was
> really bothering you before we started. Is it nice not to notice it in the
> mirror anymore?*
>
> *(Let them answer.)*

**3. Coming back (R2, R3, R5, R7)**

> Before: *{{contact_first_name}}, that's completely normal. Skin naturally
> continues to change over time and the results gradually soften once
> treatments stop; it's not anything you did wrong, and it is exactly why we
> check in. I remember how great you looked and felt and how proud you were.
> Was there anything in particular that kept you from coming back in? Was it
> the cost, did it just kind of fall off the radar, or something else?*
>
> *Let them answer, be warm and non-judgmental, and do NOT try to book yet.*
>
> After: *That happens, {{contact_first_name}}. Skin keeps changing, and
> results loosen up once treatments stop. It's not anything you did wrong.
> Your notes say you were really happy with how it turned out. What kept you
> from coming back in?*
>
> *(Let them answer. Stay warm. Do not book yet.)*

**4. The question screen (R1, R2, R3, R10)**

> Before: *How about the delicate areas? Any crepey texture showing up on the
> arms, above the knees, on the chest or the backs of the hands? That's
> usually where skin shows its age first, and almost nobody realizes it can be
> treated.*
>
> After: *How about your arms, any thin-looking skin there?*
>
> *What about just above the knees?*
>
> *And your chest?*
>
> *How about the backs of your hands?*

One chip, one question. The caller can tap what they hear.

**5. Making it real (R1, R2, R4, R7, R14)**

> Before: *How long has that been bothering you?*
>
> *(Let them answer.)*
>
> *How often do you notice it?*
>
> *(Let them answer.)*
>
> *When it bothers you, how does it affect your day or the things you enjoy?*
>
> After: *How long has it been bothering you, like a week or two, or longer
> than that?*
>
> *(Let them answer.)*
>
> *Is it something you experience like 1 to 2 times a month, or is it more
> often than that?*
>
> *(Let them answer.)*
>
> *When it's at its worst, does it ever interfere with work, at home, or
> relaxing and doing your own thing?*
>
> *(Let them answer. Repeat back whatever they name.)*

Bare questions invite small answers ("a while", "sometimes", "not really").
Each question carries its own scale so the honest answer sounds significant
when the patient says it out loud: duration is a low anchor then "or longer
than that?", frequency is a low number then "or more often than that?", and
impact is "when it's at its worst" followed by three buckets. Keep each
question one sentence under 20 words; the old "repeat it back, that's a long
time" move is gone. Lint R14 enforces this shape on every `making_it_real*`
screen, so a rewrite that slips back to the bare questions fails before
apply.

Coloring rule: color the question with what is true for anyone who has this
problem (work, home, unwinding, sleep, the mirror, photos, the bill), never a
guess about this person (kids, a yard, a spouse, a hobby, something they own).
Change only the low anchors and the impact buckets per niche: weeks for pain
and body, months for wellness and weight, "every time you look in the mirror"
for aesthetics, "since last season" and "the bill" for home services.

**6. The review and the recommendation (R2, R4, R7, R8, R11, R16)**

The read-back lives on the Review screen; the Recommendation screen opens
with the bridge and asks permission. Together they are one move: read back,
get "yes, that's right", bridge, ask, recommend.

> Before (review): *{{contact_first_name}}, let me make sure I have this
> right.*
>
> *(Recap what they told you: how long, how often, how it affects them.)*
>
> *Did I get that right?*
>
> Before (recommendation): *My recommendation is that we get you set up with
> an appointment so {{rec_pronoun}} can take a look and see if there's
> something {{rec_pronoun}} can do to help you with {{main_concern}}. If
> {{rec_pronoun}} can help you, {{rec_pronoun}}'ll let you know, and
> {{rec_pronoun}}'d be honored if you let {{rec_obj}}. And if {{rec_pronoun}}
> don't think it's the right fit, {{rec_pronoun}}'ll let you know that as
> well, because {{rec_pronoun}}'re not here to waste anybody's time or money.
> Does that sound reasonable?*
>
> After (review): *{{contact_first_name}}, let me make sure I have this
> right.*
>
> *(Read back their three answers: how long, how often, what it gets in the
> way of.)*
>
> *So it's been going on a while, and it comes up more than once in a while.
> At its worst it gets in the way of what you mentioned. Did I get that
> right?*
>
> *(Say what they named: work, home, or your own time. Let them answer. If
> they correct you, take the correction and move on.)*
>
> (Those are general's buckets. A niche whose third question asks about
> "photos, going out, or feeling put together" names those three here
> instead; lint R16 fails a review that reads back buckets its Making It
> Real screen never offered.)
>
> *And it sounds like you'd really like to get back to feeling the way you
> did when you finished. Is that fair to say?*
>
> After (recommendation): *{{contact_first_name}}, that's worth getting looked
> at instead of just dealing with it. Can I make a recommendation?*
>
> *(Wait for the yes.)*
>
> *Let's get you in so {{provider_name}} can take a look at {{main_concern}}.
> If chiropractic care can help, we'll walk you through the options. If it's
> not the right fit, we'll say so. Either way you'll know where you stand.
> Does that sound reasonable?*

The read-back names what the patient actually said on Making It Real (the
duration anchor, the frequency anchor, the impact bucket they picked), never
a guess about them. The two anchors follow the niche's Making It Real
questions ("a while" for pain and aesthetics, "a while now / more often than
not" for weight, "most times you look in the mirror" for skin, "since last
season / started a while back" for home services), and the coaching note
lists that niche's three impact buckets so the caller says the one that was
named. Parent-mode flows use the short pronoun tokens ("on {{pt_your}}
mind"). Swap "chiropractic care" for the niche's own service, or "If we can
help" where the screen names none. Explainer screens (dental checks, home
service visits) keep their explainer after the bridge and close with "Let's
get you in for…" rather than "My recommendation is that…".

**7. Objection: embarrassed (R4, R8, R9)**

> Before: *Please don't be. This happens to almost everyone once the
> treatments stop, and it's exactly why we reach out, with no judgment at
> all. {{rec_pronoun_cap}}'d simply love to help you get back to where you
> were.*
>
> *Confirm and continue: Does that make sense? (Wait for a fast yes.) Do you
> have any other questions or concerns?*
>
> After: *Please don't be. This happens to almost everyone once treatments
> stop. That's the reason we call. We'd just like to help you get back to
> where you were.*
>
> *Would you be open to that?*
>
> *(Wait for the yes.)*

**8. Nothing found: commitment question (R3, R4, R5)**

> Before: *Let me ask you this. I remember when you first came in, you told us
> it was about looking as vibrant on the outside as you feel on the inside.
> Can I ask what changed that led you to stop coming in?*
>
> *And {{contact_first_name}}, here's the thing about skin. Collagen is a
> use-it-or-lose-it story, and maintenance sessions keep the collagen you
> rebuilt working for you. Does that make sense?*
>
> After: *Can I ask what changed that led you to stop coming in?*
>
> *(Let them answer. Do not argue with it.)*
>
> *The firmness you built does fade without a check-in now and then. A
> regular visit keeps it working for you. Does that make sense?*

**9. Objection: cost (R7, R8, R9)**

> Before: *{{contact_first_name}}, I completely understand. I want to be clear.
> This first step is simply an appointment so {{rec_pronoun}} can take a look.
> You're not committing to anything. {{pt_cost_ask}}*
>
> *Confirm and continue: Does that make sense? (Wait for a fast yes.) Do you
> have any other questions or concerns?*
>
> After: *I understand, {{contact_first_name}}. This first visit is just a
> look. You're not committing to anything. Can I ask how much getting back to
> how you felt matters to you?*
>
> *(Let them answer. Do not quote prices, packages, or discounts. The office
> handles that.)*
>
> *Would it be okay to at least get you in for the look?*

**10. Scheduling (R2, R7, R8)**

> Before: *Wonderful, {{contact_first_name}}. {{rec_pronoun_cap}} have time
> this week on (day) and (day). Do mornings or afternoons work better for
> you? … (Always offer two yes-yes options within 48 hours. Before the call,
> know your two days and two times so you can fill these in without
> hesitating. Once booked, add your notes and press the green "Scheduled"
> button below to log the call.)*
>
> After: *Great, {{contact_first_name}}. We have time this week on (day) and
> (day). Do mornings or afternoons work better for you?*
>
> *(Have two days and two times ready before the call, both within 48 hours.)*
>
> *(Once booked, add your notes and press the green "Scheduled" button.)*

**11. Voicemail (R2, R4)** — lives in code, not the database
(`call-screen.tsx`), same rules.

> Before: *Hi Sam, this is Jamie from Bright Skin, and we're doing file
> updates on patients we haven't seen in a while. If you could do me a favor
> and give me a call back at this number, 555-0100, when you have a few
> minutes, I'd really appreciate it. Thanks in advance, and have a great day!*
>
> After: *Hi Sam, this is Jamie from Bright Skin. We're updating files for
> patients we haven't seen in a while, and yours came up. Could you call me
> back at 555-0100 when you have a few minutes? Thanks, and have a great day.*

---

## 8. Tooling: content as code

Scripts live in the repo at `artifacts/api-server/content/flows/<slug>.json`,
one file per niche plus `general.json` for the shared (niche_id null) steps.
Each file is:

```json
{
  "niche": { "name": "Skin Tightening", "sector": "healthcare", "is_active": true, "sort_order": 12 },
  "steps":   [ { "step_key": "...", "title": "...", "content": "...", "sort_order": 0 } ],
  "choices": [ { "from_step_key": "...", "label": "...", "to_step_key": "...", "variant": "default", "sort_order": 0 } ]
}
```

Commands (run from the repo root; they need `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, which the workspace already has):

| Command | What it does |
| --- | --- |
| `pnpm --filter @workspace/api-server run flows:export [slug…]` | Regenerate the JSON files from the live database. Overwrites local edits, so commit first. |
| `pnpm --filter @workspace/api-server run flows:lint [slug…]` | Report rule violations per file. Exit 1 on errors. `--quiet` for counts only. |
| `pnpm --filter @workspace/api-server run flows:apply [--dry-run] [--steps key,key] [--force] (--all \| slug…)` | Upsert the files back. Steps match on niche + `step_key`; choices on niche + `from_step_key` + `to_step_key`. Text is updated in place, nothing is duplicated, nothing is deleted. Refuses to write when a choice routes to a missing step or a token is unknown. Prints a diff summary. `--steps` (alias `--only`) pushes only the listed steps and the buttons leaving them. Without it, apply also refuses when a row's database text differs from both the file and the committed (git HEAD) file — someone else changed it since your branch was cut; `--force` overwrites anyway. |
| `pnpm --filter @workspace/api-server run flows:check [--quiet] [slug…]` | Compare the live database with the files in both directions (same matching as apply). Exit 1 when any step or choice differs or a slug exists on only one side, so a flow edited in the admin UI or by SQL — or a linted file nobody applied — is caught. Run by hand; it is not a validation step because it needs the database and every task branch shares one. |

Slugs are the niche name lowercased with dashes (`skin-tightening`,
`weight-loss-not-chirothin`) and `general`.

---

## 9. How a batch rewrite works

One loop per niche. Do not skip steps.

1. **Export** — `flows:check <slug>` first to see whether the file and the
   database already disagree, then `flows:export` so the files match the
   database. Commit the baseline before editing anything.
2. **Audit** — `flows:lint <slug>` and read the output top to bottom. Read the
   niche's screens in the player (`/portal/script`, pick the niche) to see
   which steps the niche overrides and which fall through to general. Note
   anything structural the lint caught (unknown tokens, missing routes) and
   fix it in the JSON, not by adding tokens to the player.
3. **Rewrite the JSON** — screen by screen, against section 6. Keep every
   `step_key`, `from_step_key`, `to_step_key`, `variant`, and `sort_order`.
   Reword labels only if they are no longer the literal thing a patient says.
   Match the question screen to the niche's chips one-to-one; if a chip has no
   sensible question, change the question, not the chip.
4. **Lint** — `flows:lint <slug>` until it passes with zero errors. Read the
   warnings; most are worth fixing.
5. **Apply your own niches only** — `flows:apply --dry-run <slug>` first, read
   the diff, then `flows:apply <slug>`, then `flows:check <slug>` to confirm
   the phones and the file now agree. Never `--all` from a batch task: another
   batch may be mid-rewrite on a different niche. If the dry run lists a step
   you did not touch, another task already put newer wording on the phones and
   your file does not have it yet; apply prints it as a `CONFLICT` and refuses
   the whole file. Push just your screens with
   `flows:apply --steps <key,key> <slug>`, or `flows:export <slug>` to adopt
   the live text into the file first. `--force` is for the rare case where
   reverting the other change is the intent.
6. **Click through** — open the niche in the player and walk every branch:
   all three opening answers, the question screen with a chip tapped and with
   none tapped, every objection from `recommendation`, every objection from
   `uncover`, every `lapsed_*` screen, back to scheduling. Every button must
   land where it did before, and no screen may show a `[RAW PLACEHOLDER]`.
7. **Commit** the JSON with the rewrite.

Known findings for the batch tasks, from the baseline lint:

- `hvac` and `plumbing` use `{{asked_by}}` and `{{practice_phone}}`, which the
  player does not fill. Replace them with `{{asked_by_provider}}` and a
  spoken "(your office number)" placeholder; `flows:apply` will refuse those
  files until then.
- Several niches have a question with no chip ("anything coming up on the
  calendar?") and chips with no question. R10 decides: the chips win.
- `obj_think` and `obj_send_info` in the older niches have no outgoing
  choices in the database (they existed that way before the rewrite), so the
  player shows "End of script" after them. They are allow-listed in
  `KNOWN_DEAD_ENDS` (lint R12 warning, not error); remove a niche's entry when
  its buttons are added. Adding choices is a routing change and
  is deliberately not part of a text rewrite; it needs its own decision.
  When that decision is made, the niche-objection pattern is two buttons:
  a `positive` label quoting the patient's yes to the screen's closing
  question -> `scheduling`, and `Another concern came up` (`objection`) ->
  `uncover`. Add both choice objects to the JSON (sort_order 0 and 1) and
  `flows:apply` inserts them; re-export to confirm the round-trip. This is
  how chiropractic and decompression `obj_came_back_stopped` /
  `obj_managing_own` and every Acoustic Wave niche objection were wired.
- Every niche shares the general objections (`obj_cost`, `obj_time`,
  `obj_spouse`, `obj_other_option`, `obj_taken_care_of`) unless it overrides
  them. Those are already rewritten; do not copy the old versions back in.
