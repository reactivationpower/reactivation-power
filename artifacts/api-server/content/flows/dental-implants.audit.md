# Dental Implants: rewrite audit

Flow file: `dental-implants.json`. Rewritten against `docs/SCRIPT_STYLE_GUIDE.md`; wording only.

Word count (spoken + notes): 1766 -> 1208. Steps unchanged, routing unchanged, lint 0 errors / 0 warnings.

## Findings (baseline)

- **Long multi-option questions.** Opening question was one 40-word sentence with three states. The question screen asked seven questions with follow-ups glued on ("Any tenderness, swelling, or bleeding? Even a little when you floss?").
- **Flourishes / stock phrases.** "I love hearing that", "here's the thing", "silently", "quietly", "I'll tell you the same thing I tell everyone", "waste your time or your money", "honestly", "completely normal", "I completely understand".
- **Invented past quotes.** "I remember how relieved you were to finally have it done". Replaced with a plain statement about the work they invested in.
- **Token pile-ups.** `{{rec_pronoun}}` / `{{rec_obj}}` up to five times on the recommendation.
- **Unparenthesized directions.** "Confirm and continue:", "If they already told you when their last cleaning was, skip this", "Then respond with empathy:" inline with speech.
- **Vocabulary.** "peri-implantitis", "osseointegration", "soft tissue", "bone loss" swapped for "the gum and bone holding it", "living tissue", "early warning signs".
- **Punctuation.** Colon-led explanations and semicolons; the roof-and-gutters analogy kept but split into short sentences.
- **Repeated objection tails.** Both niche objections ended with the same two-question tail; now "Does that make sense?" and "Would you be open to that?".
- **Chips.** No concern chips for this niche; question screens kept at seven plain questions. Adding a chip list is a follow-up.

## Applied to every screen

- Titles shortened to a place marker ("Objection: Cost", "The Recommendation").
- Coaching notes moved onto their own parenthesized lines; "Confirm and continue:" / "If YES:" / "Then respond with empathy:" tails rewritten as notes or spoken lines.
- Every `{{rec_*}}` token removed; `{{provider_name}}` named at most once per screen, then "we".
- Objection screens end with one question each and hand booking back to the scheduling step instead of repeating the two-times line.
- Button labels reworded only where they had trainer jargon ("magic question", "yes-yes", "re-ask the scheduling question"); every `to_step_key`, `variant`, and `sort_order` is unchanged.
- Curly quotes kept in button labels; straight apostrophes in spoken text.
