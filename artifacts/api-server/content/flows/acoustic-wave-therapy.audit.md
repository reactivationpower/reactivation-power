# Acoustic Wave Therapy audit

Baseline: 121 errors and 17 warnings.

Before word count: 3,890 total words.

## Long multi-option questions

- `digging_in*` stacked examples, symptoms, and multiple questions in each paragraph.
- `making_it_real` repeatedly offered long answer menus and stacked questions.
- `recommendation`, `bridge_no`, and `obj_injections_surgery` used long, multi-clause questions.

## Flourishes and intensifiers

- `transition*` used “obviously” and “absolutely.”
- `digging_in*` used “part of the furniture,” “responds beautifully,” and “starts barking.”
- `making_it_real` used “everything was clicking,” “absolute worst day,” and “honestly.”
- Several lapsed screens used heavy validation such as “completely” and “thrilled.”

## Sales stock phrases

- `recommendation` used “honored,” “waste anybody’s time or money,” and an extended close.
- `making_it_real` used “exactly the kind of thing” and “every single day.”
- `lapsed_felt_fine` used “here’s the funny thing.”
- `lapsed_wait_pain` used “stay ahead of it instead of behind it.”

## Invented patient quotes or memories

- `resp_doing_great` asked the patient to remember how bad the problem was.
- `lapsed_commitment` claimed “I remember” and “you told us” several times.
- `obj_managing_own` claimed knowledge of how much better the patient felt.
- `digging_in*` coaching supplied an invented example recap in quotation marks.

## Token pile-ups

- `recommendation` repeated legacy `{{rec_*}}` tokens throughout one paragraph.
- `making_it_real`, all five `lapsed_*` screens, and five objections used legacy `{{rec_*}}` tokens.
- No screen had a repeated `{{provider_name}}`; the larger issue was legacy pronoun substitution.

## Unparenthesized coaching directions

- Every niche objection ended with an unparenthesized “Confirm and continue” direction.
- `making_it_real` included “Then respond with empathy” as visible speech.
- Several notes mixed coaching, sample speech, and explanations in one paragraph.

## Clinical or copy vocabulary

- `digging_in*` used “plantar fasciitis pattern” and “trigger points.”
- `making_it_real` used “experiencing,” “impacting,” and a medication-label argument.
- `bridge_no` used “evaluated.”
- Lapsed screens used “practice members,” “tissue,” “maintain,” and sales-oriented cost comparisons.

## Punctuation

- Colons introduced scripts and coaching in `making_it_real`, `obj_injections_surgery`, and objection tails.
- `lapsed_busy` joined separate thoughts with a semicolon.
- `making_it_real` relied on many quoted lines inside coaching notes.

## Repeated identical objection tails

- `obj_fixed_for_good`, `obj_came_back_stopped`, `obj_managing_own`, `obj_think`, and `obj_send_info` shared the same closing tail.
- The repeated tail combined two questions with an inline coaching note.
- Lapsed screens also repeated the same sequence of check, second reason, permission, and recommendation.

## Digging-in chip mismatches

- All three `digging_in*` screens had eight body questions for seven chips.
- The medication and self-care question had no matching chip.
- “Old injuries” did not match the singular `Old injury` lint stem.
- Questions were not cleanly one-to-one because most included extra examples and follow-up questions.

## Chips

- The existing seven chips fit the intended Acoustic Wave Therapy concerns.
- The rewritten questions follow the chip order and use matching chip words.
- No chip label or spoken phrase change is proposed.