# Weight Loss (Not ChiroThin): rewrite audit

Style guide: `docs/SCRIPT_STYLE_GUIDE.md`. Flow: `weight-loss-not-chirothin.json`.

- **Baseline** `flows:lint weight-loss-not-chirothin`: 128 errors / 8 warnings (identical to ChiroThin)
- **Word count** (all step content): 3,754 -> 2,044

## Findings (before)
- This flow was a copy of ChiroThin with the brand name swapped in two steps (`opening_question`, `glp_boomerang`). Every finding in `chirothin.audit.md` applied here verbatim: long multi-option questions, cheerleading openers, "I remember when you first came in", `{{rec_*}}` tokens, unparenthesized directions, semicolons, repeated "Can we get you back on the schedule?" tails.

## Decisions
- Kept the relationship on purpose: the rewrite was generated from the same source as ChiroThin with "the weight loss program" / "Our program" in place of "the ChiroThin program" / "ChiroThin". The two files still differ only in those two steps, so future edits can be ported the same way.

## What did not change
- Step keys, sort order, every choice `to_step_key`, variant, and choice sort order are byte-identical to the export taken before the rewrite (checked by script).
- No step removed. Objection buttons still route to the same general objections (`obj_cost`, `obj_time`, `obj_spouse`, `obj_other_option`) where they did before.

## Chips
- Lint R10 passes with zero warnings: every chip has exactly one Update-the-File question containing its stem, and the question count equals the chip count on every `digging_in*` screen. No edits to `concern-options.ts` were needed for this niche.

## Result
- `flows:lint` before: see the "Baseline" line. After: 0 errors, 0 warnings.
