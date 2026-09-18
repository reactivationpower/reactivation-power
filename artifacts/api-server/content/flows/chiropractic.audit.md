# Chiropractic Script Audit

Baseline: 117 errors and 17 warnings.

Before word count: 4,099 total words.

## Long multi-option questions

- `opening_question` combined the main question with three answer options.
- All three `digging_in*` screens used long lists and stacked follow-up questions.
- `making_it_real` repeatedly offered several time, frequency, work, and home options.
- `obj_injections_surgery` used a long hypothetical question with several promises.
- `obj_think` combined the reason prompt with multiple suggested answers.

## Flourishes and intensifiers

- `resp_doing_great` used “awesome,” “phenomenal,” and “amazing.”
- `transition*` used “obviously” and “absolutely.”
- `making_it_real` used “honestly” and dramatic worst-day framing.
- Several lapsed screens used “completely,” “best reason,” and similar overstatements.

## Sales stock phrases

- `recommendation` used “honored,” daily-help claims, and a time-or-money closer.
- `making_it_real` used a forced “not OK” agreement.
- `lapsed_felt_fine` used “here’s the funny thing.”
- `lapsed_wait_pain` used the “ahead of it instead of behind it” line.

## Invented patient quotes or memories

- `resp_coming_back` and `resp_fully_back` claimed the caller remembered prior improvement.
- Those screens also claimed the patient had felt relieved.
- `lapsed_commitment` claimed the patient had stated a long-term commitment.
- `obj_managing_own` claimed knowledge of how much better the patient had felt.

## Token pile-ups

- `recommendation` repeated legacy `{{rec_*}}` tokens throughout one paragraph.
- `lapsed_cost`, `lapsed_moved`, and several objections used legacy pronoun tokens.
- No screen needed repeated `{{provider_name}}`; the rewrite uses it at most once.

## Unparenthesized coaching directions

- `resp_coming_back` and `resp_fully_back` ended with bare coaching directions.
- Several objections used bare “Confirm and continue” instructions.
- `making_it_real` mixed coaching, sample speech, and quoted responses in single paragraphs.

## Clinical or copy vocabulary

- “Insomnia,” “sleep disturbances,” “evaluated,” and “maintenance visits” sounded clinical.
- “Conservative option,” “strategy,” and “real relief” sounded like sales copy.
- The rewrite keeps plain chiropractic terms such as checks, adjustments, pain, and stiffness.

## Punctuation

- `digging_in*`, `making_it_real`, and objections used colons to join prompts and speech.
- `lapsed_busy` used a semicolon to join two spoken thoughts.
- `making_it_real` contained many quoted lines embedded inside directions.

## Repeated objection tails

- `obj_came_back_stopped`, `obj_fixed_for_good`, `obj_managing_own`, `obj_think`, and `obj_send_info` shared the same tail.
- Each rewritten niche objection now ends with a different short check.
- The lapsed screens also use varied first checks while preserving their routes.

## Digging-in chip mismatches

- Each `digging_in*` screen had seven topics but lint counted only six chip questions.
- The headache prompt’s wording did not match the linter’s generated `headach` stem.
- The old screens contained many extra questions that could not map one-to-one to chips.
- The rewrite follows all seven chips in order, followed by one recap question.

## Chips

- The niche chip list fits the rewritten questions and remains in the correct order.
- No chip label or spoken phrase change is proposed.