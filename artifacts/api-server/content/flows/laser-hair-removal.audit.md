# Laser Hair Removal: rewrite audit

Flow file: `laser-hair-removal.json`. Rewritten against `docs/SCRIPT_STYLE_GUIDE.md`; wording only.

Word count (spoken + notes): 2282 -> 1536. Steps unchanged, routing unchanged, lint 0 errors / 0 warnings.

## Findings (baseline)

- **Long multi-option questions.** Opening question was one 48-word sentence with three answers inside it. The area questions listed five body parts in a row before asking anything.
- **Flourishes / stock phrases.** "I love hearing that", "nothing better than", "the funny thing about hair", "sneaking back", "here's the thing", "I'll tell you the same thing I tell everyone", "be honored if you let", "absolutely", "honestly".
- **Invented past quotes.** "I remember you saying the shaving drove you crazy", "how thrilled you were". Replaced with "your notes say".
- **Token pile-ups.** `{{rec_pronoun}}` four to six times per paragraph on recommendation, cadence close, and objections.
- **Unparenthesized directions.** "Confirm and continue:", "If they hesitate, say:", "Then respond with empathy:" inline with speech.
- **Vocabulary.** "follicle", "dormant", "growth cycle", "hormonal shifts", "maintenance" swapped for "root", "asleep", "hair grows in rounds", "hormone changes", "touch-up".
- **Punctuation.** Colon-led lists and semicolons on almost every screen.
- **Repeated objection tails.** Identical two-question tail on every objection; each now ends differently.
- **Chips.** Eight existing chips kept. Questions rewritten to match them in chip order. "Which areas" had to become "Where are you seeing it most?" because "which area" is excluded from the lint's question count; "back" avoided outside the Back chip's own question.

## Applied to every screen

- Titles shortened to a place marker ("Objection: Cost", "The Recommendation").
- Coaching notes moved onto their own parenthesized lines; "Confirm and continue:" / "If YES:" / "Then respond with empathy:" tails rewritten as notes or spoken lines.
- Every `{{rec_*}}` token removed; `{{provider_name}}` named at most once per screen, then "we".
- Objection screens end with one question each and hand booking back to the scheduling step instead of repeating the two-times line.
- Button labels reworded only where they had trainer jargon ("magic question", "yes-yes", "re-ask the scheduling question"); every `to_step_key`, `variant`, and `sort_order` is unchanged.
- Curly quotes kept in button labels; straight apostrophes in spoken text.
