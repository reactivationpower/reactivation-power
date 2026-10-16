# Massage Therapy Script Audit

## Baseline

- Before word count: 2,912 total.
- Step words: 2,677.
- Button-label words: 235.
- Baseline lint: 81 errors and 10 warnings.

## Long multi-option questions

- `opening_question` combined the main question with three answer options.
- `resp_doing_great` joined sleep and shoulder examples as another question.
- `resp_fully_back` stacked several remembered benefits into one question.
- `focus_areas_bonus` combined several body areas in one question.
- `digging_in_still` repeatedly followed a question with more question fragments.
- `digging_in` added timing, location, sleep, headache, and routine options.
- `making_it_real` contained several long groups of questions.
- `obj_think` asked the patient to choose among several reasons in one sentence.

## Flourishes and intensifiers

- `resp_doing_great` used “feeling two inches taller.”
- `resp_fully_back` said tension “quietly moves back in like it never left.”
- `digging_in_still` used “body talk,” “just a whisper,” and “wave a wand.”
- `cadence_close` called tension “sneaky” and repeated “head start.”
- `comeback_close` claimed “your body remembers” and used “shoulders up around your ears.”
- `making_it_real` used “absolute worst day” and scripted dramatic reactions.
- “Completely” and “honestly” appeared as unnecessary intensifiers.

## Sales stock phrases

- `recommendation` used “honored” and the time-or-money stock line.
- `making_it_real` used “exactly the kind of thing” and “every single day.”
- `cadence_close` used a prevention proverb and a rehearsed rhythm pitch.
- Several screens used over-validation such as “I completely understand.”

## Invented patient quotes or memories

- `resp_coming_back` said “I remember how good you felt.”
- `resp_fully_back` asked the patient to remember several assumed benefits.
- `obj_luxury` said “you told me how much better you felt.”
- `obj_living_with_it` claimed knowledge of how much better the patient felt.
- The rewrite points to notes when past results are mentioned.

## Token pile-ups

- `making_it_real` ended with a legacy `{{rec_pronoun}}` token.
- `recommendation` repeated legacy `{{rec_pronoun}}` and `{{rec_obj}}` tokens.
- `obj_think` used `{{rec_pronoun_cap}}`.
- `obj_send_info` used `{{rec_pronoun}}`.
- No screen required repeated `{{provider_name}}`.

## Coaching directions

- Notes were glued to speech in `resp_doing_great`, both response screens, and both closes.
- `focus_areas_bonus` used unparenthesized “If YES” and “If NO” directions.
- `making_it_real` mixed quoted speech into long coaching notes.
- All objection screens used an unparenthesized “Confirm and continue” direction.
- Several notes explained sales intent instead of giving a short action.

## Clinical and copy vocabulary

- `making_it_real` referred to Tylenol and told the caller to judge symptoms as not normal.
- “Impacting,” “productive,” “full-body reset,” and “self-care” sounded formal or promotional.
- “Protect the rhythm,” “Magic Question,” and “Bridge to Emotion” were trainer-facing titles.
- The rewrite keeps massage-specific language about tension, focus areas, and regular visits.

## Punctuation and quoted lines

- Several spoken sentences used colons to join separate thoughts.
- `making_it_real` relied on long quoted blocks inside directions.
- Objection titles inconsistently quoted the patient's words.
- Multiple sentences used punctuation to hide stacked questions.

## Repeated objection tails

- `obj_time`, `obj_fell_out_habit`, `obj_luxury`, `obj_living_with_it`,
  `obj_think`, and `obj_send_info` shared the same long closing tail.
- Each rewritten objection now has a different short closing check.

## Digging-in chip mismatches

- Both digging screens had six body questions for five chips.
- `digging_in_still` mixed coping and routine questions with chip questions.
- `digging_in` included an unmatched question about when tension returned.
- Questions did not follow the chip order consistently.

## Chips

- The existing chips fit natural massage questions after the rewrite.
- Rewritten order is neck/shoulder tension, low back tension, headaches, sleep, then stress.
- No chip label or spoken phrase change is proposed.