---
name: Web app unit tests
description: How the reactivation-power web app runs vitest (jsdom + Testing Library) separately from the dev vite config.
---
- The web app has a standalone vitest.config.ts; it must NOT import vite.config.ts, which throws at import time when PORT/BASE_PATH are unset.
- Root `pnpm run test` fans out to every artifact's `test` script; validation commands `typecheck` and `test` are registered.
- Player render tests assert on `container.textContent` (script paragraphs may be split across inline elements), and tap chips via `getByRole('button', { name })`.

**Why:** Sector-specific wording ("came out for" vs "came in for") was previously unguarded; a render test through ScriptFlowPlayer catches a dropped `sector` prop or changed fallback logic.
**How to apply:** Add `*.test.ts(x)` beside the source; `pnpm --filter @workspace/reactivation-power test`.

- api-server vitest also picks up `scripts/**/*.test.ts`; flow-tooling scripts must guard their `main()` behind an entry-script check so tests can import their rules.
