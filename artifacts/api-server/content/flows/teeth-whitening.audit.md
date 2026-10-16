# Teeth Whitening: rewrite audit

Flow file: `teeth-whitening.json`. Rewritten against `docs/SCRIPT_STYLE_GUIDE.md`; wording only.

Word count (spoken + notes): 2131 -> 1433. Steps unchanged, routing unchanged, lint 0 errors / 0 warnings.

## Findings (baseline)

- **Long multi-option questions.** Opening question was one 52-word sentence with three answers embedded. "Wave a wand" and "professional's opinion" questions doubled up with follow-ups in the same paragraph.
- **Flourishes / stock phrases.** "I love hearing that", "there's nothing like", "here's the sneaky thing", "here's something most people don't realize", "I'll tell you the same thing I tell everyone", "we'd be honored", "honestly", "completely normal", "I completely understand", "amazing", "we can't wait to see that smile!".
- **Invented past quotes.** "I remember how much you loved your results", "how happy you were when you saw the results", "do you remember how much it bothered you before?". Replaced with "your notes say".
- **Token pile-ups.** Recommendation paragraph used `{{rec_pronoun}}` / `{{rec_obj}}` seven times.
- **Unparenthesized directions.** "If YES:" / "If NO:" on the sensitivity screen, "Confirm and continue:" on every objection, "Then respond with empathy:" on making_it_real.
- **Vocabulary.** "cumulative", "desensitizing treatment", "re-stains" swapped for "builds up", "plan your visit around it", "stains again".
- **Punctuation.** Colon lists ("the morning coffee, the tea, the glass of wine") and semicolons.
- **Repeated objection tails.** Same two-question tail on all five niche objections; each now ends with its own question.
- **Chips.** Teeth Whitening has no concern chips (only the auto Original complaint chip). Left as-is per the task scope; the question screen was cut from six questions to five plain ones. Adding a chip list is a follow-up.
- **Pre-existing dead ends.** `obj_think` and `obj_send_info` have no outgoing choices in the database; not changed (routing is out of scope).

## Applied to every screen

- Titles shortened to a place marker ("Objection: Cost", "The Recommendation").
- Coaching notes moved onto their own parenthesized lines; "Confirm and continue:" / "If YES:" / "Then respond with empathy:" tails rewritten as notes or spoken lines.
- Every `{{rec_*}}` token removed; `{{provider_name}}` named at most once per screen, then "we".
- Objection screens end with one question each and hand booking back to the scheduling step instead of repeating the two-times line.
- Button labels reworded only where they had trainer jargon ("magic question", "yes-yes", "re-ask the scheduling question"); every `to_step_key`, `variant`, and `sort_order` is unchanged.
- Curly quotes kept in button labels; straight apostrophes in spoken text.
