# GLP Patients: rewrite audit

Style guide: `docs/SCRIPT_STYLE_GUIDE.md`. Flow: `glp-patients.json`.

- **Baseline** `flows:lint glp-patients`: 71 errors / 9 warnings (R2 x23, R7 x17, R1 x15, R4 x9, R8 x6, R10 x1; R2 avg x5, R10 x4)
- **Word count** (all step content): 2,346 -> 1,478

## Findings (before)
- **Long multi-option questions.** `digging_in` bundled appetite, cravings, and portion size into one line with three question marks; energy and sleep were asked together. The opening question listed the three answers inside one 45-word sentence.
- **Flourishes and stock phrases.** "I love hearing that", "that's completely normal", "you crushed it", "here's the thing", "the medication was doing the heavy lifting", "let's be honest".
- **Medical territory.** Lines that discussed dose changes and side effects as if the caller could advise. Now every question screen and the side-effects objection open with "(Never give medical advice or discuss the medication on the call.)" and the spoken text only says the provider would want to talk it through in person.
- **Token pile-ups.** Six `{{rec_pronoun}}`/`{{rec_obj}}` uses in the closes and objections. Replaced with "we".
- **Unparenthesized directions.** "Then respond with empathy:", "Let them answer, then:", "Wait for the yes before continuing" as bare lines (17 R7 hits).
- **Chips did not match the questions.** The chips are Weight coming back, Appetite coming back, Old eating habits creeping in, Energy dips, Muscle or strength loss, Sleep trouble, Joint aches, Stress / anxiety, but the questions never asked about muscle or joints and asked two extra unrelated questions (lint R10 error + 4 warnings). Both `digging_in` screens now ask exactly eight questions, one per chip, in chip order.
- **Repeated objection tails.** Two objections ended "Does that make sense?" (same as the closes). Now: "Can we get you in so we can take a look?", "Would you be open to that?", "Is there anything else on your mind?", "Does that help?", "Does that work for you?".

## Decisions
- `cadence_close` (nothing found) and `comeback_close` (getting back on track is the whole story) keep their distinct arguments (stay dialed in vs. the restart is straightforward) but each is now four short beats: point, permission, recommendation, time offer.

## What did not change
- Step keys, sort order, every choice `to_step_key`, variant, and choice sort order are byte-identical to the export taken before the rewrite (checked by script).
- No step removed. Objection buttons still route to the same general objections (`obj_cost`, `obj_time`, `obj_spouse`, `obj_other_option`) where they did before.

## Chips
- Lint R10 passes with zero warnings: every chip has exactly one Update-the-File question containing its stem, and the question count equals the chip count on every `digging_in*` screen. No edits to `concern-options.ts` were needed for this niche.

## Result
- `flows:lint` before: see the "Baseline" line. After: 0 errors, 0 warnings.
