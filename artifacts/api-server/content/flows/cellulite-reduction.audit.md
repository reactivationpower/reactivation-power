# Cellulite Reduction: rewrite audit

Style guide: `docs/SCRIPT_STYLE_GUIDE.md`. Flow: `cellulite-reduction.json`.

- **Baseline** `flows:lint cellulite-reduction`: 68 errors / 8 warnings (R2 x21, R7 x12, R4 x11, R5 x8, R1 x8, R8 x6, R10 x2; R2 avg x6, R10 x2)
- **Word count** (all step content): 1,721 -> 1,068

## Findings (before)
- **Long multi-option questions.** `digging_in` asked "the backs of the thighs, the buttocks, that spot just above the knees" in one line, then clothes, then "skin texture, firmness, or dimpling" together, then an event question. The recap pick was the 30-word "completely take care of just one of them" line.
- **Flourishes and stock phrases.** "I love hearing that", "exactly what we want", "that's completely normal", "quietly chipping away", "here's the thing", "absolutely".
- **Invented patient quotes.** "Do you remember how much it bothered you before we worked on it? The outfits you avoided, the angles you didn't want in photos?" and "I remember how great you looked and felt and how proud you were" (8 R5 hits).
- **Token pile-ups.** Six `{{rec_pronoun}}` uses.
- **Unparenthesized directions.** "Let them answer, be warm and non-judgmental, and do NOT try to book yet." as a bare line on two steps; "Then respond with empathy:".
- **Chips already existed** (Backs of thighs, Buttocks, Above the knees, How clothes fit / feel, Skin texture / firmness, The original area) but "The original area" had no question and two questions had no chip (2 R10 errors). `digging_in` now opens with "First, the area we treated. How is that looking these days?" and asks one question per chip.
- **Repeated objection tails.** Same pattern as Red Light; each objection now ends differently.

## Decisions
- This niche keeps its own `review` step (unlike Red Light); it now mirrors the reference Skin Tightening review with a body-image close ("feel good about how you look again").

## What did not change
- Step keys, sort order, every choice `to_step_key`, variant, and choice sort order are byte-identical to the export taken before the rewrite (checked by script).
- No step removed. Objection buttons still route to the same general objections (`obj_cost`, `obj_time`, `obj_spouse`, `obj_other_option`) where they did before.

## Chips
- Lint R10 passes with zero warnings: every chip has exactly one Update-the-File question containing its stem, and the question count equals the chip count on every `digging_in*` screen. No edits to `concern-options.ts` were needed for this niche.

## Result
- `flows:lint` before: see the "Baseline" line. After: 0 errors, 0 warnings.

## Known dead end (pre-existing, not changed)
- `lapsed_commitment` ("Nothing Found: Why Did They Stop?") has a single outgoing button to `scheduling`, with no per-reason `lapsed_*` screens. That is how it was before the rewrite; adding routes is a routing change and out of scope for a text rewrite.
