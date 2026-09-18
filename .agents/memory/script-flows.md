---
name: Script flow content-as-code
description: Constraints and quirks when rewriting or applying reactivation call scripts (content/flows JSON, lint, apply, player rendering).
---

- Player italicizes a coaching note only when the whole paragraph is wrapped in parentheses; a note glued onto a spoken line renders as speech.
- Choice identity in the DB is not unique on (from_step_key, to_step_key); apply pairs duplicates by sort_order. Keep sort_order stable when rewording labels.
- Lint counts two "?" in one breath (no period between) as one error, so multi-option questions must be stated as a sentence ("I usually hear one of three things. A, B, or C. Which is closest?").
- Lint R2 counts a `{{token}}` as one word and splits sentences only after `.!?` followed by a capital; comma-joined clauses read as one sentence, so split with a period rather than trimming words.
- Lint R10 chip matching: chip label words are stemmed and stopworded (back/coming/routine dropped, so the "Back" chip matches the literal word "back" — keep "back" out of other questions); "Which area(s)…" lines are excluded from the question count, so open a question with "Where…" instead.
- Dental parent-mode flows: the `{{pt_*_q}}` stacked-question tokens render multi-question text that fails the guide; write plain questions with only the short pronoun tokens (pt_you / pt_your / pt_them / pt_your_file / pt_get_you_in / pt_no_fault). Avoid verb agreement after `{{pt_you}}` ("your child notice"); phrase as "Does it come up…". Start `{{pt_no_fault}}` after "and", never as a sentence opener (it is lowercase).
- Demo account only has niche_access for the chiro-family niches (Chiropractic, Decompression, Joint Pain, Neuropathy, ChiroThin, Gut Health, Red Light); to click-test another niche insert a temporary niche_access row for the demo owner and delete it afterwards. The demo owner may already carry temp rows from other batches; only delete the rows you inserted.
- The player filters niches by the owner's sector, derived from course_access. To click-test a home_services niche as the demo owner you must also grant the Home Services course temporarily (plus the niche_access row), then delete both. The demo seeder re-upserts its own niche_access set on rebuild, so counts change on their own.
- Player click-through route is `/portal/dialer/script` (not `/portal/script`); demo login is `/demo` with the DEMO_PASSWORD secret. The testing subagent times out on exhaustive branch traversal; give it one niche and a few branches per round, and rely on the programmatic routing-identity check (git HEAD vs JSON) for the rest.
- Home-services niches had no concern chips at all; chips were added in the same order as the digging_in focus buttons so the tapped chip fills {{main_concern}} on the recommendation screen.
- Pre-existing dead ends: obj_think / obj_send_info have no outgoing choices in any niche; also chiropractic + decompression obj_came_back_stopped/obj_managing_own and Acoustic Wave obj_fixed_for_good/obj_came_back_stopped/obj_managing_own/obj_injections_surgery. Red Light / Cellulite lapsed_commitment has one button straight to scheduling (no lapsed_* screens). (hvac/plumbing's unfilled {{asked_by}}/{{practice_phone}} tokens were fixed in the home-services rewrite.)

- Routing additions (new choices) are fine when the task is explicitly a routing task: add the choice object to the JSON with the next sort_order and flows:apply inserts it; re-export afterwards to confirm the JSON round-trips. If a screen's coaching note names the URGENT button, that screen must have its own `urgent` choice.
- The API Server workflow is often stopped between sessions; a demo sign-in "Request failed (502)" in the player means restart it, not an app bug.

**Why:** Text rewrites must never alter routing (no DDL, routing owned by the product); the tooling only updates text in place.
**How to apply:** Any script rewrite: export → edit JSON → flows:lint → flows:apply --dry-run → apply → click through in the player with the niche enabled for the demo owner.
