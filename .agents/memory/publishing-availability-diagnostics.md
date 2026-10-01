---
name: Publishing availability diagnostics
description: Distinguishing publishing workspace-availability warnings from application build failures.
---

Treat “The workspace is unavailable” in Publishing separately from application health and validation failures.

**Why:** This warning persisted after a compute restart while managed services were running, the API returned 200, and publishing showed no new build attempt. Stale rebrand test assertions were also present, but that did not establish them as the warning's cause.

**How to apply:** Check recent deployment attempts and workspace health independently. Fix confirmed application errors, but do not promise those changes repair a publishing connection without a new recorded attempt. Avoid speculative publishing configuration changes when there is no failed-build evidence.

An aggregate workspace build without service environment variables is not equivalent to an artifact publishing build.

**Why:** The aggregate command failed on missing PORT while the affected web artifact's production build passed with its configured service environment; the previous successful deployment used artifact-scoped builds.

**How to apply:** Reproduce the configured artifact build with its non-secret service environment before attributing a local aggregate-command failure to publishing.