# Orthodontics / Braces: rewrite audit

Flow file: `orthodontics-braces.json`. Rewritten against `docs/SCRIPT_STYLE_GUIDE.md`; wording only.

Word count (spoken + notes): 1647 -> 1235. Steps unchanged, routing unchanged, lint 0 errors / 0 warnings.

## Findings (baseline)

- **Long multi-option questions.** Opening question stacked three answers with a `{{pt_moved_back_q}}` token. Question screens used stacked-question tokens (`{{pt_retainer_q}}`, `{{pt_bite_q}}`, `{{pt_jaw_q}}`, `{{pt_floss_q}}`, `{{pt_photos_q}}`, `{{pt_mir_q1..3}}`, `{{pt_bridge_q}}`) that rendered as two or three questions plus a metaphor each.
- **Flourishes / stock phrases.** "I love hearing that", "completely normal", "absolutely", "thrilled", "waste your time or your money", "honestly", "every single day", "that yes is the moment".
- **Invented past quotes.** "I remember how great that smile looked the day the braces came off". Replaced with "your notes say".
- **Token pile-ups.** `{{rec_pronoun}}` on the recommendation and objections; stacked-question tokens replaced with plain text using only the short pronoun tokens so parent mode still reads correctly.
- **Unparenthesized directions.** "Confirm and continue:", "Then respond with empathy:", "Do NOT quote prices" inline with speech.
- **Vocabulary.** "relapse", "retention phase", "non-judgmental" swapped for "shifting", "the retainer routine", removed.
- **Punctuation.** Semicolons before `{{pt_no_fault}}`; colon lists.
- **Repeated objection tails.** Three niche objections ("Braces again?", "How long?", "routine slipped") ended by re-asking the two-times line; now each ends with a different question ("Does that make sense?", "Does that seem fair?", "Would you be open to that?").
- **Chips.** No concern chips for this niche; question screens kept at six plain questions. Adding a chip list is a follow-up.

## Applied to every screen

- Titles shortened to a place marker ("Objection: Cost", "The Recommendation").
- Coaching notes moved onto their own parenthesized lines; "Confirm and continue:" / "If YES:" / "Then respond with empathy:" tails rewritten as notes or spoken lines.
- Every `{{rec_*}}` token removed; `{{provider_name}}` named at most once per screen, then "we".
- Objection screens end with one question each and hand booking back to the scheduling step instead of repeating the two-times line.
- Button labels reworded only where they had trainer jargon ("magic question", "yes-yes", "re-ask the scheduling question"); every `to_step_key`, `variant`, and `sort_order` is unchanged.
- Curly quotes kept in button labels; straight apostrophes in spoken text.
