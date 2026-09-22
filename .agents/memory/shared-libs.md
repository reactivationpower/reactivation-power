---
name: Shared workspace libs
description: How to share pure TS between artifacts here (lib/* composite package) and the gotchas hit when consolidating the niche catalog.
---
Rule: anything both the web app and the api-server need (niche chips, matchers, catalogs) goes in a `lib/*` workspace package, never copied into both `src/lib` dirs.

**Why:** the concern-options / niche-match / service-catalog files were hand-copied and drifted by whole niches (api-server copy still had the banned word "crepey" while the web copy was current); a guard test in the api-server now fails if a per-artifact copy reappears.

**How to apply:**
- New lib = package.json with `exports` pointing at `./src/*.ts`, tsconfig with `composite`/`emitDeclarationOnly`, add to root tsconfig `references`, add `workspace:*` dep to each consumer, `pnpm install --offline`.
- api-server `scripts/flows/*.ts` run under plain `node` (type-stripping), so a lib's barrel must use explicit `.ts` import specifiers and the lib tsconfig needs `allowImportingTsExtensions: true` (fine with `emitDeclarationOnly`).
- Keep libs free of artifact-local types (`@/lib/types`): make functions generic over the minimal structural shape instead.
