---
name: Script flow content-as-code
description: Constraints and quirks when rewriting or applying reactivation call scripts (content/flows JSON, lint, apply, player rendering).
---

- Player italicizes a coaching note only when the whole paragraph is wrapped in parentheses; a note glued onto a spoken line renders as speech.
- Choice identity in the DB is not unique on (from_step_key, to_step_key); apply pairs duplicates by sort_order. Keep sort_order stable when rewording labels.
- Lint counts two "?" in one breath (no period between) as one error, so multi-option questions must be stated as a sentence ("I usually hear one of three things. A, B, or C. Which is closest?").
- Demo account only has niche_access for the chiro-family niches; to click-test another niche insert a temporary niche_access row for the demo owner and delete it afterwards.
- Pre-existing dead ends: Skin Tightening obj_think / obj_send_info have no outgoing choices. (hvac/plumbing's unfilled {{asked_by}}/{{practice_phone}} tokens were fixed in the home-services rewrite.)
- The player filters niches by the owner's sector, derived from course_access. To click-test a home_services niche as the demo owner you must also grant the Home Services course temporarily (plus the niche_access row), then delete both. The demo seeder re-upserts its own niche_access set on rebuild, so counts change on their own.
- Home-services niches had no concern chips at all; chips were added in the same order as the digging_in focus buttons so the tapped chip fills {{main_concern}} on the recommendation screen.

**Why:** Text rewrites must never alter routing (no DDL, routing owned by the product); the tooling only updates text in place.
**How to apply:** Any script rewrite: export → edit JSON → flows:lint → flows:apply --dry-run → apply → click through in the player with the niche enabled for the demo owner.
