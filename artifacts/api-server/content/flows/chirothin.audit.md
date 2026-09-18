# ChiroThin: rewrite audit

Style guide: `docs/SCRIPT_STYLE_GUIDE.md`. Flow: `chirothin.json`.

- **Baseline** `flows:lint chirothin`: 128 errors / 8 warnings (R2 x48, R1 x26, R7 x24, R4 x18, R8 x11, R3 x1; R2 avg x6, R10 x2)
- **Word count** (all step content): 3,751 -> 2,041

## Findings (before)
- **Long multi-option questions.** The opening ran the three answers into one 40+ word question. `digging_in` asked "any pain, stiffness, or soreness in your neck, upper back, lower back, even mild things you've gotten used to?" and similar double-barrel lines with two question marks in one breath (26 R1 hits). Making It Real asked "How long? A few weeks, a couple months, longer?" as one sentence.
- **Flourishes and stock phrases.** "I love hearing that", "exactly what we want", "that's completely normal", "here's the thing", "absolutely", "quietly chipping away", "genuinely", "at this point" (18 R4 hits). Every response step opened with a cheerleading paragraph before the real question.
- **Invented patient quotes.** "I remember when you first came in, you told us..." and "how proud you were" in the kept-it-off and objection screens. Replaced with "Your notes say..." or dropped.
- **Token pile-ups.** `{{rec_pronoun}}`/`{{rec_obj}}`/`{{rec_pronoun_cap}}` in 11 places (recommendation, objections, Making It Real). Replaced with "we"; `{{provider_name}}` now appears once per screen at most.
- **Unparenthesized directions.** "Let them answer, be warm and non-judgmental, and do NOT try to book yet.", "Then respond with empathy:", "Critical: write down..." read like spoken lines (24 R7 hits). All coaching is now whole-paragraph parenthesized.
- **Vocabulary.** "protocol", "utilize", "maintenance cadence", "metabolic drift" swapped for everyday words ("plan", "check-in", "drift").
- **Punctuation.** Semicolons and em-dashes joining two thoughts; long lines with three commas. Split into short sentences, one question per line.
- **Repeated objection tails.** Three niche objections ended "Can we get you back on the schedule?" Now each ends differently ("Would that help?", "Would you be open to that?", "Can we at least get you in so we can see where you're at?", "Can we get you in for a look?", "Is there anything else on your mind?") and none reuses a general objection's closing line.

## Decisions
- Both Update-the-File screens (`digging_in`, `digging_in_kept`) ask exactly the ten chip questions in chip order. The kept-it-off screen opens with "Is the weight still holding steady, or has any started to creep back?" so the "Weight creeping back" chip still has a matching question on that path.
- The two Making It Real variants keep their different question sets (weight version asks about frustration with the slip; non-weight version asks about frequency and time of day) so the `weightRelated` swap in the player is still visible.
- `glp_boomerang` keeps its "two approaches failed" reframing but in five short sentences; no pitch, no schedule.

## What did not change
- Step keys, sort order, every choice `to_step_key`, variant, and choice sort order are byte-identical to the export taken before the rewrite (checked by script).
- No step removed. Objection buttons still route to the same general objections (`obj_cost`, `obj_time`, `obj_spouse`, `obj_other_option`) where they did before.

## Chips
- Lint R10 passes with zero warnings: every chip has exactly one Update-the-File question containing its stem, and the question count equals the chip count on every `digging_in*` screen. No edits to `concern-options.ts` were needed for this niche.

## Result
- `flows:lint` before: see the "Baseline" line. After: 0 errors, 0 warnings.
