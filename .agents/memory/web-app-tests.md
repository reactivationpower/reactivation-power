---
name: Web app unit tests
description: How the reactivation-power web app runs vitest (jsdom + Testing Library) separately from the dev vite config.
---
- The web app has a standalone vitest.config.ts; it must NOT import vite.config.ts, which throws at import time when PORT/BASE_PATH are unset.
- Root `pnpm run test` fans out to every artifact's `test` script; validation commands `typecheck`, `test` and `flows-lint` (api-server `flows:lint --quiet`) are registered.
- Player render tests assert on `container.textContent` (script paragraphs may be split across inline elements), and tap chips via `getByRole('button', { name })`.

**Why:** Sector-specific wording ("came out for" vs "came in for") was previously unguarded; a render test through ScriptFlowPlayer catches a dropped `sector` prop or changed fallback logic.
**How to apply:** Add `*.test.ts(x)` beside the source; `pnpm --filter @workspace/reactivation-power test`.

- api-server vitest also picks up `scripts/**/*.test.ts`; flow-tooling scripts must guard their `main()` behind an entry-script check so tests can import their rules.

- If a web-app test fails with "Failed to resolve import @workspace/<lib>", the workspace symlink under the artifact's node_modules/@workspace is missing (type-only imports in source hide it). Run `pnpm install --offline` at the root to restore it; no package.json change needed.
- "Other…" concern type-in is guarded by a render test (type → change event, then tap a routing button); the CONCERN_FALLBACK and per-sector complaint fallbacks are asserted after clearing the box.

Limit jsdom worker fan-out before increasing individual test deadlines when simple mocked UI tests time out only during full configured validation.

**Why:** Concurrent typechecking, API tests, and unrestricted jsdom startup can overload the workspace and cause false timeouts in unrelated, otherwise passing UI tests.

**How to apply:** Diagnose timing-only failures against the validation workload; keep worker concurrency bounded instead of masking contention with longer deadlines.

Prefer static imports for mocked external-service dependencies in concurrent integration tests, and reject unexpected network requests in the fixture.

**Why:** Concurrent dynamic imports in the booking test bypassed the availability mock for one caller; making the dependency static eliminated the unexpected provider read.

**How to apply:** When a mocked concurrent test unexpectedly returns real availability or other external data, check import/mocking consistency rather than assuming a business-rule failure.

Database fixtures must be unique per test invocation, not just per test file.

**Why:** Parallel workspaces share Supabase. Fixed owner IDs let one suite's cleanup delete another suite's in-flight campaigns; scheduler tests also see global running-job rows despite distinct due keys.

**How to apply:** Use random fixture owners for owner-scoped data and isolated schemas for global queries such as scheduled-job claims. Keep cleanup confined to the invocation's fixtures.

Full-suite UI tests have much more CPU contention than focused runs. Avoid repeated whole-page accessibility scans inside large template loops, and control delayed copy-feedback timers in tests.

**Why:** Full-suite validation timed out loops that passed alone; faster loops then exposed a delayed React state update after jsdom teardown (`window is not defined`).

**How to apply:** Resolve stable picker/copy controls once per render, await clipboard state updates with `act`, and use fake timers with explicit cleanup for delayed feedback. Do not merely raise timeouts or ignore uncaught errors.

Time-sensitive database tests must control both JavaScript time and SQL time, and must arrange delivery conditions before a worker wake.

**Why:** Freezing only JavaScript Date allowed real database time to pass queued confirmations before test opt-outs or uncertain responses were installed. The same safety tests then passed or failed depending on the day and time.

**How to apply:** Use a clock confined to the unique fixture schema, with `pg_catalog` explicitly last in its search path when overriding SQL `now()`. Advance both clocks together. Plan without dispatch when a test needs to modify a pending delivery; do not assume the first worker wake only plans.
