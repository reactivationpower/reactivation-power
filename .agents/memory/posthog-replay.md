---
name: PostHog replay verification
description: Non-obvious facts needed to verify PostHog replay traffic from a headless browser.
---
Rules and owner decisions live in replit.md ("PostHog session replay"). This file only covers verification.

- Headless Chromium is treated as a bot and its events are dropped silently; use a normal user agent and disable the automation flag when testing.
- Replay snapshots are compressed twice (request body, then inside the snapshot data), so search decoded payloads, not raw requests.

**Why:** these cost several attempts to discover and are not visible in the code.
**How to apply:** any time replay traffic must be proven present or absent.
