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
