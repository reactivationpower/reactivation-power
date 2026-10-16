# Clear Aligners: rewrite audit

Flow file: `clear-aligners.json`. Rewritten against `docs/SCRIPT_STYLE_GUIDE.md`; wording only.

Word count (spoken + notes): 1626 -> 1257. Steps unchanged, routing unchanged, lint 0 errors / 0 warnings.

## Findings (baseline)

- **Long multi-option questions.** Opening question folded three answers plus a `{{pt_moved_back_q}}` token into one sentence. Question screen leaned on stacked-question tokens (`{{pt_floss_q}}`, `{{pt_bite_q}}`, `{{pt_jaw_q}}`, `{{pt_al_photos_q}}`, `{{pt_mir_q1..3}}`, `{{pt_bridge_q}}`) whose rendered text was two or three questions each with metaphors ("teeth are like books on a shelf").
- **Flourishes / stock phrases.** "I love hearing that", "completely normal", "absolutely", "thrilled", "waste your time or your money", "honestly", "every single day", "that yes is the moment".
- **Invented past quotes.** "I remember how great that smile looked when you finished" (twice). Replaced with "your notes say".
- **Token pile-ups.** `{{rec_pronoun_cap}}` on the niche's own scheduling screen; stacked-question tokens replaced with plain text that uses only the short pronoun tokens (`{{pt_you}}`, `{{pt_your}}`, `{{pt_them}}`, `{{pt_your_file}}`, `{{pt_get_you_in}}`, `{{pt_no_fault}}`) so parent mode still reads correctly.
- **Unparenthesized directions.** "Confirm and continue:", "Then respond with empathy:", "Do NOT try to book yet" mixed into speech; "be warm and non-judgmental" (swap-table word).
- **Vocabulary.** "refinement" kept (it is the everyday word patients hear), "non-judgmental" removed, "yes-yes options" removed from the scheduling note.
- **Punctuation.** Semicolons joining `{{pt_no_fault}}` to the sentence before it; rewritten so the token starts after "and".
- **Repeated objection tails.** Both niche objections ended by re-asking the two-times scheduling line; now each ends with one question and the Resolved button returns to scheduling.
- **Chips.** No concern chips for this niche; question screen kept at six plain questions. Adding a chip list is a follow-up.

## Applied to every screen

- Titles shortened to a place marker ("Objection: Cost", "The Recommendation").
- Coaching notes moved onto their own parenthesized lines; "Confirm and continue:" / "If YES:" / "Then respond with empathy:" tails rewritten as notes or spoken lines.
- Every `{{rec_*}}` token removed; `{{provider_name}}` named at most once per screen, then "we".
- Objection screens end with one question each and hand booking back to the scheduling step instead of repeating the two-times line.
- Button labels reworded only where they had trainer jargon ("magic question", "yes-yes", "re-ask the scheduling question"); every `to_step_key`, `variant`, and `sort_order` is unchanged.
- Curly quotes kept in button labels; straight apostrophes in spoken text.
