---
name: Lead Terms activation across hosts
description: Safe activation order when live and workspace hosts share the legal-version pointer.
---

Publish the attorney's first real Terms document only after every serving
frontend/API host has the terms-aware build. Never publish fixture text in the
shared application schema.

**Why:** Workspace and live hosts share Supabase. Publication is a global
configuration change, not a workspace-only preview change; an older serving API
cannot enforce a feature it does not yet contain.

**How to apply:** Use isolated schemas or browser-intercepted responses for
active-state testing. Finish the code rollout before the owner explicitly
publishes the attorney-approved document. Lead-form acceptance is not a direct
demo access gate and must never be represented as one.
