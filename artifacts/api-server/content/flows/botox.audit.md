# Botox: rewrite audit

Flow file: `botox.json`. Rewritten against `docs/SCRIPT_STYLE_GUIDE.md`; wording only.

Word count (spoken + notes): 2245 -> 1434. Steps unchanged, routing unchanged, lint 0 errors / 0 warnings.

## Findings (baseline)

- **Long multi-option questions.** Opening question stacked three answers into one 50-word sentence. Question screen bundled two or three questions per paragraph ("Any lines coming back? Between the brows, the forehead, around the eyes?").
- **Flourishes / stock phrases.** "I love hearing that", "that's exactly what we want", "here's the thing", "I'll tell you the same thing I tell everyone", "we'd be honored", "waste your time or your money", "honestly", "completely normal", "every single day".
- **Invented past quotes.** "I remember how much those lines bothered you", "how happy you were when you saw the results". Replaced with "your notes say".
- **Token pile-ups.** `{{rec_pronoun}}` / `{{rec_obj}}` up to five times in one paragraph on the recommendation and objection screens.
- **Unparenthesized directions.** "Confirm and continue: Does that make sense? (Wait for a fast yes.)" on every objection; "If YES:" / "If NO:" branches written as spoken text.
- **Vocabulary.** "cumulative", "dynamic lines", "static lines", "neuromodulator", "maintenance schedule" swapped for "builds up", "lines when you move", "lines at rest", "regular check".
- **Punctuation.** Semicolons and colons mid-sentence; em-dash lists. Split into short sentences.
- **Repeated objection tails.** Every objection ended "Does that make sense? Do you have any other questions or concerns?". Now each ends with its own question.
- **Chips.** Botox had no concern chips, so the tapped concern never flowed into the recommendation. Added a six-chip list (Lines coming back, Dryness / sun spots, Jaw clenching / headaches, An upcoming event, A treatment they asked about, plus the auto Original complaint) that matches the question screen one-to-one, and the recommendation now reads back `{{main_concern}}`.

## Applied to every screen

- Titles shortened to a place marker ("Objection: Cost", "The Recommendation").
- Coaching notes moved onto their own parenthesized lines; "Confirm and continue:" / "If YES:" / "Then respond with empathy:" tails rewritten as notes or spoken lines.
- Every `{{rec_*}}` token removed; `{{provider_name}}` named at most once per screen, then "we".
- Objection screens end with one question each and hand booking back to the scheduling step instead of repeating the two-times line.
- Button labels reworded only where they had trainer jargon ("magic question", "yes-yes", "re-ask the scheduling question"); every `to_step_key`, `variant`, and `sort_order` is unchanged.
- Curly quotes kept in button labels; straight apostrophes in spoken text.
