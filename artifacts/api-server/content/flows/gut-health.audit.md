# Gut Health: rewrite audit

Style guide: `docs/SCRIPT_STYLE_GUIDE.md`. Flow: `gut-health.json`.

- **Baseline** `flows:lint gut-health`: 120 errors / 13 warnings (R2 x42, R1 x25, R4 x19, R7 x14, R8 x10, R5 x7, R10 x3; R2 avg x10, R10 x3)
- **Word count** (all step content): 3,574 -> 1,886

## Findings (before)
- **Long multi-option questions.** Each of the three question screens asked "any bloating, gas, that overly-full feeling, or discomfort after meals?" style lines, plus a catch-all "things people never connect to the gut: skin flare-ups, brain fog, waking up tired?" with three question marks (25 R1 hits).
- **Flourishes and stock phrases.** "I love hearing that", "that's completely normal", "here's the thing", "the gut is the foundation of everything", "genuinely", "silently".
- **Invented patient quotes.** "I remember how much it bothered you", "you told us you were tired of..." on all three response steps and `lapsed_commitment` (7 R5 hits). Replaced with "Your notes say..." or removed.
- **Token pile-ups.** Ten `{{rec_*}}` uses. `{{complaint_reference}}` kept in the two transitions because the player fills it from the file.
- **Unparenthesized directions.** "Let them answer, be warm...", "Then respond with empathy:", "Recap everything, including..." as bare lines.
- **Chips did not match.** Chips: Bloating, Energy crashes, Heartburn / reflux, Irregularity, Foods they avoid, Brain fog, Mood / stress, Headaches, Medications. The old questions bundled brain fog with skin and sleep, asked about "neck pain, headaches, or back pain" in one line, and never asked about medications on two of the three screens (3 R10 errors, 3 warnings). All three screens now ask the same nine questions, one per chip, in chip order.
- **Repeated objection tails.** Three niche objections all ended "Does that make sense?". Now: "Can we get you in so we can take a look?", "Would you be open to that?", "Is there anything else on your mind?", "Does that help?", "Does that work for you?". The five `lapsed_*` screens keep the shared "can I make a recommendation" beat by design (same as Skin Tightening) but each has a different recommendation line.

## Decisions
- `resp_coming_back` and `resp_fully_back` use the same text (they did before too); the difference is carried by the transition that follows.
- `lapsed_commitment` no longer makes its own pitch; it only asks why they stopped and hands off to the lapsed_* buttons, which each end with the recommendation.

## What did not change
- Step keys, sort order, every choice `to_step_key`, variant, and choice sort order are byte-identical to the export taken before the rewrite (checked by script).
- No step removed. Objection buttons still route to the same general objections (`obj_cost`, `obj_time`, `obj_spouse`, `obj_other_option`) where they did before.

## Chips
- Lint R10 passes with zero warnings: every chip has exactly one Update-the-File question containing its stem, and the question count equals the chip count on every `digging_in*` screen. No edits to `concern-options.ts` were needed for this niche.

## Result
- `flows:lint` before: see the "Baseline" line. After: 0 errors, 0 warnings.
