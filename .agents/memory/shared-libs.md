---
name: Shared workspace libs
description: How to share pure TS between artifacts here (lib/* composite package) and the gotchas hit when consolidating the niche catalog.
---
Rule: anything both the web app and the api-server need (niche chips, matchers, catalogs, types, merge-field logic, formatters) goes in a `lib/*` workspace package, never copied into both `src/lib` dirs. `lib/shared` is the general-purpose home; `lib/niche-catalog` is niche data only.

**Why:** the concern-options / niche-match / service-catalog files were hand-copied and drifted by whole niches (api-server copy still had the banned word "crepey" while the web copy was current); a guard test in the api-server now fails if a per-artifact copy reappears.

**How to apply:**
- New lib = package.json with `exports` pointing at `./src/*.ts`, tsconfig with `composite`/`emitDeclarationOnly`, add to root tsconfig `references`, add `workspace:*` dep to each consumer, `pnpm install --offline`.
- api-server `scripts/flows/*.ts` run under plain `node` (type-stripping), so a lib's barrel must use explicit `.ts` import specifiers and the lib tsconfig needs `allowImportingTsExtensions: true` (fine with `emitDeclarationOnly`).
- Keep libs free of artifact-local types (`@/lib/types`): make functions generic over the minimal structural shape instead.
- Libs compile with `lib: [es2022]` and no DOM types, so a helper that took `FormData` had to be retyped against a structural `{ get, getAll }` interface. Prefer that over adding `dom` to a lib tsconfig.
- When two drifted copies are unified, the web copy was the newer superset both times (the api-server only re-exported the older functions); check which side actually calls the changed code before picking.
- Web-app copies of shared files carried `// @ts-nocheck`; a lib is type-checked strictly by root `tsc --build`, so expect to fix real type errors when moving one.

- The patient/parent `{{pt_*}}` wording tables live in `@workspace/script-tokens` (not in the player). The api-server tooling derives its allowed pt_ list from them, and tests fail when the two tables' key sets differ or a flow file references an undefined pt_ token. Add a new pt_ slot in both tables there; never re-declare it in lint's KNOWN_TOKENS.
- api-server `scripts/flows/*.ts` entry guards (`if (import.meta.url === ...) main()`) must be the LAST statement in the file: under plain node, `const` helpers declared after the guard are in the TDZ when main() runs and crash with 'Cannot access X before initialization'.

- Artifact `typecheck` scripts must run `tsc --build <root tsconfig>` before `tsc -p --noEmit`: project references resolve `@workspace/*` through gitignored `lib/*/dist/*.d.ts`, so a bare `tsc -p` on a fresh checkout (or after a lib schema change) reports phantom "has no exported member" errors. Concurrent tasks can also leave dist stale, so never trust a red per-artifact typecheck until libs are rebuilt.
