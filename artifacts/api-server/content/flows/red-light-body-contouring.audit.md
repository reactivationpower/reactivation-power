# Red Light / Body Contouring: rewrite audit

Style guide: `docs/SCRIPT_STYLE_GUIDE.md`. Flow: `red-light-body-contouring.json`.

- **Baseline** `flows:lint red-light-body-contouring`: 69 errors / 11 warnings (R2 x23, R7 x12, R4 x12, R1 x9, R5 x7, R8 x6; R2 avg x9, R10 x2)
- **Word count** (all step content): 1,626 -> 1,018

## Findings (before)
- **Long multi-option questions.** `digging_in` had four compound questions covering six chips: "the lower belly, the flanks, the 'love handle' area, the upper arms, or that spot under the chin" in one breath, then clothes, then energy and recovery as two question marks, then "a beach trip, a wedding, an event, a season...". The final pick used the 30-word "if you could completely take care of just one of them and never think about it again" line.
- **Flourishes and stock phrases.** "I love hearing that", "exactly what we want", "that's completely normal", "quietly chipping away at how you feel about yourself", "here's the thing", "absolutely", "every single day".
- **Invented patient quotes.** "I remember when you first came in, you told us your goal wasn't just to lose the inches..." and "how proud you were" (7 R5 hits).
- **Token pile-ups.** Six `{{rec_pronoun}}` uses in Making It Real and objections.
- **Unparenthesized directions.** "Critical: write down...", "Then respond with empathy:", "(Let them answer, then:) '[Repeat their answer back]?'" mixed spoken and coaching text on one line.
- **Repeated objection tails.** Two objections ended "Can we get you back in?". Now: "Can we get you in so we can take a look?", "Would you be open to that?", "Is there anything else on your mind?", "Does that help?", "Does that work for you?".

## Decisions
- `digging_in` is now six single questions in chip order (lower belly, love handles, upper arms, under the chin, clothes, energy and recovery). The "anything coming up, a wedding or trip" question had no chip and was dropped; chips win.
- This niche has no `review` step of its own (it uses the general one), so only the Making It Real close was tightened.

## What did not change
- Step keys, sort order, every choice `to_step_key`, variant, and choice sort order are byte-identical to the export taken before the rewrite (checked by script).
- No step removed. Objection buttons still route to the same general objections (`obj_cost`, `obj_time`, `obj_spouse`, `obj_other_option`) where they did before.

## Chips
- Lint R10 passes with zero warnings: every chip has exactly one Update-the-File question containing its stem, and the question count equals the chip count on every `digging_in*` screen. No edits to `concern-options.ts` were needed for this niche.

## Result
- `flows:lint` before: see the "Baseline" line. After: 0 errors, 0 warnings.

## Known dead end (pre-existing, not changed)
- `lapsed_commitment` ("Nothing Found: Why Did They Stop?") has a single outgoing button to `scheduling`, with no per-reason `lapsed_*` screens. That is how it was before the rewrite; adding routes is a routing change and out of scope for a text rewrite.
