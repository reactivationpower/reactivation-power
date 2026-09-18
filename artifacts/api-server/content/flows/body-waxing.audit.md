# Body Waxing: rewrite audit

Flow file: `body-waxing.json`. Rewritten against `docs/SCRIPT_STYLE_GUIDE.md`; wording only.

Word count (spoken + notes): 2434 -> 1632. Steps unchanged, routing unchanged, lint 0 errors / 0 warnings.

## Findings (baseline)

- **Long multi-option questions.** Opening question listed three states in one 46-word sentence. The question screen paired each area with a follow-up in the same breath ("How about the bikini area? Any ingrowns, bumps, irritation?").
- **Flourishes / stock phrases.** "I love hearing that", "that's exactly what we want", "quietly chipping away", "here's the thing", "the same thing I tell everyone", "we'd be honored", "waste your time or your money", "honestly", "completely normal".
- **Invented past quotes.** "I remember how much you loved how smooth it felt", "you told us shaving was driving you crazy". Replaced with "your notes say".
- **Token pile-ups.** `{{rec_pronoun}}` / `{{rec_obj}}` stacked on the recommendation and objection screens.
- **Unparenthesized directions.** "Confirm and continue:", "If yes:", "Recap what they said, then:" mixed into spoken paragraphs.
- **Vocabulary.** "exfoliation regimen", "hair growth cycle", "hyperpigmentation", "maintenance schedule" swapped for "scrubbing", "hair grows in rounds", "dark spots", "regular schedule".
- **Punctuation.** Semicolons, colon lists, and parenthetical asides mid-sentence.
- **Repeated objection tails.** Every objection ended with the same two questions; now one question each, unique per screen.
- **Chips.** Existing chips kept; questions rewritten to match one-to-one in chip order. Two 21-word sentences (the pick line and the cadence close recommendation) were split to pass R2.

## Applied to every screen

- Titles shortened to a place marker ("Objection: Cost", "The Recommendation").
- Coaching notes moved onto their own parenthesized lines; "Confirm and continue:" / "If YES:" / "Then respond with empathy:" tails rewritten as notes or spoken lines.
- Every `{{rec_*}}` token removed; `{{provider_name}}` named at most once per screen, then "we".
- Objection screens end with one question each and hand booking back to the scheduling step instead of repeating the two-times line.
- Button labels reworded only where they had trainer jargon ("magic question", "yes-yes", "re-ask the scheduling question"); every `to_step_key`, `variant`, and `sort_order` is unchanged.
- Curly quotes kept in button labels; straight apostrophes in spoken text.
