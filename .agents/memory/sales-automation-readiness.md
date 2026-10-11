---
name: Sales automation enable rules
description: One shared rule list gates enabling automatic texts to unbooked provider-sales leads, on both the server and the settings checklist.
---
The enable requirements for provider-sales automatic texts live in one shared module used by the server action and the Leads → Settings checklist. Change requirements there only; the server rejects with the first unmet item's message.

**Why:** the page once checked fewer things than the server (accepted `ok`/`passed` states, ignored missing checks and the 24-hour freshness rule), so the button could turn on and then fail.

**How to apply:** when adding or changing an enable requirement, edit the shared list and its tests; do not add a separate check in the action or page.
